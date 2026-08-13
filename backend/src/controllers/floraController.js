const yup = require('yup');
const { Op } = require('sequelize');
const { GoogleGenAI } = require('@google/genai');
const { GreeneryRecord, User } = require('../models');
const sequelize = require('../config/database');
const { sendMail } = require('../config/mailer');
const floraQueryService = require('../services/floraQueryService');

const HEALTH_STATUSES = ['healthy', 'at_risk', 'critical'];
const ALERT_STATUSES = ['at_risk', 'critical'];


// Case-insensitive substring match on both dialects.
// Op.substring auto-wraps with %...%; Op.iLike does not, so wrap manually.
const insensitiveContains = (value) =>
  sequelize.getDialect() === 'postgres'
    ? { [Op.iLike]: `%${value}%` }
    : { [Op.substring]: value };

// Rule-based notification: email all staff/admin when a plant's health becomes
// at_risk or critical. Fire-and-forget - sendMail swallows its own errors, so
// callers don't await this and the request returns without waiting on SMTP.
async function sendHealthAlert(record) {
  const recipients = await User.findAll({
    where: { role: { [Op.in]: ['field_officer', 'manager'] } },
    attributes: ['email'],
  });
  if (recipients.length === 0) return;

  const to = recipients.map((u) => u.email).join(',');
  sendMail({
    to,
    subject: `Flora health alert: ${record.species} is ${record.health_status}`,
    text: `A plant asset has been flagged as ${record.health_status}.

Species: ${record.species}
Common name: ${record.common_name || 'unknown'}
Location zone: ${record.location_zone || 'unspecified'}
Health status: ${record.health_status}
Health notes: ${record.health_notes || 'none'}
${record.image_url ? `Photo: ${record.image_url}\n` : ''}
Check the app for the AI care recommendation.

- 4E Biodiversity Tracker`,
  });
}

const createSchema = yup.object({
  species: yup.string().required().trim(),
  common_name: yup.string().trim(),
  location_zone: yup.string().trim(),
  location: yup.string().trim(),
  gps_lat: yup.number().nullable(),
  gps_lng: yup.number().nullable(),
  health_status: yup.string().oneOf(HEALTH_STATUSES),
  health_notes: yup.string().trim(),
  last_inspected_at: yup.date(),
  plant_family: yup.string().trim(),
  site_suitability: yup.string().trim(),
  color: yup.string().trim(),
  max_height_at_maturity: yup
    .number()
    .transform((value) => (isNaN(value) ? null : value))
    .positive('Max height must be a positive number')
    .nullable(),
  image_url: yup.string().trim().url().nullable(),
  is_catalog_only: yup.boolean().default(false),
});

const updateSchema = yup.object({
  species: yup.string().trim(),
  common_name: yup.string().trim(),
  location_zone: yup.string().trim(),
  location: yup.string().trim(),
  gps_lat: yup.number().nullable(),
  gps_lng: yup.number().nullable(),
  health_status: yup.string().oneOf(HEALTH_STATUSES),
  health_notes: yup.string().trim(),
  last_inspected_at: yup.date(),
  plant_family: yup.string().trim(),
  site_suitability: yup.string().trim(),
  color: yup.string().trim(),
  max_height_at_maturity: yup
    .number()
    .transform((value) => (isNaN(value) ? null : value))
    .positive('Max height must be a positive number')
    .nullable(),
  image_url: yup.string().trim().url().nullable(),
});

// Splits a CSV buffer into row objects keyed by the header row.
function parseCSV(buffer) {
  const lines = buffer.toString('utf-8').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] === '' ? undefined : values[i];
    });
    return row;
  });
}

