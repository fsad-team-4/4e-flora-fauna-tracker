// angelyn
const express = require('express');
const { Op, fn, col, literal } = require('sequelize');
const { NotificationLog, RodentAssessment } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const estateData = require('../services/estateDataService');
const { sendWeeklySummary } = require('../services/weeklySummary');
const { computeEstateMetrics } = require('../services/estateStats');
const { getTrends, getHistory, dayKey } = require('../services/metricsSnapshot');
const { aiLimiter } = require('../utils/rateLimiters');

const router = express.Router();

router.use(protect);

// metrics - admin and staff see full estate, residents denied
router.get('/metrics', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const flora = await estateData.getFloraRecords();
    const sightings = await estateData.getFaunaSightings();
    const cases = await estateData.getCases();

    const m = computeEstateMetrics({ flora, sightings, cases });

    // The dashboard's global time picker. Bounded so a hand-crafted query can't
    // ask for an unbounded scan; the point-in-time metrics (open cases, critical
    // flora) are "now" regardless - this governs the trend/history series.
    const windowDays = Math.min(90, Math.max(2, Number(req.query.windowDays) || 12));

    const day = 24 * 60 * 60 * 1000;
    const week = 7 * day;
    const since = new Date(Date.now() - week);
    const prevSince = new Date(Date.now() - 2 * week);
    const notifCount = await NotificationLog.count({ where: { createdAt: { [Op.gte]: since } } });
    // previous 7-day window, so the frontend can show a real week-over-week delta
    const notifPrevCount = await NotificationLog.count({
      where: { createdAt: { [Op.gte]: prevSince, [Op.lt]: since } },
    });

    // Same figures over the selected window, so the alerts KPI tracks the picker
    // rather than being permanently stuck at 7 days.
    const winSince = new Date(Date.now() - windowDays * day);
    const winPrevSince = new Date(Date.now() - 2 * windowDays * day);
    const notifWindow = await NotificationLog.count({ where: { createdAt: { [Op.gte]: winSince } } });
    const notifPrevWindow = await NotificationLog.count({
      where: { createdAt: { [Op.gte]: winPrevSince, [Op.lt]: winSince } },
    });

    // Daily send counts for the alerts sparkline. Grouped in SQL, then densified
    // below so days with no sends read as 0 instead of dropping out of the series.
    const notifRows = await NotificationLog.findAll({
      where: { createdAt: { [Op.gte]: winSince } },
      attributes: [[fn('date', col('createdAt')), 'day'], [fn('COUNT', literal('*')), 'count']],
      group: [fn('date', col('createdAt'))],
      raw: true,
    });
    const notifByDayMap = new Map(notifRows.map(r => [String(r.day), Number(r.count)]));
    const notificationsByDay = Array.from({ length: windowDays }, (_, i) => {
      const key = dayKey(new Date(Date.now() - (windowDays - 1 - i) * day));
      return { date: key, count: notifByDayMap.get(key) || 0 };
    });

    /**
     * SIGHTINGS LOGGED PER DAY - a real daily count, densified like the alerts above.
     *
     * WHY THIS EXISTS. `history[].sightings` comes from the snapshot column
     * `total_sightings`, which is `sightings.length` - a CUMULATIVE total of every
     * sighting ever recorded. The dashboard's activity chart wanted a per-day figure
     * and had been differencing consecutive snapshots to get one, which is sound
     * arithmetic on a growing series but produced zero for every day: the source was
     * a fixed seven-row array, so the total was 7 on every snapshot forever. Every bar
     * came out at height zero and the chart looked empty. The source is now the real
     * FaunaSighting table, but differencing stays wrong for a table that can also
     * shrink (soft deletes), so the per-day bucketing below remains the honest fix.
     *
     * The source rows carry `createdAt`, so the honest fix is to bucket them by day
     * here rather than to derive a daily figure from a total that cannot move. Same
     * shape and same densify-to-zero rule as notificationsByDay, so a day with no
     * sightings reads as 0 instead of dropping out of the series.
     */
    const sightingDayCounts = new Map();
    for (const s of sightings) {
      const t = new Date(s.createdAt);
      if (Number.isNaN(t.getTime())) continue;
      const key = dayKey(t);
      sightingDayCounts.set(key, (sightingDayCounts.get(key) || 0) + 1);
    }
    const sightingsByDay = Array.from({ length: windowDays }, (_, i) => {
      const key = dayKey(new Date(Date.now() - (windowDays - 1 - i) * day));
      return { date: key, count: sightingDayCounts.get(key) || 0 };
    });

    // rodent escalations the AI has recommended but no officer has actioned yet -
    // drives the dashboard's "awaiting review" call-to-action.
    const pendingRows = await RodentAssessment.findAll({
      where: { escalate_to_contractor: true, work_order_id: null, escalation_status: null, is_deleted: false },
      attributes: ['block_number'],
    });
    const pendingEscalations = pendingRows.length;
    const pendingEscalationBlocks = new Set(
      pendingRows.map(r => (r.block_number || '').trim().toLowerCase()).filter(Boolean)
    ).size;

    // real trend deltas from the stored daily snapshots (null until history exists)
    const trends = await getTrends(m);

    // time series for the activity chart: stored history + today's live point
    const history = await getHistory(windowDays - 1);
    history.push({
      date: dayKey(),
      openCases: m.openCases,
      sightings: m.totalSightings,
      hotspots: m.activeHotspots,
      riskScore: m.riskScore,
      criticalFlora: m.criticalFlora,
      atRiskFlora: m.atRiskFlora,
    });

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
      windowDays,
      notificationsLast7Days: notifCount,
      notificationsPrev7Days: notifPrevCount,
      notificationsWindow: notifWindow,
      notificationsPrevWindow: notifPrevWindow,
      notificationsByDay,
      // real per-day sightings, as opposed to the cumulative `history[].sightings`
      sightingsByDay,
      pendingEscalations,
      pendingEscalationBlocks,
      recentCases,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute metrics' });
  }
});

// trigger summary - admin only (the live demo button)
router.post('/trigger-summary', aiLimiter, restrictTo('admin'), async (req, res) => {
  try {
    const result = await sendWeeklySummary(req.user.user_id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
