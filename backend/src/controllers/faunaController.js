const yup = require('yup');
const { Op } = require('sequelize');
const { FaunaSighting } = require('../models');
const { getGeminiClient } = require('../config/gemini');

const STATUSES = ['open', 'in_progress', 'resolved'];

// Which agency handles each species. Derived at the API layer (not stored).
const AGENCY_MAP = {
  cat: 'Cat Welfare Society / SPCA',
  pigeon: 'ACRES',
  crow: 'ACRES',
  mynah: 'ACRES',
  other: 'Town Council to assess',
};

const statusSchema = yup.object({
  status: yup.string().required().oneOf(STATUSES),
});

// RBAC: residents must not see the exact location of community cats. For a
// resident viewing a cat sighting, gps_lat/gps_lng are nulled before returning.
// Returns a plain object so the model instance is left untouched.
function stripCatGps(sighting, role) {
  const data = sighting.toJSON();
  if (role === 'resident' && data.species === 'cat') {
    data.gps_lat = null;
    data.gps_lng = null;
  }
  return data;
}

async function listSightings(req, res) {
  const where = { is_deleted: false };

  if (req.user.role === 'resident') {
    where.reported_by = req.user.user_id;
  }
  if (req.query.species) {
    where.species = req.query.species;
  }
  if (req.query.status) {
    where.status = req.query.status;
  }
  if (req.query.block_number) {
    where.block_number = req.query.block_number;
  }

  const sightings = await FaunaSighting.findAll({
    where,
    include: [{ association: 'reporter', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });

  return res.status(200).json(sightings.map((s) => stripCatGps(s, req.user.role)));
}

async function getSighting(req, res) {
  const sighting = await FaunaSighting.findOne({
    where: { id: req.params.id, is_deleted: false },
    include: [{ association: 'reporter', attributes: ['id', 'name'] }],
  });

  if (!sighting) {
    return res.status(404).json({ error: 'Sighting not found' });
  }
  if (req.user.role === 'resident' && sighting.reported_by !== req.user.user_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.status(200).json(stripCatGps(sighting, req.user.role));
}

async function updateStatus(req, res) {
  let data;
  try {
    data = await statusSchema.validate(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const sighting = await FaunaSighting.findOne({
    where: { id: req.params.id, is_deleted: false },
  });
  if (!sighting) {
    return res.status(404).json({ error: 'Sighting not found' });
  }

  sighting.status = data.status;
  await sighting.save();

  return res.status(200).json(sighting);
}

async function softDeleteSighting(req, res) {
  const sighting = await FaunaSighting.findOne({
    where: { id: req.params.id, is_deleted: false },
  });
  if (!sighting) {
    return res.status(404).json({ error: 'Sighting not found' });
  }

  sighting.is_deleted = true;
  await sighting.save();

  return res.status(200).json({ message: 'Sighting deleted' });
}

async function getHotspots(req, res) {
  const days = parseInt(req.query.days, 10) || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sightings = await FaunaSighting.findAll({
    where: {
      is_deleted: false,
      createdAt: { [Op.gte]: cutoff },
    },
    attributes: ['block_number', 'species'],
  });

  // Group by block, counting total and a per-species breakdown. A sighting with
  // no block_number is filed under 'Unknown'.
  const blocks = {};
  for (const s of sightings) {
    const key = s.block_number || 'Unknown';
    const block = blocks[key] || (blocks[key] = { total: 0, breakdown: {} });
    block.total += 1;
    block.breakdown[s.species] = (block.breakdown[s.species] || 0) + 1;
  }

  const hotspots = Object.entries(blocks)
    .map(([block_number, { total, breakdown }]) => ({ block_number, total, breakdown }))
    .sort((a, b) => b.total - a.total);

  return res.status(200).json(hotspots);
}

async function getBlockSummary(req, res) {
  const block = req.params.block;
  const days = parseInt(req.query.days, 10) || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sightings = await FaunaSighting.findAll({
    where: {
      is_deleted: false,
      block_number: block,
      createdAt: { [Op.gte]: cutoff },
    },
    attributes: ['species', 'behaviour_tags', 'floor_level'],
  });

  if (sightings.length === 0) {
    return res.status(404).json({ error: 'No sightings found for this block' });
  }

  // Aggregate what happened in this block to feed the prompt, and build the
  // agency recommendation for the species actually present.
  const speciesCounts = {};
  const tagCounts = {};
  const agency_recommendation = {};
  for (const s of sightings) {
    speciesCounts[s.species] = (speciesCounts[s.species] || 0) + 1;
    agency_recommendation[s.species] = AGENCY_MAP[s.species];
    for (const tag of s.behaviour_tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const speciesLine = Object.entries(speciesCounts)
    .map(([sp, n]) => `${sp}: ${n}`)
    .join(', ');
  const tagLine = Object.entries(tagCounts)
    .map(([tag, n]) => `${tag}: ${n}`)
    .join(', ') || 'none recorded';

  const systemInstruction =
    'You are an estate management assistant for a town council. Summarise fauna ' +
    'sighting activity for a residential block in one short paragraph of plain ' +
    'English (3-4 sentences). Be factual and concise. Do not use markdown, bullet ' +
    'points, or an em dash.';

  const prompt =
    `Block: ${block}\n` +
    `Period: last ${days} days\n` +
    `Total sightings: ${sightings.length}\n` +
    `Species breakdown: ${speciesLine}\n` +
    `Behaviour tags: ${tagLine}\n\n` +
    'Write a one-paragraph summary of the recent fauna activity in this block for ' +
    'estate staff, noting the dominant species and any notable behaviours.';

  let summary;
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
      },
    });
    summary = response.text;
  } catch (err) {
    console.error('Gemini summary failed:', err.message);
    return res.status(503).json({ error: 'AI summary unavailable. Please try again later.' });
  }

  return res.status(200).json({
    block,
    summary,
    agency_recommendation,
    sighting_count: sightings.length,
    period_days: days,
  });
}

module.exports = {
  listSightings,
  getSighting,
  updateStatus,
  softDeleteSighting,
  getHotspots,
  getBlockSummary,
};
