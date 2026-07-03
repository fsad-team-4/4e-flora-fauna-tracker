const yup = require('yup');
const { GoogleGenAI } = require('@google/genai');
const { GreeneryRecord } = require('../models');

const HEALTH_STATUSES = ['healthy', 'at_risk', 'critical'];

const createSchema = yup.object({
  species: yup.string().required().trim(),
  common_name: yup.string().trim(),
  location_zone: yup.string().trim(),
  health_status: yup.string().oneOf(HEALTH_STATUSES),
  health_notes: yup.string().trim(),
  last_inspected_at: yup.date(),
});

const updateSchema = yup.object({
  species: yup.string().trim(),
  common_name: yup.string().trim(),
  location_zone: yup.string().trim(),
  health_status: yup.string().oneOf(HEALTH_STATUSES),
  health_notes: yup.string().trim(),
  last_inspected_at: yup.date(),
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
  if (req.query.health_status) {
    where.health_status = req.query.health_status;
  }

  const records = await GreeneryRecord.findAll({
    where,
    include: [{ association: 'recorder', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });

  return res.status(200).json(records);
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
    health_status: data.health_status,
    health_notes: data.health_notes,
    last_inspected_at: data.last_inspected_at,
    recorded_by: req.user.user_id,
  });

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

  Object.keys(data).forEach((key) => {
    record[key] = data[key];
  });
  await record.save();

  return res.status(200).json(record);
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

  for (let i = 0; i < rows.length; i++) {
    try {
      const data = await createSchema.validate(rows[i], { abortEarly: false });
      const record = await GreeneryRecord.create({
        species: data.species,
        common_name: data.common_name,
        location_zone: data.location_zone,
        health_status: data.health_status,
        health_notes: data.health_notes,
        last_inspected_at: data.last_inspected_at,
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
Give a concise, actionable care recommendation for this plant. Keep it practical -
cover watering, shade, pest treatment, pruning, and when to escalate to a specialist.

Species: ${record.species}
Common name: ${record.common_name || 'unknown'}
Location zone: ${record.location_zone || 'unspecified'}
Health status: ${record.health_status}
Health notes: ${record.health_notes || 'none'}
Respond with only the recommendation itself, as 3-5 short bullet points. Plain text only - no markdown, no asterisks, no bold. Start each bullet with an emoji that matches its topic: 💧 for watering, 🌤️ for shade/light, 🐛 for pest treatment, ✂️ for pruning, ⚠️ for when to escalate. No preamble or introduction.`;

  let recommendation;
  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
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

module.exports = {
  getAllGreenery,
  createGreenery,
  updateGreenery,
  softDeleteGreenery,
  bulkUploadCSV,
  careRecommendation,
};
