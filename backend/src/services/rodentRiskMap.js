// angelyn
// Rodent Risk Map: severity-weighted geographic points built from rodent
// assessments that carry a REPORTED coordinate. Rodent-only and severity-
// weighted - the signal this module has that the fauna pin map does not.
//
// HONESTY (baked into the return value, not bolted on):
//   - Never invents a position. Assessments without valid coordinates are
//     EXCLUDED from points and counted in unmappedCount - never placed at a block
//     centroid, jittered, or approximated.
//   - Returns totalAssessments / mappedCount / unmappedCount so the UI can state
//     its own coverage plainly ("N of M have a recorded location").
//   - Aggregates only assessments at the EXACT same reported coordinate; two
//     distinct captures stay two points. No clustering that moves a point.
//   - Intensity is severity-weighted (count x band weight), never a raw count, and
//     count is returned so one report can't read as loudly as several.

// Explainable severity weights (not a magic number). Exported so the UI can show
// them. Tune here if the client reprioritises.
const RISK_WEIGHTS = { low: 1, medium: 3, high: 6, critical: 10 };
const RISK_ORDER = ['low', 'medium', 'high', 'critical'];
const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// Parse a stored coordinate to a number, or NaN if it is not a real value.
// CRITICAL: null/undefined/'' must become NaN, NOT 0 - Number(null) === 0 would
// silently place an unmapped report at (0,0) (null island), inventing a position.
function coord(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// A coordinate is usable only if BOTH parts are finite and in range. A lone lat,
// a lone lng, or an out-of-range value is treated as "no position" - never
// half-placed at (0,0) or clamped to an edge.
function validCoord(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

// Build the map data. Pure: no DB calls, no I/O. `now` is injectable (defaulting
// to Date.now()) only so the window is testable with fixed fixtures, matching the
// estateStats / scorecard pattern.
function computeRiskMap({ assessments = [], windowDays = 30, now = Date.now() } = {}) {
  const since = now - windowDays * DAY_MS;

  let totalAssessments = 0;
  let mappedCount = 0;
  let unmappedCount = 0;
  const byCoord = new Map();

  for (const a of assessments) {
    const t = toTime(a.createdAt);
    if (t === null || t < since) continue;            // outside window: not shown, not counted
    if (!RISK_ORDER.includes(a.risk_level)) continue;  // unrankable severity: can't weight it
    totalAssessments += 1;

    const lat = coord(a.gps_lat);
    const lng = coord(a.gps_lng);
    if (!validCoord(lat, lng)) {
      unmappedCount += 1;   // real: reported without a position - counted, never placed
      continue;
    }
    mappedCount += 1;

    const key = `${lat},${lng}`;
    let p = byCoord.get(key);
    if (!p) {
      p = {
        lat,
        lng,
        weightedScore: 0,
        peakWeight: 0,
        riskLevel: null,          // the peak (worst) risk at this exact point
        block: (a.block_number || '').trim() || null,
        count: 0,
        assessments: [],          // the reports behind this point (for click-through)
      };
      byCoord.set(key, p);
    }
    const w = RISK_WEIGHTS[a.risk_level];
    p.weightedScore += w;
    p.count += 1;
    if (w > p.peakWeight) { p.peakWeight = w; p.riskLevel = a.risk_level; }
    p.assessments.push({
      id: a.id,
      createdAt: a.createdAt,
      risk_level: a.risk_level,
      block_number: a.block_number || null,
      floor_level: a.floor_level || null,
      observations: a.observations || null,
    });
  }

  const points = [...byCoord.values()].map(({ peakWeight, ...p }) => p);
  // latest report first inside a point, so the popup leads with the most recent
  points.forEach(p => p.assessments.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt)));
  // heaviest points first
  points.sort((a, b) => b.weightedScore - a.weightedScore || b.count - a.count);

  const scaleMax = points.reduce((m, p) => Math.max(m, p.weightedScore), 0);

  return {
    weights: RISK_WEIGHTS,
    windowDays,
    totalAssessments,
    mappedCount,
    unmappedCount,
    scaleMax,
    points,
  };
}

module.exports = { computeRiskMap, RISK_WEIGHTS };
