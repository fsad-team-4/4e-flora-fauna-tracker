const yup = require('yup');
const { Op } = require('sequelize');
const { GoogleGenAI } = require('@google/genai');
const { GreeneryRecord, User } = require('../models');
const sequelize = require('../config/database');
const { sendMail } = require('../config/mailer');
const floraQueryService = require('../services/floraQueryService');

const HEALTH_STATUSES = ['healthy', 'at_risk', 'critical'];
const ALERT_STATUSES = ['at_risk', 'critical'];


// Postgres' LIKE is case-sensitive (unlike SQLite's), so use iLike there to
// keep substring filters matching regardless of case on both databases.
const CASE_INSENSITIVE_OP = sequelize.getDialect() === 'postgres' ? Op.iLike : Op.substring;

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
    where.plant_family = { [CASE_INSENSITIVE_OP]: req.query.plant_family };
  }
  if (req.query.site_suitability) {
    where.site_suitability = { [CASE_INSENSITIVE_OP]: req.query.site_suitability };
  }
  if (req.query.location) {
    where.location = { [CASE_INSENSITIVE_OP]: req.query.location };
  }
  if (req.query.color) {
    where.color = req.query.color;
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
    location: data.location,
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
    const { answer, plantCount } = await floraQueryService.queryCatalog(question.trim());
    return res.status(200).json({ question: question.trim(), answer, plantCount });
  } catch (err) {
    return res.status(502).json({ error: `AI request failed: ${err.message}` });
  }
}

module.exports = {
  getAllGreenery,
  createGreenery,
  updateGreenery,
  softDeleteGreenery,
  bulkUploadCSV,
  careRecommendation,
  queryHandbook,
};
