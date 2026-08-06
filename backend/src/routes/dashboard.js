// angelyn
const express = require('express');
const { Op } = require('sequelize');
const { NotificationLog } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const mock = require('../services/mockDataService');
const { sendWeeklySummary } = require('../services/weeklySummary');
const { computeEstateMetrics } = require('../services/estateStats');
const { getTrends, getHistory, dayKey } = require('../services/metricsSnapshot');

const router = express.Router();

router.use(protect);

// metrics - manager and field_officer see full estate, all other roles denied
router.get('/metrics', restrictTo('manager', 'field_officer'), async (req, res) => {
  try {
    const flora = mock.getFloraRecords();
    const sightings = mock.getFaunaSightings();
    const cases = mock.getCases();

    const m = computeEstateMetrics({ flora, sightings, cases });

    const week = 7 * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - week);
    const prevSince = new Date(Date.now() - 2 * week);
    const notifCount = await NotificationLog.count({ where: { createdAt: { [Op.gte]: since } } });
    // previous 7-day window, so the frontend can show a real week-over-week delta
    const notifPrevCount = await NotificationLog.count({
      where: { createdAt: { [Op.gte]: prevSince, [Op.lt]: since } },
    });

    // real trend deltas from the stored daily snapshots (null until history exists)
    const trends = await getTrends(m);

    // time series for the activity chart: stored history + today's live point
    const history = await getHistory(11);
    history.push({ date: dayKey(), openCases: m.openCases, sightings: m.totalSightings, hotspots: m.activeHotspots, riskScore: m.riskScore });

    const recentCases = [...cases]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6);

    // hero-card summary: overall status, explainable risk index, its direction,
    // the block that most needs attention, and the latest incident.
    const topHotspot = m.hotspots[0] || null;
    const estateHealth = {
      status: m.riskStatus,
      score: m.riskScore,
      scoreTrend: trends.risk_score?.sinceYesterday ?? null,
      highestRiskBlock: topHotspot ? topHotspot.block_number : null,
      lastIncident: recentCases[0]
        ? { title: recentCases[0].title, block_number: recentCases[0].block_number, at: recentCases[0].createdAt }
        : null,
    };

    res.json({
      ...m,
      estateHealth,
      trends,
      history,
      criticalFloraSpecies: flora.filter(f => f.health_status === 'critical').map(f => f.species),
      notificationsLast7Days: notifCount,
      notificationsPrev7Days: notifPrevCount,
      recentCases,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute metrics' });
  }
});

// trigger summary - manager only (the live demo button)
router.post('/trigger-summary', restrictTo('manager'), async (req, res) => {
  try {
    const result = await sendWeeklySummary(req.user.user_id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
