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
    const b = (blocks[s.block_number] ||= { count: 0, animals: new Set(), lastSeen: null });

    b.count += 1;
    if (s.species) b.animals.add(s.species);
    const t = s.createdAt ? new Date(s.createdAt) : null;
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
// WHY THIS IS A SHARE, NOT A COUNT.
//
// The score used to be  critical*15 + hotspots*10 + open*5 + atRisk*3,  clipped at
// 100. Those weights were tuned against a 7-row fixture. Against the real tables
// (39 plants) the raw figure is 189, so the hero card read 100/100 "critical"
// permanently and the ten-day trend line flatlined on the ceiling - see the
// headroom comment in seed.js, which was already working around this.
//
// The defect is structural, not a matter of re-tuning: absolute counts measure how
// much DATA an estate has, not how healthy it is. A 400-plant estate with 20
// critical plants is in better shape than a 25-plant estate with 20 critical, and
// the old formula scored the first one worse. Adding a healthy plant could never
// improve the score, only new problems could move it, and only upward.
//
// So each input becomes a 0-100 pressure reading against its own denominator, and
// the three are weighted into a total. Bounded by construction: no clipping, so a
// worsening estate keeps registering instead of parking at the cap.
const RISK_WEIGHTS = { flora: 0.45, cases: 0.35, hotspots: 0.20 };
// Critical flora counts triple an at-risk one - the ratio the old weights implied
// (15 vs 3 was 5x, but 5x put a single critical plant ahead of every other signal
// combined at small estate sizes; 3x keeps the ordering without that distortion).
const CRITICAL_MULTIPLIER = 3;
// Hotspot count has no natural denominator, so it saturates: five or more
// simultaneous hotspot blocks is already "as bad as this reading goes".
const HOTSPOT_SATURATION = 5;

function computeRiskScore({
  criticalFlora, activeHotspots, openCases, atRiskFlora, totalFlora, totalCases,
}) {
  // Worst case is every plant critical, hence the multiplier in the denominator.
  //
  // Each component is clamped to 100 as well. The counts should never exceed their
  // own total - a plant cannot be both critical and at-risk - but a caller passing
  // inconsistent figures must still get a score in range rather than 115, which is
  // what an earlier draft of this returned.
  const floraPressure = totalFlora > 0
    ? Math.min(100, 100 * (criticalFlora * CRITICAL_MULTIPLIER + atRiskFlora) / (totalFlora * CRITICAL_MULTIPLIER))
    : 0;
  // Share of cases still waiting. An estate that resolves what it opens reads low
  // here even while busy, which is the honest signal.
  const casePressure = totalCases > 0 ? Math.min(100, 100 * openCases / totalCases) : 0;
  const hotspotPressure = 100 * Math.min(1, (activeHotspots || 0) / HOTSPOT_SATURATION);

  return Math.round(
    RISK_WEIGHTS.flora * floraPressure
    + RISK_WEIGHTS.cases * casePressure
    + RISK_WEIGHTS.hotspots * hotspotPressure,
  );
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
  sightings.forEach(s => { byBlock[s.block_number] = (byBlock[s.block_number] || 0) + 1; });
  const sightingsByBlock = Object.entries(byBlock)
    .map(([block_number, count]) => ({ block_number, count }))
    .sort((a, b) => b.count - a.count);

  const riskScore = computeRiskScore({
    criticalFlora,
    activeHotspots: hotspots.length,
    openCases,
    atRiskFlora,
    totalFlora: flora.length,
    totalCases: cases.length,
  });

  return {
    criticalFlora,
    atRiskFlora,
    openCases,
    activeHotspots: hotspots.length,
    hotspots,
    // Exposed because the score is now a share: without the denominators a reader
    // cannot check the figure, and the dashboard wants "6 of 39" rather than "6".
    totalFlora: flora.length,
    totalCases: cases.length,
    totalSightings: sightings.length,
    casesByStatus,
    casesByCategory,
    sightingsByBlock,
    riskScore,
    riskStatus: riskStatus(riskScore),
  };
}

module.exports = { computeHotspots, computeEstateMetrics, computeRiskScore, riskStatus };
