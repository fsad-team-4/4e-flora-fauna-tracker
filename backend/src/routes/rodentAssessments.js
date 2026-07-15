// angelyn
const express = require('express');
const { RodentAssessment } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { assessRodentRisk, hasApiKey, stubAssessment } = require('../services/rodentService');

const { Op } = require('sequelize');

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

const router = express.Router();

router.use(protect);

// list past assessments
router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const where = { is_deleted: false };
  if (req.query.risk_level && ['low', 'medium', 'high', 'critical'].includes(req.query.risk_level)) {
    where.risk_level = req.query.risk_level;
  }

  try {
    const rows = await RodentAssessment.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
    });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch assessments' });
  }
});

// get one
router.get('/:id', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const row = await RodentAssessment.findOne({
      where: { id: req.params.id, is_deleted: false },
    });
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch assessment' });
  }
});

// create - runs AI assessment + saves
router.post('/', restrictTo('admin', 'staff'), async (req, res) => {
  const { block_number, floor_level, observations } = req.body;

  if (!observations || !observations.trim()) {
    return res.status(400).json({ error: 'observations are required' });
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
      assessment = await assessRodentRisk({ block: block_number, floorLevel: floor_level, observations, history });
    } catch (err) {
      console.error('rodent AI failed, falling back to stub:', err.message);
      assessment = stubAssessment(observations, history);
      stubbed = true;
    }
  } else {
    assessment = stubAssessment(observations, history);
    stubbed = true;
  }

  try {
    const row = await RodentAssessment.create({
      block_number: block_number || null,
      floor_level: floor_level || null,
      observations: observations.trim(),
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
