// angelyn
const express = require('express');
const { Op, fn, col } = require('sequelize');
const { AlertRule, NotificationLog } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { validateRuleInput } = require('../utils/validateAlertRule');

const router = express.Router();

// all routes need a valid JWT
router.use(protect);

// list - admin and staff can read
router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
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

// Per-rule firing activity, derived from the dispatch log via NotificationLog.rule_id.
// The rule table itself stores no counters, so this is the only honest source for
// "triggered 3x today" / "last fired 2h ago" - and it stays correct if a log row is
// backfilled or a rule is renamed.
//
// MUST stay above '/:id', or Express matches 'activity' as an id.
router.get('/activity', restrictTo('admin', 'staff'), async (req, res) => {
  const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 720);
  try {
    const now = Date.now();
    const windowStart = new Date(now - hours * 3600 * 1000);
    const prevStart = new Date(now - 2 * hours * 3600 * 1000);

    // retry_of rows are re-sends of an existing dispatch, not new rule triggers -
    // counting them would let two clicks of "resend" turn one fire into three
    const [inWindow, inPrev, newest] = await Promise.all([
      NotificationLog.findAll({
        // createdAt is needed to bucket the window into a real hourly series -
        // the cards previously had only two aggregates (total, prevTotal), and a
        // sparkline drawn through two points either draws a meaningless straight
        // line or invents the values in between.
        attributes: ['rule_id', 'status', 'createdAt'],
        where: { createdAt: { [Op.gte]: windowStart }, retry_of: null },
      }),
      NotificationLog.count({ where: { createdAt: { [Op.gte]: prevStart, [Op.lt]: windowStart }, retry_of: null } }),
      // all-time last fire per rule, so a rule dormant for a week still reports one
      NotificationLog.findAll({
        attributes: ['rule_id', [fn('MAX', col('createdAt')), 'last_at']],
        where: { rule_id: { [Op.ne]: null }, retry_of: null },
        group: ['rule_id'],
        raw: true,
      }),
    ]);

    const rules = {};
    const bump = (id, key) => {
      if (id == null) return;
      rules[id] ||= { count: 0, failed: 0, lastTriggeredAt: null };
      rules[id][key] += 1;
    };
    for (const row of inWindow) {
      bump(row.rule_id, 'count');
      if (row.status === 'failed') bump(row.rule_id, 'failed');
    }
    for (const row of newest) {
      rules[row.rule_id] ||= { count: 0, failed: 0, lastTriggeredAt: null };
      // raw MAX() bypasses Sequelize date parsing: SQLite hands back its stored
      // string, Postgres a Date - normalize so the wire format is ISO in both
      rules[row.rule_id].lastTriggeredAt = new Date(row.last_at).toISOString();
    }

    /**
     * Per-hour buckets across the window: every hour is present, including the
     * quiet ones, so a gap in dispatches renders as a genuine zero rather than
     * the line skipping over it. Oldest bucket first.
     *
     * `sent`/`failed` are counted separately so the delivery-health card can plot
     * the failure shape rather than re-deriving it from a single total.
     */
    const buckets = Array.from({ length: hours }, () => ({ total: 0, failed: 0 }));
    for (const row of inWindow) {
      const t = new Date(row.createdAt).getTime();
      // index 0 is the OLDEST hour, so the series reads left-to-right in time
      const idx = Math.floor((t - windowStart.getTime()) / 3600000);
      if (idx < 0 || idx >= hours) continue;      // clock skew: drop, never clamp
      buckets[idx].total += 1;
      if (row.status === 'failed') buckets[idx].failed += 1;
    }

    res.json({
      windowHours: hours,
      total: inWindow.length,
      prevTotal: inPrev,
      series: buckets,
      failed: inWindow.filter(r => r.status === 'failed').length,
      // dispatches with no rule_id came from a work order or a manual send, not a
      // rule - surfaced separately rather than silently folded into a rule's count
      unattributed: inWindow.filter(r => r.rule_id == null).length,
      rules,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute rule activity' });
  }
});

// get one
router.get('/:id', restrictTo('admin', 'staff'), async (req, res) => {
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

// create - admin only
router.post('/', restrictTo('admin'), async (req, res) => {
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

// update - admin only
router.patch('/:id', restrictTo('admin'), async (req, res) => {
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

// soft delete - admin only
router.delete('/:id', restrictTo('admin'), async (req, res) => {
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
