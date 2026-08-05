// angelyn
// captures a daily snapshot of headline metrics and computes real trend deltas
// (today vs yesterday, today vs 7 days ago) from the stored history.
const { Op } = require('sequelize');
const { MetricSnapshot } = require('../models');
const estateData = require('./estateDataService');
const { computeEstateMetrics } = require('./estateStats');

// YYYY-MM-DD for a Date (used as the snapshot's unique key).
function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// Compute today's metrics and upsert the row for today. Idempotent per day, so
// it's safe to run on every boot as well as on the daily schedule.
async function captureSnapshot() {
  const m = computeEstateMetrics({
    flora: await estateData.getFloraRecords(),
    sightings: await estateData.getFaunaSightings(),
    cases: await estateData.getCases(),
  });
  const values = {
    snapshot_date: dayKey(),
    open_cases: m.openCases,
    critical_flora: m.criticalFlora,
    at_risk_flora: m.atRiskFlora,
    active_hotspots: m.activeHotspots,
    total_sightings: m.totalSightings,
    risk_score: m.riskScore,
  };
  const [row, created] = await MetricSnapshot.findOrCreate({
    where: { snapshot_date: values.snapshot_date },
    defaults: values,
  });
  if (!created) await row.update(values);
  return row;
}

// Fetch the snapshot on-or-before a target day (nearest historical row), so a gap
// in the history still yields a sensible comparison instead of nothing.
async function snapshotOnOrBefore(dateStr) {
  return MetricSnapshot.findOne({
    where: { snapshot_date: { [Op.lte]: dateStr } },
    order: [['snapshot_date', 'DESC']],
  });
}

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

// Trend deltas for the metrics that have history. Returns null for a field when
// there's no baseline yet (fresh install), so the UI can hide the arrow rather
// than imply a change that isn't real.
async function getTrends(current) {
  const fields = ['open_cases', 'critical_flora', 'active_hotspots', 'risk_score'];
  const yesterday = await snapshotOnOrBefore(daysAgoKey(1));
  const lastWeek = await snapshotOnOrBefore(daysAgoKey(7));

  const map = {
    open_cases: current.openCases,
    critical_flora: current.criticalFlora,
    active_hotspots: current.activeHotspots,
    risk_score: current.riskScore,
  };

  const delta = (baseline, key) => (baseline ? map[key] - baseline[key] : null);

  const trends = {};
  for (const f of fields) {
    trends[f] = {
      sinceYesterday: delta(yesterday, f),
      sinceLastWeek: delta(lastWeek, f),
    };
  }
  return trends;
}

// The last `days` days of stored history (oldest first), excluding today - the
// route appends today's live value so the final point is always current.
async function getHistory(days = 11) {
  const rows = await MetricSnapshot.findAll({
    where: { snapshot_date: { [Op.lt]: dayKey() } },
    order: [['snapshot_date', 'DESC']],
    limit: days,
  });
  return rows.reverse().map(r => ({
    date: r.snapshot_date,
    openCases: r.open_cases,
    sightings: r.total_sightings,
    hotspots: r.active_hotspots,
    riskScore: r.risk_score,
    // already snapshotted daily - exposed so each KPI card can draw a real
    // trend line instead of only the headline number.
    criticalFlora: r.critical_flora,
    atRiskFlora: r.at_risk_flora,
  }));
}

module.exports = { captureSnapshot, getTrends, getHistory, dayKey };
