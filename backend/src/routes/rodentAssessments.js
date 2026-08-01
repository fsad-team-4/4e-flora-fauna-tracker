const express = require('express');
const cloudinary = require('../config/cloudinary');
const sequelize = require('../config/database');
const { RodentAssessment, WorkOrder } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const yup = require('yup');
const { assessRodentRisk, hasApiKey, stubAssessment } = require('../services/rodentService');
const { aiLimiter } = require('../utils/rateLimiters');
const { validateBody } = require('../utils/validate');
const { Op } = require('sequelize');

// SQLite's LIKE is case-insensitive by default; Postgres's is NOT. On Neon the
// same query would silently return fewer rows - no error, just a filter that
// quietly stops matching "Block 123" when the user types "block 123". Pick the
// operator per dialect so both environments behave the same.
const LIKE = sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;

const createSchema = yup.object({
  block_number: yup.string().nullable().max(120, 'block is too long'),
  floor_level: yup.string().nullable().max(120, 'floor / area is too long'),
  observations: yup.string().required('observations are required').max(5000, 'observations are too long'),
  image: yup.string().nullable(),
  // optional reported position - range-checked so a garbage coordinate is a clean
  // 400, not a dot in the ocean. Both-or-neither is enforced in the handler.
  gps_lat: yup.number().nullable().min(-90).max(90),
  gps_lng: yup.number().nullable().min(-180).max(180),
});

// Same Cloudinary credentials the rest of the app uses (config/cloudinary.js).
// Uploads run server-side so the credentials never reach the browser.
const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

// Look up prior assessments at the SAME block in the last N days, so the AI can
// judge recurrence rather than treating every note as an isolated incident.
// Block is free text, so match on a trimmed/lowercased comparison.
async function getBlockHistory(block, days = 7) {
  if (!block || !block.trim()) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await RodentAssessment.findAll({
    where: { is_deleted: false, createdAt: { [Op.gte]: since } },
    order: [['createdAt', 'DESC']],
    limit: 20,
  });
  const key = block.trim().toLowerCase();
  return rows
    .filter(r => (r.block_number || '').trim().toLowerCase() === key)
    .map(r => ({ createdAt: r.createdAt, risk_level: r.risk_level, observations: r.observations }));
}

// Accepts a data URL ("data:image/jpeg;base64,...") or a bare base64 string.
// Returns { mimeType, data } for Gemini, or null if unusable.
function parseImage(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!m) return null;
  return { mimeType: m[1].toLowerCase().replace('image/jpg', 'image/jpeg'), data: m[2] };
}

const router = express.Router();
router.use(protect);

// list past assessments, with filtering. Filtering is server-side because the
// table paginates - filtering only the loaded rows would show a subset and call
// it the whole answer.
router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const { risk_level, escalated, block, search, from, to } = req.query;
  const where = { is_deleted: false };

  if (risk_level && ['low', 'medium', 'high', 'critical'].includes(risk_level)) {
    where.risk_level = risk_level;
  }
  if (escalated === 'true') where.escalate_to_contractor = true;
  if (escalated === 'false') where.escalate_to_contractor = false;

  // block is free text, so match loosely - "234" should find "Block 234"
  if (block && block.trim()) {
    where.block_number = { [LIKE]: `%${block.trim()}%` };
  }
  // free-text search across what the officer actually wrote, plus the AI's cause
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    where[Op.or] = [
      { observations: { [LIKE]: q } },
      { likely_cause: { [LIKE]: q } },
    ];
  }
  // date range, inclusive of the whole "to" day
  if (from || to) {
    const range = {};
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) range[Op.gte] = new Date(`${from}T00:00:00`);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      range[Op.lt] = new Date(new Date(`${to}T00:00:00`).getTime() + 86400000);
    }
    if (Object.getOwnPropertySymbols(range).length) where.createdAt = range;
  }

  try {
    const { count, rows } = await RodentAssessment.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
    });
    // shape kept backward-compatible: an array, with the total on a header
    res.set('X-Total-Count', String(count));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch assessments' });
  }
});

// get one - with the work order it was consolidated into, if any. This turns the
// row into a lifecycle view ("what happened to this report?"). The assessment
// carries work_order_id directly (set when an officer approves a call-out), so we
// resolve the outcome via that FK rather than a JSON-containment query against
// WorkOrder.assessment_ids (which SQLite can't do reliably). The row already
// carries escalate_to_contractor / escalation_status, so the "no work order"
// states (not recommended / pending / dismissed) are distinguishable client-side.
router.get('/:id', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const row = await RodentAssessment.findOne({
      where: { id: req.params.id, is_deleted: false },
    });
    if (!row) return res.status(404).json({ error: 'not found' });

    let work_order = null;
    if (row.work_order_id) {
      const wo = await WorkOrder.findOne({ where: { id: row.work_order_id, is_deleted: false } });
      work_order = wo ? wo.toJSON() : null;
    }
    res.json({ ...row.toJSON(), work_order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch assessment' });
  }
});

