const yup = require('yup');
const { ResidentReport, CaseStatusLog, FaunaSighting } = require('../models');
const { sendMail } = require('../config/mailer');

const CATEGORIES = ['flora_health', 'community_cat', 'pigeon', 'pest', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved'];

// Maps the fauna-relevant report categories to a FaunaSighting species.
const CATEGORY_TO_SPECIES = { community_cat: 'cat', pigeon: 'pigeon' };

// Auto-create a FaunaSighting from a fauna-category ResidentReport so Renee's
// fauna module (hotspots, AI summaries) is fed from resident complaints without
// a separate submission form. Fire-and-forget: failures are logged but never
// affect the ResidentReport response.
async function createFaunaSightingFromReport(report, reportedBy) {
  try {
    const species = CATEGORY_TO_SPECIES[report.category];
    if (!species) return;

    await FaunaSighting.create({
      species,
      block_number: report.block_number,
      floor_level: report.floor_level,
      gps_lat: report.gps_lat,
      gps_lng: report.gps_lng,
      photo_url: report.photo_urls && report.photo_urls[0] ? report.photo_urls[0] : null,
      notes: report.description,
      reported_by: reportedBy,
    });
  } catch (err) {
    console.error('Failed to auto-create FaunaSighting from report:', err.message);
  }
}

const createSchema = yup.object({
  category: yup.string().required().oneOf(CATEGORIES),
  title: yup.string().required().trim().max(200),
  description: yup.string().required().trim(),
  photo_urls: yup.array().of(yup.string().url()).max(5),
  gps_lat: yup.number(),
  gps_lng: yup.number(),
  block_number: yup.string(),
  floor_level: yup.string(),
});

const statusSchema = yup.object({
  status: yup.string().required().oneOf(STATUSES),
});

async function createReport(req, res) {
  let data;
  try {
    data = await createSchema.validate(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const report = await ResidentReport.create({
    category: data.category,
    title: data.title,
    description: data.description,
    photo_urls: data.photo_urls || [],
    gps_lat: data.gps_lat,
    gps_lng: data.gps_lng,
    block_number: data.block_number,
    floor_level: data.floor_level,
    reported_by: req.user.user_id,
  });

  // Fire-and-forget: if this is a fauna complaint, mirror it into a
  // FaunaSighting. Not awaited - it must not delay or affect this response.
  if (data.category === 'community_cat' || data.category === 'pigeon') {
    createFaunaSightingFromReport(report, req.user.user_id);
  }

  return res.status(201).json(report);
}

async function listReports(req, res) {
  const where = { is_deleted: false };

  if (req.user.role === 'resident') {
    where.reported_by = req.user.user_id;
  }
  if (req.query.status) {
    where.status = req.query.status;
  }
  if (req.query.category) {
    where.category = req.query.category;
  }

  const reports = await ResidentReport.findAll({
    where,
    include: [{ association: 'reporter', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });

  return res.status(200).json(reports);
}

async function getReport(req, res) {
  const report = await ResidentReport.findOne({
    where: { id: req.params.id, is_deleted: false },
    include: [
      { association: 'reporter', attributes: ['id', 'name'] },
      {
        model: CaseStatusLog,
        include: [{ association: 'changer', attributes: ['id', 'name'] }],
      },
    ],
  });

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  if (req.user.role === 'resident' && report.reported_by !== req.user.user_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.status(200).json(report);
}

async function updateStatus(req, res) {
  let data;
  try {
    data = await statusSchema.validate(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const report = await ResidentReport.findOne({
    where: { id: req.params.id, is_deleted: false },
  });
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (report.status !== data.status) {
    await CaseStatusLog.create({
      report_id: report.id,
      old_status: report.status,
      new_status: data.status,
      changed_by: req.user.user_id,
    });
    report.status = data.status;
    await report.save();

    // Rule-based notification: email the reporter when their case is resolved.
    // Fire-and-forget - sendMail swallows its own errors, so we don't await it
    // and the status response returns without waiting on SMTP.
    if (data.status === 'resolved') {
      const reporter = await report.getReporter();
      if (reporter) {
        sendMail({
          to: reporter.email,
          subject: 'Your report has been resolved',
          text: `Hi ${reporter.name},\n\nYour report "${report.title}" has been marked as resolved.\n\nThank you for helping keep the estate in good shape.\n\n- 4E Biodiversity Tracker`,
        });
      }
    }
  }

  return res.status(200).json(report);
}

async function softDeleteReport(req, res) {
  const report = await ResidentReport.findOne({
    where: { id: req.params.id, is_deleted: false },
  });
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  report.is_deleted = true;
  await report.save();

  return res.status(200).json({ message: 'Report deleted' });
}

module.exports = {
  createReport,
  listReports,
  getReport,
  updateStatus,
  softDeleteReport,
};
