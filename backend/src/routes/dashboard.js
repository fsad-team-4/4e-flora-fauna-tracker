// angelyn
const express = require('express');
const { NotificationLog } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const mock = require('../services/mockDataService');
const { sendWeeklySummary } = require('../services/weeklySummary');

const router = express.Router();

router.use(protect);

// metrics - admin and staff see full estate, residents denied
router.get('/metrics', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const flora = mock.getFloraRecords();
    const sightings = mock.getFaunaSightings();
    const cases = mock.getCases();

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const notifCount = await NotificationLog.count({
      where: { createdAt: { [require('sequelize').Op.gte]: since } },
    });

    const criticalFlora = flora.filter(f => f.health_status === 'critical').length;
    const atRiskFlora = flora.filter(f => f.health_status === 'at-risk').length;
    const openCases = cases.filter(c => c.status === 'open').length;

    const byCategory = {};
    cases.forEach(c => {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    });
    const casesByCategory = Object.entries(byCategory).map(([category, count]) => ({ category, count }));

    const blockCounts = {};
    sightings.forEach(s => {
      blockCounts[s.block] = (blockCounts[s.block] || 0) + 1;
    });
    const hotspots = Object.entries(blockCounts)
      .filter(([_, n]) => n >= 3)
      .map(([block, count]) => ({ block, count }));

    res.json({
      openCases,
      criticalFlora,
      atRiskFlora,
      activeHotspots: hotspots.length,
      hotspots,
      notificationsLast7Days: notifCount,
      casesByCategory,
      recentCases: cases.slice(0, 5),
      totalSightings: sightings.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute metrics' });
  }
});

// trigger summary - admin only (the live demo button)
router.post('/trigger-summary', restrictTo('admin'), async (req, res) => {
  try {
    const result = await sendWeeklySummary(req.user.user_id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
