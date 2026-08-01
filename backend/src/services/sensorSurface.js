// angelyn
// Continuous activity surface from SIMULATED RATSENSE sensor readings.
//
// ============================ WHY INTERPOLATION IS OK HERE ==================
// Interpolation is only legitimate when the samples measure a field that
// genuinely exists everywhere between them. A weather map interpolates because
// there IS a temperature halfway between two stations.
//
// Officer-reported assessments are NOT such a field: the space between two
// reports has no true value, so smoothing them would invent evidence. That is
// why computeRiskMap (services/rodentRiskMap.js) keeps them as discrete points
// and this file never touches them.
//
// A grid of fixed sensors sampling continuously IS a field, so interpolating
// between them is the same operation a weather map performs. Every reading this
// consumes is simulated pilot data, and `is_simulated: true` rides on the
// returned envelope so no consumer can render it without the label.
// ===========================================================================
//
// Method: inverse distance weighting (IDW, power 2) with a cutoff radius.
// Chosen over a kernel/spline because it is explainable in one line to a
// non-technical reviewer - "each cell is the average of nearby sensors, weighted
// so closer ones count more" - and because it never overshoots the observed
// range, so the surface cannot show an intensity no sensor ever recorded.
const { councilFor, inSingapore, haversineKm, BOUNDARIES_ARE_APPROXIMATE } = require('./townCouncils');

// Beyond this, a sensor contributes nothing to a cell. Without a cutoff, IDW
// smears a single sensor across the whole island and produces a confident-looking
// surface over areas with no coverage at all.
const INFLUENCE_RADIUS_KM = 1.2;
const IDW_POWER = 2;

// Fine enough that marching squares yields smooth bands instead of visible
// steps. Only covered cells carry a number and values are 1dp, so even at the
// cap the payload stays a few hundred KB.
const MAX_GRID = 256;

function toTime(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Latest reading per sensor at or before `asOf`.
 *
 * A sensor is a fixed device reporting repeatedly, so the surface at a moment in
 * time is built from each sensor's most recent reading by then - not an average
 * over all history, which would flatten a spike that has already been dealt with.
 */
function latestPerSensor(readings, asOfMs) {
  const bySensor = new Map();
  for (const r of readings) {
    const t = toTime(r.recorded_at);
    if (t === null || t > asOfMs) continue;
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!inSingapore(lat, lng)) continue;         // never plot outside the modelled area
    const level = Number(r.activity_level);
    if (!Number.isFinite(level)) continue;

    const prev = bySensor.get(r.sensor_id);
    if (!prev || t > prev.t) {
      bySensor.set(r.sensor_id, {
        t,
        sensor_id: r.sensor_id,
        lat,
        lng,
        activity_level: level,
        location_type: r.location_type || null,
        town_council: r.town_council || councilFor(lat, lng),
        recorded_at: r.recorded_at,
      });
    }
  }
  return [...bySensor.values()];
}

/**
 * Build the interpolated surface.
 *
 * Pure: no DB calls, no I/O, no clock read unless `asOf` is omitted - so it is
 * unit-testable against fixtures, matching the computeRiskMap / computeScorecard
 * pattern used elsewhere in this codebase.
 *
 * @param readings       simulated SensorReading rows (or plain fixtures)
 * @param asOf           surface time; defaults to now
 * @param gridResolution cells per axis across the sensors' bounding box
 * @param councils       optional filter - only these council names contribute
 */
