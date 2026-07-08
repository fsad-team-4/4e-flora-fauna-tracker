// angelyn
// single source of truth for derived estate metrics.
// used by the dashboard route, the weekly summary and the daily metric snapshot
// so their numbers can't drift apart (thresholds and field names live in one place).

// a hotspot is a block with minCount or more fauna sightings.
// output key is block_number to match the dashboard/frontend contract.
// each hotspot also carries the count, the animals seen there and the most
// recent sighting time (lastSeen) so the UI can show richer context.
function computeHotspots(sightings, minCount = 3) {
  const blocks = {};
  sightings.forEach(s => {
    const b = (blocks[s.block] ||= { count: 0, animals: new Set(), lastSeen: null });
    b.count += 1;
    if (s.animal_type) b.animals.add(s.animal_type);
    const t = s.date ? new Date(s.date) : null;
    if (t && (!b.lastSeen || t > b.lastSeen)) b.lastSeen = t;
  });
  return Object.entries(blocks)
    .filter(([, b]) => b.count >= minCount)
    .map(([block_number, b]) => ({
      block_number,
      count: b.count,
      animals: [...b.animals],
      lastSeen: b.lastSeen ? b.lastSeen.toISOString() : null,
    }))
    .sort((a, b) => b.count - a.count); // worst block first
}

// Estate risk index: a transparent 0-100 heuristic weighted toward the things
// that most need staff action. Documented here so the number is explainable, not
// a black box. Tune the weights in one place if priorities change.
const RISK_WEIGHTS = { criticalFlora: 15, activeHotspots: 10, openCases: 5, atRiskFlora: 3 };

function computeRiskScore({ criticalFlora, activeHotspots, openCases, atRiskFlora }) {
  const raw =
    criticalFlora * RISK_WEIGHTS.criticalFlora +
    activeHotspots * RISK_WEIGHTS.activeHotspots +
    openCases * RISK_WEIGHTS.openCases +
    atRiskFlora * RISK_WEIGHTS.atRiskFlora;
  return Math.min(100, raw);
}

// score -> traffic-light status the hero card renders.
function riskStatus(score) {
  if (score >= 60) return 'critical'; // Needs Attention
  if (score >= 25) return 'watch';    // Watch
  return 'healthy';                   // Healthy
}

// Headline metrics derived purely from the point-in-time domain data (flora,
// sightings, cases). Notification counts live in the DB, so the route adds those
// separately - this stays synchronous and snapshot-friendly.
function computeEstateMetrics({ flora, sightings, cases }) {
  const criticalFlora = flora.filter(f => f.health_status === 'critical').length;
  const atRiskFlora = flora.filter(f => f.health_status === 'at_risk').length;
  const openCases = cases.filter(c => c.status === 'open').length;
  const hotspots = computeHotspots(sightings);

  const casesByStatus = {
    open: openCases,
    in_progress: cases.filter(c => c.status === 'in_progress').length,
    resolved: cases.filter(c => c.status === 'resolved').length,
  };

  const byCategory = {};
  cases.forEach(c => { byCategory[c.category] = (byCategory[c.category] || 0) + 1; });
  const casesByCategory = Object.entries(byCategory).map(([category, count]) => ({ category, count }));

  // every block ranked by sighting volume (for the "activity by block" list)
  const byBlock = {};
  sightings.forEach(s => { byBlock[s.block] = (byBlock[s.block] || 0) + 1; });
  const sightingsByBlock = Object.entries(byBlock)
    .map(([block, count]) => ({ block, count }))
    .sort((a, b) => b.count - a.count);

  const riskScore = computeRiskScore({ criticalFlora, activeHotspots: hotspots.length, openCases, atRiskFlora });

  return {
    criticalFlora,
    atRiskFlora,
    openCases,
    activeHotspots: hotspots.length,
    hotspots,
    totalSightings: sightings.length,
    casesByStatus,
    casesByCategory,
    sightingsByBlock,
    riskScore,
    riskStatus: riskStatus(riskScore),
  };
}

module.exports = { computeHotspots, computeEstateMetrics, computeRiskScore, riskStatus };
