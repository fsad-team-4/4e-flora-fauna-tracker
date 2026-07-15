// angelyn
const express = require('express');
const { NotificationLog, AlertRule } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// list with optional status filter + pagination
router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 2000);
  const offset = parseInt(req.query.offset) || 0;
  const { status, date } = req.query;
  try {
    const { Op } = require('sequelize');
    const where = {};
    if (status && ['sent', 'failed'].includes(status)) {
      where.status = status;
    }
    // filter to a single calendar day (YYYY-MM-DD): createdAt within [day, day+1)
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      if (!Number.isNaN(start.getTime())) {
        where.createdAt = { [Op.gte]: start, [Op.lt]: end };
      }
    }

    const { count, rows } = await NotificationLog.findAndCountAll({
      where,
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

module.exports = router;