// Get all active plant assets
async function getAllGreenery(req, res) {
  const where = { is_deleted: false };
  if (req.query.include_catalog !== 'true') {
    where.is_catalog_only = false;
  }
  if (req.query.health_status) {
    where.health_status = req.query.health_status;
  }
  if (req.query.plant_family) {
    where.plant_family = insensitiveContains(req.query.plant_family);
  }
  if (req.query.site_suitability) {
    where.site_suitability = insensitiveContains(req.query.site_suitability);
  }
  if (req.query.location) {
    where.location = insensitiveContains(req.query.location);
  }
  if (req.query.color) {
    where.color = insensitiveContains(req.query.color);
  }

  const records = await GreeneryRecord.findAll({
    where,
    include: [{ association: 'recorder', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });

  return res.status(200).json(records);
}

// Get distinct species with their botanical fields, for autofill lookups
async function getSpeciesCatalog(req, res) {
  const records = await GreeneryRecord.findAll({
    where: { is_deleted: false },
    attributes: ['species', 'plant_family', 'site_suitability', 'color', 'max_height_at_maturity'],
    order: [['createdAt', 'DESC']],
  });

  const bySpecies = new Map();
  records.forEach((record) => {
    if (!bySpecies.has(record.species)) {
      bySpecies.set(record.species, {
        species: record.species,
        plant_family: record.plant_family,
        site_suitability: record.site_suitability,
        color: record.color,
        max_height_at_maturity: record.max_height_at_maturity,
      });
    }
  });

  return res.status(200).json(Array.from(bySpecies.values()));
}

// Add a new manual record
async function createGreenery(req, res) {
  let data;
  try {
    data = await createSchema.validate(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const record = await GreeneryRecord.create({
    species: data.species,
    common_name: data.common_name,
    location_zone: data.location_zone,
    location: data.location,
    gps_lat: data.gps_lat,
    gps_lng: data.gps_lng,
    health_status: data.health_status,
    health_notes: data.health_notes,
    plant_family: data.plant_family,
    site_suitability: data.site_suitability,
    color: data.color,
    max_height_at_maturity: data.max_height_at_maturity,
    last_inspected_at: data.last_inspected_at,
    image_url: data.image_url,
    recorded_by: req.user.user_id,
  });

  if (ALERT_STATUSES.includes(record.health_status)) {
    sendHealthAlert(record);
  }

  return res.status(201).json(record);
}

async function updateGreenery(req, res) {
  let data;
  try {
    data = await updateSchema.validate(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const record = await GreeneryRecord.findOne({
    where: { id: req.params.id, is_deleted: false },
  });
  if (!record) {
    return res.status(404).json({ error: 'Greenery record not found' });
  }

  const previousStatus = record.health_status;

  Object.keys(data).forEach((key) => {
    record[key] = data[key];
  });
  await record.save();

  // Alert only on a fresh transition into at_risk/critical, not when it was
  // already at an alerting status and stays there.
  if (
    ALERT_STATUSES.includes(record.health_status) &&
    record.health_status !== previousStatus
  ) {
    sendHealthAlert(record);
  }

  const updated = await GreeneryRecord.findByPk(record.id, {
    include: [{ association: 'recorder', attributes: ['id', 'name'] }],
  });

  return res.status(200).json(updated);
}

async function softDeleteGreenery(req, res) {
  const record = await GreeneryRecord.findOne({
    where: { id: req.params.id, is_deleted: false },
  });
  if (!record) {
    return res.status(404).json({ error: 'Greenery record not found' });
  }

  record.is_deleted = true;
  await record.save();

  return res.status(200).json({ message: 'Greenery record deleted' });
}

// Handle batch spreadsheet ingestion
async function bulkUploadCSV(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const rows = parseCSV(req.file.buffer);
  const created = [];
  const errors = [];
  const isCatalogOnly = req.body.is_catalog_only === 'true';

  for (let i = 0; i < rows.length; i++) {
    try {
      const data = await createSchema.validate(rows[i], { abortEarly: false });
      const record = await GreeneryRecord.create({
        species: data.species,
        common_name: data.common_name,
        location: data.location,
        location_zone: data.location_zone,
        gps_lat: data.gps_lat,
        gps_lng: data.gps_lng,
        health_status: data.health_status,
        health_notes: data.health_notes,
        plant_family: data.plant_family,
        site_suitability: data.site_suitability,
        color: data.color,
        max_height_at_maturity: data.max_height_at_maturity,
        last_inspected_at: data.last_inspected_at,
        is_catalog_only: isCatalogOnly,
        recorded_by: req.user.user_id,
      });
      created.push(record);
    } catch (err) {
      errors.push({ row: i + 2, error: err.errors || err.message });
    }
  }

  return res.status(201).json({ created: created.length, errors });
}

// Generate an AI care recommendation for a plant asset
async function careRecommendation(req, res) {
  const record = await GreeneryRecord.findOne({
    where: { id: req.params.id, is_deleted: false },
  });
  if (!record) {
    return res.status(404).json({ error: 'Greenery record not found' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  const prompt = `You are advising estate maintenance staff in Singapore's tropical climate.
Give a concise, actionable care recommendation for this plant, broken down by life stage -
seedling/young, establishing, and mature. Keep it practical and stage-appropriate: a
seedling/young plant needs more careful watering and shade guidance, an establishing plant
needs a balance of watering, feeding, and pest vigilance, and a mature plant leans more
toward pruning and escalation to a specialist when issues arise.

Species: ${record.species}
Common name: ${record.common_name || 'unknown'}
Location zone: ${record.location_zone || 'unspecified'}
Health status: ${record.health_status}
Health notes: ${record.health_notes || 'none'}
Respond with only the recommendation itself. Plain text only - no markdown, no asterisks, no bold. Structure the response as three short sections in this order, each with its own plain-text heading (no markdown symbols) and 2-3 short bullet points - do not exceed 3 bullets per section:
Seedling/Young
Establishing
Mature
Start each bullet with an emoji that matches its topic: 💧 for watering, 🌤️ for shade/light, 🐛 for pest treatment, ✂️ for pruning, ⚠️ for when to escalate. Only include the topics that matter most for that stage - do not force all five into every section. After all three stage sections, add exactly one final bullet point estimating the species' typical lifespan in Singapore's climate, prefixed with ⏳ - do not repeat this per stage. Keep the overall response brief; do not pad any stage with filler advice just to reach the bullet limit. No preamble or introduction.`;

  let recommendation;
  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    });
    recommendation = response.text;
  } catch (err) {
    return res.status(502).json({ error: `AI request failed: ${err.message}` });
  }

  record.care_recommendation = recommendation;
  await record.save();

  return res.status(200).json(record);
}

// Answer a natural-language question grounded in the greenery catalog
async function queryHandbook(req, res) {
  const { question } = req.body || {};
  if (typeof question !== 'string' || question.trim() === '') {
    return res.status(400).json({ error: 'question is required' });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: 'question must be 500 characters or fewer' });
  }

  if (!floraQueryService.hasApiKey()) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  try {
    const { answer, plantCount, referencedPlants } =
      await floraQueryService.queryCatalog(question.trim());
    return res
      .status(200)
      .json({ question: question.trim(), answer, plantCount, referencedPlants });
  } catch (err) {
    // The raw SDK message is meaningless to staff, so log it for the Render
    // logs and hand the client something they can act on instead.
    console.error('AI catalog query failed:', err);

    const status = err.status;
    const message = (err.message || '').toLowerCase();

    if (status === 429 || message.includes('quota') || message.includes('rate limit')) {
      return res.status(429).json({
        error: 'The AI service is busy right now. Please try again in a moment.',
      });
    }
    if (status === 503 || message.includes('overloaded') || message.includes('unavailable')) {
      return res.status(503).json({
        error: 'The AI service is temporarily overloaded. Please try again in a moment.',
      });
    }
    return res.status(502).json({
      error: 'Could not get an answer from the AI service. Please try again.',
    });
  }
}

// One compact line per plant so the catalog stays cheap to send, grounding
// the prompt in the same way floraQueryService does for queryHandbook.
function formatPlantingCatalogLine(record) {
  const height =
    record.max_height_at_maturity != null
      ? `${record.max_height_at_maturity}m`
      : 'unknown';
  return [
    `Species: ${record.species}`,
    `Family: ${record.plant_family || 'unknown'}`,
    `Site suitability: ${record.site_suitability || 'unknown'}`,
    `Colour: ${record.color || 'unknown'}`,
    `Max height: ${height}`,
  ].join(' | ');
}

// Recommend species for a planting site, grounded in the active catalog only
async function getPlantingSuggestions(req, res) {
  const { condition } = req.body || {};
  if (typeof condition !== 'string' || condition.trim() === '') {
    return res.status(400).json({ error: 'condition is required' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  const records = await GreeneryRecord.findAll({
    where: { is_deleted: false },
    attributes: ['species', 'plant_family', 'site_suitability', 'color', 'max_height_at_maturity'],
  });

  const catalog = records.map(formatPlantingCatalogLine).join('\n');

  const prompt = `You are advising estate maintenance staff in Singapore on what to plant at a given site.

Recommend species using ONLY the catalog list below - do not invent species that are not in the list. Weigh all catalog entries comparatively against the stated condition and recommend the closest-fitting options even if none is a perfect match - name the tradeoff honestly for each (e.g. "close fit but slightly more sun-tolerant than ideal"). Only say nothing in the catalog is suitable if literally no species comes reasonably close to the stated condition - do not default to that answer just because no entry matches every aspect exactly.

Catalog (${records.length} plants, one per line):
${catalog}

Site condition: ${condition.trim()}

Respond with ONLY a JSON object (no markdown, no code fences, no commentary) in exactly this shape:
{
  "recommendations": [
    { "species": "exact species name from the catalog", "tradeoff": "short honest tradeoff explanation" }
  ],
  "notes": "closing text - species to avoid and why, or any other general context"
}

If literally nothing in the catalog is suitable, "recommendations" must be an empty array and the explanation belongs in "notes".`;

  let responseText;
  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    });
    responseText = response.text;
  } catch (err) {
    return res.status(502).json({ error: `AI request failed: ${err.message}` });
  }

  const cleaned = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(200).json({ raw: responseText });
  }
}

// Identify a plant species from an already-uploaded photo
async function identifySpecies(req, res) {
  const { image_url } = req.body || {};
  if (typeof image_url !== 'string' || image_url.trim() === '') {
    return res.status(400).json({ error: 'image_url is required' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  let base64Image;
  let mimeType;
  try {
    const imageResponse = await fetch(image_url.trim());
    if (!imageResponse.ok) {
      throw new Error(`image fetch returned status ${imageResponse.status}`);
    }
    mimeType = (imageResponse.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const arrayBuffer = await imageResponse.arrayBuffer();
    base64Image = Buffer.from(arrayBuffer).toString('base64');
  } catch (err) {
    return res.status(502).json({ error: `Failed to fetch image: ${err.message}` });
  }

  const prompt = `You are helping estate maintenance staff in Singapore identify a plant species from a photo.

Look at the image and identify the most likely plant species. Respond with ONLY a JSON object (no markdown, no code fences, no commentary) in exactly this shape:
{"species": "common name (Scientific name if confident)", "confidence": "high", "notes": "short explanation"}

"confidence" must be one of: high, medium, low.
If the image does not clearly show a plant, or the species cannot be reasonably determined, set "species" to "Unknown" and honestly explain why in "notes" instead of guessing.`;

  let responseText;
  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        { text: prompt },
        { inlineData: { mimeType, data: base64Image } },
      ],
      config: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    });
    responseText = response.text;
  } catch (err) {
    return res.status(502).json({ error: `AI request failed: ${err.message}` });
  }

  const cleaned = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(200).json({ raw: responseText });
  }
}

module.exports = {
  getAllGreenery,
  getSpeciesCatalog,
  createGreenery,
  updateGreenery,
  softDeleteGreenery,
  bulkUploadCSV,
  careRecommendation,
  queryHandbook,
  getPlantingSuggestions,
  identifySpecies,
};