// create - runs AI assessment (optionally from a photo) + saves
router.post('/', aiLimiter, restrictTo('admin', 'staff'), validateBody(createSchema), async (req, res) => {
  const { block_number, floor_level, observations, image, gps_lat, gps_lng } = req.body;
  if (!observations || !observations.trim()) {
    return res.status(400).json({ error: 'observations are required' });
  }

  // Store a position only if BOTH parts are real numbers - a lone lat/lng is
  // meaningless, so it is dropped rather than half-recorded (never invented).
  const hasCoords = Number.isFinite(gps_lat) && Number.isFinite(gps_lng);

  const parsedImage = parseImage(image);
  if (image && !parsedImage) {
    return res.status(400).json({ error: 'unsupported image format - use JPEG, PNG or WebP' });
  }

  // prior reports at this block feed the assessment's recurrence reasoning
  let history = [];
  try {
    history = await getBlockHistory(block_number);
  } catch (e) {
    console.error('block history lookup failed (continuing without context):', e.message);
  }

  let assessment;
  let stubbed = false;
  if (hasApiKey()) {
    try {
      assessment = await assessRodentRisk({
        block: block_number,
        floorLevel: floor_level,
        observations,
        history,
        image: parsedImage,
      });
    } catch (err) {
      console.error('rodent AI failed, falling back to stub:', err.message);
      assessment = stubAssessment(observations, history);
      stubbed = true;
    }
  } else {
    assessment = stubAssessment(observations, history);
    stubbed = true;
  }

  // Storage is independent of assessment: a failed upload must not lose a good
  // assessment, so this is deliberately non-fatal.
  let image_url = null;
  let imageStored = true;
  if (parsedImage && hasCloudinary) {
    try {
      const uploaded = await cloudinary.uploader.upload(
        `data:${parsedImage.mimeType};base64,${parsedImage.data}`,
        { folder: 'rodent-assessments', resource_type: 'image' }
      );
      image_url = uploaded.secure_url;
    } catch (err) {
      console.error('cloudinary upload failed (assessment kept):', err.message);
      imageStored = false;
    }
  } else if (parsedImage && !hasCloudinary) {
    imageStored = false; // assessed from the photo, but nowhere to store it
  }

  try {
    const row = await RodentAssessment.create({
      block_number: block_number || null,
      floor_level: floor_level || null,
      gps_lat: hasCoords ? gps_lat : null,
      gps_lng: hasCoords ? gps_lng : null,
      observations: observations.trim(),
      image_url,
      risk_level: assessment.risk_level,
      likely_cause: assessment.likely_cause,
      signs_identified: assessment.signs_identified || [],
      immediate_actions: assessment.immediate_actions || [],
      escalate_to_contractor: assessment.escalate_to_contractor,
      escalation_reason: assessment.escalation_reason || null,
      follow_up_notes: null,
      assessed_by: req.user.user_id,
    });
    res.status(201).json({
      ...row.toJSON(),
      stubbed,
      confidence: assessment.confidence || null,
      recurrence_note: assessment.recurrence_note || null,
      prior_count: history.length,
      assessed_from_image: Boolean(parsedImage),
      image_stored: parsedImage ? imageStored : null,
    });
  } catch (err) {
    console.error('save assessment failed:', err);
    res.status(500).json({ error: 'assessment generated but failed to save' });
  }
});

// update follow-up notes
router.patch('/:id', restrictTo('admin', 'staff'), async (req, res) => {
  const { follow_up_notes } = req.body;
  if (follow_up_notes === undefined) {
    return res.status(400).json({ error: 'only follow_up_notes can be updated' });
  }
  try {
    const row = await RodentAssessment.findOne({
      where: { id: req.params.id, is_deleted: false },
    });
    if (!row) return res.status(404).json({ error: 'not found' });
    await row.update({ follow_up_notes });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to update' });
  }
});

// soft delete - admin only
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  try {
    const row = await RodentAssessment.findOne({
      where: { id: req.params.id, is_deleted: false },
    });
    if (!row) return res.status(404).json({ error: 'not found' });
    await row.update({ is_deleted: true });
    res.json({ deleted: true, id: row.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to delete' });
  }
});

module.exports = router;
