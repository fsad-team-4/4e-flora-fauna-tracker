const yup = require('yup');
const { Op } = require('sequelize');
const { FaunaSighting } = require('../models');
const { getGeminiClient } = require('../config/gemini');
const { sendEmail } = require('../services/emailService');

const STATUSES = ['open', 'in_progress', 'resolved'];
const SPECIES = ['cat', 'pigeon', 'crow', 'mynah', 'other'];
const BEHAVIOUR_TAGS = ['urinating', 'feeding', 'nesting', 'droppings', 'aggressive'];

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

const createSchema = yup.object({
  species: yup.string().required().oneOf(SPECIES),
  block_number: yup.string().required(),
  floor_level: yup.string().optional(),
  behaviour_tags: yup.array().of(yup.string().oneOf(BEHAVIOUR_TAGS)).optional(),
  gps_lat: yup.number().optional(),
  gps_lng: yup.number().optional(),
  photo_url: yup.string().url().optional(),
  notes: yup.string().max(500).optional(),
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

async function createSighting(req, res) {
  let data;
  try {
    data = await createSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const sighting = await FaunaSighting.create({
    ...data,
    behaviour_tags: data.behaviour_tags || [],
    reported_by: req.user.user_id,
  });

  return res.status(201).json(sighting);
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

// Behaviour tags that make a block high risk on their own, regardless of volume.
const HIGH_RISK_TAGS = ['aggressive', 'nesting'];

// Shared aggregation for a block over a window. Returns null when the block has
// no sightings in the window. Used by both the AI summary and the alert draft.
async function aggregateBlock(block, days) {
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
    return null;
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

  // Volume-driven, but any aggressive or nesting behaviour escalates to high.
  const hasHighRiskTag = HIGH_RISK_TAGS.some((tag) => tagCounts[tag] > 0);
  let risk_level;
  if (sightings.length >= 8 || hasHighRiskTag) {
    risk_level = 'high';
  } else if (sightings.length >= 4) {
    risk_level = 'medium';
  } else {
    risk_level = 'low';
  }

  return {
    count: sightings.length,
    speciesCounts,
    tagCounts,
    agency_recommendation,
    speciesLine,
    tagLine,
    risk_level,
  };
}

async function getBlockSummary(req, res) {
  const block = req.params.block;
  const days = parseInt(req.query.days, 10) || 30;

  const agg = await aggregateBlock(block, days);
  if (!agg) {
    return res.status(404).json({ error: 'No sightings found for this block' });
  }
  const { agency_recommendation, speciesLine, tagLine, risk_level } = agg;

  const systemInstruction =
    'You are an estate management assistant for a town council. Summarise fauna ' +
    'sighting activity for a residential block in one short paragraph of plain ' +
    'English (3-4 sentences). Be factual and concise. Do not use markdown, bullet ' +
    'points, or an em dash.';

  const prompt =
    `Block: ${block}\n` +
    `Period: last ${days} days\n` +
    `Total sightings: ${agg.count}\n` +
    `Species breakdown: ${speciesLine}\n` +
    `Behaviour tags: ${tagLine}\n` +
    `Assessed risk level: ${risk_level}\n\n` +
    'Write a one-paragraph summary of the recent fauna activity in this block for ' +
    'estate staff, noting the dominant species and any notable behaviours. Reflect ' +
    'the assessed risk level in the tone and wording of the summary.';

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
    risk_level,
    agency_recommendation,
    sighting_count: agg.count,
    period_days: days,
  });
}

// Generates an editable email draft for a block. Does not send anything.
async function getBlockAlertDraft(req, res) {
  const block = req.params.block;
  const days = parseInt(req.query.days, 10) || 30;

  const agg = await aggregateBlock(block, days);
  if (!agg) {
    return res.status(404).json({ error: 'No sightings found for this block' });
  }
  const { agency_recommendation, speciesLine, tagLine, risk_level } = agg;

  const agencyLine = Object.entries(agency_recommendation)
    .map(([sp, agency]) => `${sp}: ${agency}`)
    .join(', ');

  const systemInstruction =
    'You are an estate management assistant for a town council. Draft a short ' +
    'internal alert email to estate staff about fauna activity in a block. ' +
    'Reply with a subject line on the first line prefixed with "Subject: ", then ' +
    'a blank line, then the email body as plain text with newlines. Do not use ' +
    'markdown, HTML, bullet characters, or an em dash.';

  const prompt =
    `Block: ${block}\n` +
    `Period: last ${days} days\n` +
    `Total sightings: ${agg.count}\n` +
    `Species breakdown: ${speciesLine}\n` +
    `Behaviour tags: ${tagLine}\n` +
    `Assessed risk level: ${risk_level}\n` +
    `Agency recommendation: ${agencyLine}\n\n` +
    'Draft the alert email for estate staff, stating the risk level, the key ' +
    'observations, and the recommended agency to contact.';

  let text;
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
      },
    });
    text = response.text;
  } catch (err) {
    console.error('Gemini alert draft failed:', err.message);
    return res.status(503).json({ error: 'AI summary unavailable. Please try again later.' });
  }

  // Split the "Subject: ..." first line off the body; fall back to a plain
  // subject if the model did not follow the format.
  const match = /^\s*Subject:\s*(.+?)\n([\s\S]*)$/.exec(text || '');
  const subject = match ? match[1].trim() : `Fauna alert - Block ${block} (${risk_level} risk)`;
  const body = (match ? match[2] : text || '').trim();

  return res.status(200).json({ subject, body, risk_level });
}

const alertSendSchema = yup.object({
  to: yup.string().required().email(),
  subject: yup.string().required(),
  body: yup.string().required(),
});

// Sends the staff-edited draft using the shared email service.
async function sendBlockAlert(req, res) {
  let data;
  try {
    data = await alertSendSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  try {
    await sendEmail(data);
  } catch (err) {
    console.error('Fauna alert send failed:', err.message);
    return res.status(500).json({ error: 'Failed to send alert email' });
  }

  return res.status(200).json({ ok: true });
}

module.exports = {
  listSightings,
  getSighting,
  createSighting,
  updateStatus,
  softDeleteSighting,
  getHotspots,
  getBlockSummary,
  getBlockAlertDraft,
  sendBlockAlert,
};
