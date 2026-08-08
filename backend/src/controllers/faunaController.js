const yup = require('yup');
const { Op } = require('sequelize');
const { FaunaSighting } = require('../models');
const { getGeminiClient } = require('../config/gemini');
const { sendEmail } = require('../services/emailService');
const { INTERNAL_ROLES, getAssignedBlocks } = require('../middleware/auth');

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
  // Required to match the resident report convention - a sighting always needs a
  // description. Trimmed first, so whitespace-only notes fail the required test.
  notes: yup.string().required().trim().max(500),
});

// Roles trusted with the exact location of community cats. Welfare Partners are
// included because their access is already bounded by their assigned blocks -
// the zone filter is their control, not field-stripping.
const FULL_GPS_ROLES = [...INTERNAL_ROLES, 'welfare_partner'];

// RBAC: for any other role viewing a cat sighting, gps_lat/gps_lng are nulled
// before returning. Returns a plain object so the model instance is untouched.
function stripCatGps(sighting, role) {
  const data = sighting.toJSON();
  if (!FULL_GPS_ROLES.includes(role) && data.species === 'cat') {
    data.gps_lat = null;
    data.gps_lng = null;
  }
  return data;
}

async function listSightings(req, res) {
  const where = { is_deleted: false };

  // A Welfare Partner is scoped to their assigned blocks rather than to their
  // own submissions - the zone is their access boundary. null means the role
  // carries no zone restriction at all.
  const assignedBlocks = await getAssignedBlocks(req.user);
  if (assignedBlocks === null && !INTERNAL_ROLES.includes(req.user.role)) {
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

  // Optional recency window, mirroring the cutoff in getHotspots so a caller can
  // line this list up with the hotspot counts. Absent leaves the list unfiltered
  // - the default stays "every sighting". A non-numeric or non-positive value is
  // ignored for the same reason, so a bad param can never build a future cutoff
  // and silently return nothing.
  const days = parseInt(req.query.days, 10);
  if (Number.isFinite(days) && days > 0) {
    where.createdAt = { [Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  // Applied after the query filters so a block_number param can never widen the
  // zone. No assigned blocks means no visible sightings, not unrestricted.
  if (assignedBlocks !== null) {
    if (req.query.block_number && !assignedBlocks.includes(req.query.block_number)) {
      return res.status(200).json([]);
    }
    if (assignedBlocks.length === 0) {
      return res.status(200).json([]);
    }
    where.block_number = req.query.block_number || { [Op.in]: assignedBlocks };
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
  // A Welfare Partner may read anything inside their zone and nothing outside
  // it; with no assigned blocks, includes() is false and everything is denied.
  const assignedBlocks = await getAssignedBlocks(req.user);
  if (assignedBlocks !== null) {
    if (!assignedBlocks.includes(sighting.block_number)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } else if (!INTERNAL_ROLES.includes(req.user.role) && sighting.reported_by !== req.user.user_id) {
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

  // A Welfare Partner may only log sightings for a block they cover.
  const assignedBlocks = await getAssignedBlocks(req.user);
  if (assignedBlocks !== null && !assignedBlocks.includes(data.block_number)) {
    return res.status(403).json({ error: 'Forbidden' });
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
  // Absent, non-numeric, zero or negative falls back to the default rather than
  // building a future cutoff that matches nothing.
  const requested = parseInt(req.query.days, 10);
  const days = Number.isFinite(requested) && requested > 0 ? requested : 30;
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

// Lists the sightings behind a block hotspot, newest first. Display-only: it
// never mutates a sighting or its tags.
async function getBlockSightings(req, res) {
  const block = req.params.block;

  // Same window as getHotspots, and the same 30-day default, so the drill-down
  // lists exactly the sightings the block card counted. A non-numeric, negative
  // or zero value falls back to the default rather than building a future cutoff.
  const requested = parseInt(req.query.days, 10);
  const days = Number.isFinite(requested) && requested > 0 ? requested : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sightings = await FaunaSighting.findAll({
    where: {
      is_deleted: false,
      block_number: block,
      createdAt: { [Op.gte]: cutoff },
    },
    attributes: ['id', 'species', 'block_number', 'floor_level', 'behaviour_tags', 'notes', 'createdAt'],
    include: [{ association: 'reporter', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });

  return res.status(200).json(sightings.map((s) => ({
    ...s.toJSON(),
    untagged_mentions: findUntaggedMentions(s.notes, s.behaviour_tags),
  })));
}

// Behaviour keywords named in the notes but missing from behaviour_tags. A hint
// for staff that a sighting may be under-tagged; nothing is changed on the row.
function findUntaggedMentions(notes, tags) {
  if (!notes) return [];
  const text = notes.toLowerCase();
  const tagged = tags || [];
  return BEHAVIOUR_TAGS.filter((tag) => text.includes(tag) && !tagged.includes(tag));
}

// Behaviour tags that carry their own severity regardless of volume. Aggression
// escalates a block straight to urgent; nesting only warrants monitoring.
const URGENT_TAG = 'aggressive';
const MONITOR_TAG = 'nesting';

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

  // Volume-driven, escalated by behaviour severity. Alongside the level we work
  // out WHY it was assigned, so the AI prompt can justify it instead of just
  // restating the label back at the reader.
  const n = sightings.length;
  const volume = `${n} ${n === 1 ? 'sighting' : 'sightings'} in the last ${days} days`;
  const hasAggressive = tagCounts[URGENT_TAG] > 0;
  const hasNesting = tagCounts[MONITOR_TAG] > 0;

  let risk_level;
  let risk_reason;
  if (n >= 8 || hasAggressive) {
    risk_level = 'urgent';
    if (hasAggressive && n >= 8) {
      risk_reason = `aggressive behaviour was reported and the block is busy with ${volume}`;
    } else if (hasAggressive) {
      risk_reason = `aggressive behaviour was reported, which is treated as urgent even though overall volume is modest at ${volume}`;
    } else {
      risk_reason = `sighting volume is high, with ${volume}`;
    }
  } else if (n >= 4 || hasNesting) {
    risk_level = 'monitor';
    if (hasNesting && n >= 4) {
      risk_reason = `nesting activity was reported alongside a moderate ${volume}`;
    } else if (hasNesting) {
      risk_reason = `nesting activity was reported, which warrants monitoring despite a low overall volume of ${volume}`;
    } else {
      risk_reason = `sighting volume is moderate, with ${volume}, and no aggressive or nesting behaviour was reported`;
    }
  } else {
    risk_level = 'routine';
    risk_reason = `activity is low, with only ${volume}, and no aggressive or nesting behaviour was reported`;
  }

  return {
    count: n,
    speciesCounts,
    tagCounts,
    agency_recommendation,
    speciesLine,
    tagLine,
    risk_level,
    risk_reason,
  };
}

async function getBlockSummary(req, res) {
  const block = req.params.block;
  // Absent, non-numeric, zero or negative falls back to the default rather than
  // building a future cutoff that matches nothing.
  const requested = parseInt(req.query.days, 10);
  const days = Number.isFinite(requested) && requested > 0 ? requested : 30;

  const agg = await aggregateBlock(block, days);
  if (!agg) {
    return res.status(404).json({ error: 'No sightings found for this block' });
  }
  const { agency_recommendation, tagCounts, speciesLine, tagLine, risk_level, risk_reason } = agg;

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
    `Assessed risk level: ${risk_level}\n` +
    `Why that level was assigned: ${risk_reason}\n\n` +
    'Write a one-paragraph summary of the recent fauna activity in this block for ' +
    'estate staff, noting the dominant species and any notable behaviours. Explain ' +
    'the reasoning above in your own words so the reader understands what drove the ' +
    'level. Do not justify the level by naming it; give the underlying reason.';

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
    behaviour_tags: Object.keys(tagCounts),
    agency_recommendation,
    sighting_count: agg.count,
    period_days: days,
  });
}

// Generates an editable email draft for a block. Does not send anything.
async function getBlockAlertDraft(req, res) {
  const block = req.params.block;
  // Absent, non-numeric, zero or negative falls back to the default rather than
  // building a future cutoff that matches nothing.
  const requested = parseInt(req.query.days, 10);
  const days = Number.isFinite(requested) && requested > 0 ? requested : 30;

  const agg = await aggregateBlock(block, days);
  if (!agg) {
    return res.status(404).json({ error: 'No sightings found for this block' });
  }
  const { agency_recommendation, speciesLine, tagLine, risk_level, risk_reason } = agg;

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
    `Why that level was assigned: ${risk_reason}\n` +
    `Agency recommendation: ${agencyLine}\n\n` +
    'Draft the alert email for estate staff, stating the risk level, the reason ' +
    'it was assigned explained in your own words, the key observations, and the ' +
    'recommended agency to contact. Do not justify the level by naming it; give ' +
    'the underlying reason.';

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
  getBlockSightings,
  getBlockSummary,
  getBlockAlertDraft,
  sendBlockAlert,
};
