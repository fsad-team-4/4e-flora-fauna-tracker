// angelyn
const express = require('express');
const { Op } = require('sequelize');
const { NotificationLog, AlertRule } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { resend, resendAllFailed, buildStats } = require('../services/notificationService');

const router = express.Router();

router.use(protect);

const DAY_MS = 24 * 60 * 60 * 1000;
const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// shared where-clause: status + a date range (from/to inclusive), with `date` kept
// as a single-day shorthand for backward compatibility.
function buildWhere({ status, date, from, to }) {
  const where = {};
  if (status && ['sent', 'failed'].includes(status)) where.status = status;
  const range = {};
  const lo = isDay(from) ? from : (isDay(date) ? date : null);
  const hi = isDay(to) ? to : (isDay(date) ? date : null);
  if (lo) range[Op.gte] = new Date(`${lo}T00:00:00`);
  if (hi) range[Op.lt] = new Date(new Date(`${hi}T00:00:00`).getTime() + DAY_MS);
  if (Object.getOwnPropertySymbols(range).length) where.createdAt = range;
  return where;
}

const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// list with optional status filter + date-range + pagination
router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 2000);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const { count, rows } = await NotificationLog.findAndCountAll({
      where: buildWhere(req.query),
      include: [{ model: AlertRule, as: 'rule', attributes: ['name', 'trigger_type'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    // flatten the joined rule fields so the frontend doesn't have to dig into nested objects
    const logs = rows.map(log => ({
      ...log.toJSON(),
      rule_name: log.rule?.name || null,
      trigger_type: log.rule?.trigger_type || null,
    }));

    res.json({ logs, total: count, limit, offset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch logs' });
  }
});

// count for the dashboard kpi
router.get('/recent-count', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const count = await NotificationLog.count({
      where: { createdAt: { [require('sequelize').Op.gte]: since } },
    });
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to count' });
  }
});

// reliability snapshot for the KPI strip
router.get('/stats', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    res.json(await buildStats());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute stats' });
  }
});

// CSV export (Excel-compatible) of the dispatch log - the audit record a town
// council needs, and a bridge into their SharePoint/Excel workflow.
router.get('/export', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const rows = await NotificationLog.findAll({
      where: buildWhere(req.query),
      include: [{ model: AlertRule, as: 'rule', attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
      limit: 5000,
    });
    const header = ['id', 'sent_at', 'channel', 'rule', 'recipient', 'subject', 'status', 'error_reason', 'source_type', 'source_id', 'resolved_at', 'acknowledged_by', 'acknowledged_at'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.id, r.createdAt && new Date(r.createdAt).toISOString(), r.channel,
        r.rule?.name || '', r.recipient, r.subject, r.status, r.error_reason,
        r.source_type, r.source_id, r.resolved_at && new Date(r.resolved_at).toISOString(),
        r.acknowledged_by_name, r.acknowledged_at && new Date(r.acknowledged_at).toISOString(),
      ].map(csvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="notification-log.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to export' });
  }
});

// re-attempt a dispatch through nodemailer (with critical-alert fallback)
router.post('/:id/resend', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const result = await resend(req.params.id, req.user);
    if (result.error) return res.status(result.code || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to resend' });
  }
});

// bulk resend every unresolved failure (the banner's one-click "Resend all")
router.post('/resend-failed', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    res.json(await resendAllFailed());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to resend failures' });
  }
});

// close the loop: mark that the notification was acted on
router.post('/:id/acknowledge', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const row = await NotificationLog.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    await row.update({
      acknowledged_at: new Date(),
      acknowledged_by: req.user.user_id,
      acknowledged_by_name: req.user.name || null,
    });
    res.json({ id: row.id, acknowledged_at: row.acknowledged_at, acknowledged_by_name: row.acknowledged_by_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to acknowledge' });
  }
});

// reverse an acknowledgement (the "Undo" affordance)
router.post('/:id/unacknowledge', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const row = await NotificationLog.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    await row.update({ acknowledged_at: null, acknowledged_by: null, acknowledged_by_name: null });
    res.json({ id: row.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to undo acknowledgement' });
  }
});

module.exports = router;
