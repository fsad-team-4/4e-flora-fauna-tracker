// angelyn
const express = require('express');
const { Op } = require('sequelize');
const { AlertRule } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { validateRuleInput } = require('../utils/validateAlertRule');

const router = express.Router();

// all routes need a valid JWT
router.use(protect);

// list - manager and field_officer can read
router.get('/', restrictTo('manager', 'field_officer'), async (req, res) => {
  try {
    const rules = await AlertRule.findAll({
      where: { is_deleted: false },
      order: [['createdAt', 'DESC']],
    });
    res.json(rules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch rules' });
  }
});

// get one
router.get('/:id', restrictTo('manager', 'field_officer'), async (req, res) => {
  try {
    const rule = await AlertRule.findOne({
      where: { id: req.params.id, is_deleted: false },
    });
    if (!rule) return res.status(404).json({ error: 'not found' });
    res.json(rule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch rule' });
  }
});

// create - manager only
router.post('/', restrictTo('manager'), async (req, res) => {
  const validation = validateRuleInput(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const { name, trigger_type, threshold, recipients, channel } = req.body;

  try {
    const rule = await AlertRule.create({
      name: name.trim(),
      trigger_type,
      threshold: threshold || null,
      recipients: recipients.trim(),
      channel: channel || 'email',
      created_by: req.user.user_id,
    });
    res.status(201).json(rule);
  } catch (err) {
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      // created_by references a user that no longer exists (stale JWT after a DB reset)
      return res.status(401).json({ error: 'your session is stale - please log out and log in again' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// update - manager only
router.patch('/:id', restrictTo('manager'), async (req, res) => {
  try {
    const rule = await AlertRule.findOne({
      where: { id: req.params.id, is_deleted: false },
    });
    if (!rule) return res.status(404).json({ error: 'not found' });

    // merge + re-validate
    const merged = { ...rule.toJSON(), ...req.body };
    const validation = validateRuleInput(merged);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    await rule.update({
      name: merged.name,
      trigger_type: merged.trigger_type,
      threshold: merged.threshold,
      recipients: merged.recipients,
      channel: merged.channel,
      is_active: merged.is_active,
    });
    res.json(rule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// soft delete - manager only
router.delete('/:id', restrictTo('manager'), async (req, res) => {
  try {
    const rule = await AlertRule.findOne({
      where: { id: req.params.id, is_deleted: false },
    });
    if (!rule) return res.status(404).json({ error: 'not found' });
    await rule.update({ is_deleted: true });
    res.json({ deleted: true, id: rule.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to delete' });
  }
});

module.exports = router;
