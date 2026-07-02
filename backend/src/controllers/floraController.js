const yup = require('yup');
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

module.exports = {
  getAllGreenery,
  createGreenery,
  updateGreenery,
  softDeleteGreenery,
  bulkUploadCSV,
};
