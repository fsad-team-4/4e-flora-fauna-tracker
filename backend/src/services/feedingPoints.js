// angelyn
// Feeding sighting points: the SECOND layer of the rodent risk map. Feeding-tagged
// fauna sightings that carry a REPORTED coordinate, so the feeding/rodent
// co-occurrence that blockDiagnosis computes becomes visible spatially - the map
// is the only place the two data sets meet on the ground.
//
// Feeding is a CATEGORY, not a magnitude - there is deliberately NO severity
// weight here (that is the rodent layer's job). A point is simply "feeding was
// reported at this exact spot", carrying the count behind it and a species
// breakdown for the popup.
//
// HONESTY (the same guarantees as the rodent layer, so the two layers are equally
// truthful about their own coverage):
//   - Never invents a position. Sightings without a valid coordinate are EXCLUDED
//     from points and counted in unmappedCount - never placed at a block centroid,
//     jittered, or approximated.
//   - Aggregates only sightings at the EXACT same reported coordinate; two distinct
//     captures stay two points. No clustering that moves a point.
//   - Returns total / mappedCount / unmappedCount so the UI can state its own
//     coverage plainly for this layer too ("N of M feeding sightings have a
//     recorded location").

const { FEEDING_TAG } = require('./blockDiagnosis'); // single source of truth for the tag
const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// Parse a stored coordinate to a number, or NaN if it is not a real value.
// CRITICAL: null/undefined/'' must become NaN, NOT 0 - Number(null) === 0 would
// silently place an unmapped sighting on null island, inventing a position.
function coord(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Usable only if BOTH parts are finite and in range; a lone lat/lng or an
// out-of-range value is "no position", never half-placed at (0,0) or clamped.
function validCoord(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

// A sighting is feeding only if its behaviour_tags array includes the tag. The map
// reads the real FaunaSighting table, whose tags are always a JSON array; the
// string-shaped legacy sightings live only in mockDataService and never reach here.
function hasFeeding(s) {
  return Array.isArray(s.behaviour_tags) && s.behaviour_tags.includes(FEEDING_TAG);
}

// Build the feeding layer. Pure: no DB calls, no I/O. `now` is injectable
// (defaulting to Date.now()) only so the window is testable with fixed fixtures,
// matching the rodentRiskMap / estateStats pattern.
function computeFeedingPoints({ sightings = [], windowDays = 30, now = Date.now() } = {}) {
  const since = now - windowDays * DAY_MS;

  let total = 0;
  let mappedCount = 0;
  let unmappedCount = 0;
  const byCoord = new Map();

  for (const s of sightings) {
    const t = toTime(s.createdAt);
    if (t === null || t < since) continue;   // outside window: not shown, not counted
    if (!hasFeeding(s)) continue;             // not a feeding sighting: not this layer
    total += 1;

    const lat = coord(s.gps_lat);
    const lng = coord(s.gps_lng);
    if (!validCoord(lat, lng)) {
      unmappedCount += 1;   // real: feeding reported without a position - counted, never placed
      continue;
    }
    mappedCount += 1;

    const key = `${lat},${lng}`;
    let p = byCoord.get(key);
    if (!p) {
      p = {
        lat,
        lng,
        block: (s.block_number || '').trim() || null,
        count: 0,
        species: {},       // species -> count, for the popup breakdown
        sightings: [],     // the sightings behind this point (for click-through)
      };
      byCoord.set(key, p);
    }
    p.count += 1;
    const sp = s.species || 'other';
    p.species[sp] = (p.species[sp] || 0) + 1;
    p.sightings.push({
      id: s.id,
      createdAt: s.createdAt,
      species: s.species || null,
      block_number: s.block_number || null,
      floor_level: s.floor_level || null,
      notes: s.notes || null,
    });
  }

  const points = [...byCoord.values()];
  // latest sighting first inside a point, so the popup leads with the most recent
  points.forEach(p => p.sightings.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt)));
  // busiest points first
  points.sort((a, b) => b.count - a.count);

  return { windowDays, total, mappedCount, unmappedCount, points };
}

module.exports = { computeFeedingPoints, FEEDING_TAG };
