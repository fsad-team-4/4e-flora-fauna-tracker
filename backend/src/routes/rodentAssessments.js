// angelyn
const express = require('express');
const { RodentAssessment } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { assessRodentRisk, hasApiKey, stubAssessment } = require('../services/rodentService');

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

  let assessment;
  let stubbed = false;
  try {
    if (hasApiKey()) {
      assessment = await assessRodentRisk({ block: block_number, floorLevel: floor_level, observations });
    } else {
      assessment = stubAssessment(observations);
      stubbed = true;
    }
  } catch (err) {
    console.error('rodent assessment ai failed:', err.message);
    return res.status(500).json({ error: err.message });
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
    res.status(201).json({ ...row.toJSON(), stubbed });
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