function computeSensorSurface({
  readings = [],
  asOf = null,
  gridResolution = 28,
  councils = null,
} = {}) {
  const asOfMs = asOf ? toTime(asOf) : Date.now();
  let sensors = latestPerSensor(readings, asOfMs);
  if (councils && councils.length) {
    const want = new Set(councils);
    sensors = sensors.filter(s => want.has(s.town_council));
  }

  const empty = {
    is_simulated: true,
    source: 'RATSENSE pilot (simulated)',
    boundaries_approximate: BOUNDARIES_ARE_APPROXIMATE,
    asOf: new Date(asOfMs).toISOString(),
    gridResolution,
    influenceRadiusKm: INFLUENCE_RADIUS_KM,
    sensorCount: 0,
    readingCount: 0,
    scaleMax: 0,
    bounds: null,
    grid: null,
    coveredCells: 0,
    councils: [],
  };
  if (sensors.length === 0) return empty;

  const lats = sensors.map(s => s.lat);
  const lngs = sensors.map(s => s.lng);
  /**
   * Pad by AT LEAST the influence radius, in degrees.
   *
   * This was a flat 0.006 deg (~670m) while sensors influence out to
   * INFLUENCE_RADIUS_KM (1.2km ~ 0.0108 deg). Any sensor near the bounding box
   * got its circular footprint sliced off flat by the box, which rendered as
   * hard straight edges and square corners on the surface - a clip artefact
   * masquerading as a data boundary. The margin makes every sensor's full
   * footprint fit inside the grid, so the only edges left are real ones.
   */
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const KM_PER_DEG_LAT = 110.574;
  const KM_PER_DEG_LNG = 111.320 * Math.cos((midLat * Math.PI) / 180);
  const padLat = (INFLUENCE_RADIUS_KM / KM_PER_DEG_LAT) * 1.08;   // +8% margin
  const padLng = (INFLUENCE_RADIUS_KM / KM_PER_DEG_LNG) * 1.08;
  const bounds = {
    south: Math.min(...lats) - padLat,
    north: Math.max(...lats) + padLat,
    west: Math.min(...lngs) - padLng,
    east: Math.max(...lngs) + padLng,
  };

  // A DENSE grid, not a sparse cell list. The renderer runs marching squares
  // over this to produce smooth contour bands; a sparse list of coloured
  // rectangles is exactly what made the old surface read as coarse tiles.
  // Row-major from the SOUTH edge upward, so row 0 sits at bounds.south.
  const n = Math.max(4, Math.min(MAX_GRID, Math.floor(gridResolution)));
  const dLat = (bounds.north - bounds.south) / n;
  const dLng = (bounds.east - bounds.west) / n;

  const values = new Array(n * n).fill(null);
  let scaleMax = 0;
  let coveredCells = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cLat = bounds.south + (i + 0.5) * dLat;
      const cLng = bounds.west + (j + 0.5) * dLng;

      let num = 0;
      let den = 0;
      let contributing = 0;
      for (const s of sensors) {
        const d = haversineKm(cLat, cLng, s.lat, s.lng);
        if (d > INFLUENCE_RADIUS_KM) continue;
        contributing += 1;
        if (d < 1e-6) { num = s.activity_level; den = 1; contributing = 1; break; } // on top of a sensor
        // Compactly-supported kernel: inverse distance TAPERED to zero at the
        // influence radius. Plain 1/d^2 with a hard cutoff gave a sensor full
        // weight at 1.19km and none at 1.21km, so the field cliff-edged mid-ramp
        // and the surface stopped on an abrupt colour instead of fading out.
        // The taper does not extend coverage - the radius is unchanged - it only
        // stops pretending influence is uniform right up to the boundary.
        const taper = (1 - d / INFLUENCE_RADIUS_KM) ** 2;
        const w = (1 / d ** IDW_POWER) * taper;
        num += w * s.activity_level;
        den += w;
      }
      // No sensor within the influence radius: NO DATA, held as null.
      // A 0 here would claim "measured, and it was quiet" - a different and
      // false claim - and would let the renderer draw a band across ground no
      // sensor covers.
      if (contributing === 0 || den === 0) continue;

      const value = num / den;
      scaleMax = Math.max(scaleMax, value);
      coveredCells += 1;
      values[i * n + j] = Math.round(value * 10) / 10;   // 1dp keeps the payload small
    }
  }

  const councilSet = [...new Set(sensors.map(s => s.town_council).filter(Boolean))].sort();

  return {
    ...empty,
    sensorCount: sensors.length,
    readingCount: readings.length,
    scaleMax: Math.round(scaleMax * 100) / 100,
    bounds,
    coveredCells,
    // Row-major, length width*height, null where no sensor is in range. That
    // null mask IS the coverage boundary: the renderer contours it directly
    // rather than approximating coverage with a convex hull, which would bridge
    // the empty ground between distant town councils and imply cover we lack.
    grid: { width: n, height: n, dLat, dLng, values },
    councils: councilSet,
    sensors: sensors.map(s => ({
      sensor_id: s.sensor_id,
      lat: s.lat,
      lng: s.lng,
      location_type: s.location_type,
      town_council: s.town_council,
      activity_level: s.activity_level,
      recorded_at: s.recorded_at,
    })),
  };
}

module.exports = { computeSensorSurface, latestPerSensor, INFLUENCE_RADIUS_KM, IDW_POWER, MAX_GRID };
