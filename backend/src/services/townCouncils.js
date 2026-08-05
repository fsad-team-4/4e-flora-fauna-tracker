// angelyn
// Town council regions for grouping the regional map.
//
// APPROXIMATE - THIS IS THE IMPORTANT PART.
// Real Singapore town council boundaries are complex polygons that follow
// electoral division lines, and they are redrawn after each general election
// (two new councils were formed in Aug 2025, bringing the total to 19). We do
// not have the official boundary geometry in this build, so each council here is
// a CIRCLE around its town centre. That is good enough to group sensors that sit
// inside a town, and NOT good enough to answer "which council owns this address".
//
// Consequences, enforced rather than assumed:
//   - `approximate: true` rides on every response that uses these regions, so the
//     legend and the UI can say so.
//   - A point outside every radius returns null, never a nearest-guess. "Outside
//     the modelled region" and "in council X" are different claims.
//   - Case and work-order labelling IS allowed, but only ever carrying the
//     approximate flag with it. An earlier version of this file forbade it
//     outright; that was relaxed deliberately, because the alternative was a
//     dashboard that could not answer "which council is in charge" at all. The
//     vendor briefing in routes/workOrders.js already worked this way. The rule
//     that remains absolute: never present a modelled council as authoritative,
//     and never fill a gap by proximity.
//
// All 19 councils are listed, with their constituencies recorded so the mapping
// can be checked against the electoral boundaries it derives from. NOTE that the
// four original entries (amk, btp, nsn, smb) keep their exact original centres
// and radii - the sensor-surface tests pin cell membership to them, so they are
// not to be re-tuned casually.
const COUNCILS = [
  // --- the four originally modelled, unchanged ---------------------------------
  { id: 'amk', name: 'Ang Mo Kio Town Council', lat: 1.3691, lng: 103.8454, radiusKm: 2.4,
    constituencies: ['Ang Mo Kio GRC', 'Kebun Baru SMC', 'Yio Chu Kang SMC'] },
  { id: 'btp', name: 'Bishan-Toa Payoh Town Council', lat: 1.3430, lng: 103.8500, radiusKm: 3.0,
    constituencies: ['Bishan-Toa Payoh GRC', 'Marymount SMC'] },
  { id: 'nsn', name: 'Nee Soon Town Council', lat: 1.4304, lng: 103.8354, radiusKm: 2.8,
    constituencies: ['Nee Soon GRC'] },
  { id: 'smb', name: 'Sembawang Town Council', lat: 1.4491, lng: 103.8200, radiusKm: 2.8,
    constituencies: ['Sembawang GRC', 'Sembawang West SMC'] },

  // --- the remaining fifteen --------------------------------------------------
  // Centres are town centres to the nearest few hundred metres. Any of these can
  // be corrected without touching logic; only this array carries the geography.
  { id: 'ahg', name: 'Aljunied-Hougang Town Council', lat: 1.3712, lng: 103.8863, radiusKm: 3.0,
    constituencies: ['Aljunied GRC', 'Hougang SMC'] },
  { id: 'cck', name: 'Chua Chu Kang Town Council', lat: 1.3840, lng: 103.7470, radiusKm: 3.0,
    constituencies: ['Chua Chu Kang GRC', 'Bukit Gombak SMC'] },
  { id: 'ecc', name: 'East Coast Town Council', lat: 1.3236, lng: 103.9273, radiusKm: 3.2,
    constituencies: ['East Coast GRC'] },
  { id: 'hbp', name: 'Holland-Bukit Panjang Town Council', lat: 1.3774, lng: 103.7719, radiusKm: 3.0,
    constituencies: ['Holland-Bukit Timah GRC', 'Bukit Panjang SMC'] },
  { id: 'jbs', name: 'Jalan Besar Town Council', lat: 1.3100, lng: 103.8560, radiusKm: 2.5,
    constituencies: ['Jalan Besar GRC', 'Potong Pasir SMC'] },
  { id: 'jky', name: 'Jalan Kayu Town Council', lat: 1.3920, lng: 103.8720, radiusKm: 2.2,
    constituencies: ['Jalan Kayu SMC'] },
  { id: 'jcb', name: 'Jurong-Clementi-Bukit Batok Town Council', lat: 1.3400, lng: 103.7450, radiusKm: 3.4,
    constituencies: ['Jurong East-Bukit Batok GRC', 'Jurong Central SMC'] },
  { id: 'mpb', name: 'Marine Parade-Braddell Heights Town Council', lat: 1.3080, lng: 103.9060, radiusKm: 3.0,
    constituencies: ['Marine Parade-Braddell Heights GRC', 'Mountbatten SMC'] },
  { id: 'myt', name: 'Marsiling-Yew Tee Town Council', lat: 1.4300, lng: 103.7740, radiusKm: 3.0,
    constituencies: ['Marsiling-Yew Tee GRC'] },
  { id: 'prc', name: 'Pasir Ris-Changi Town Council', lat: 1.3721, lng: 103.9490, radiusKm: 3.2,
    constituencies: ['Pasir Ris-Changi GRC'] },
  { id: 'pgl', name: 'Punggol Town Council', lat: 1.4050, lng: 103.9020, radiusKm: 2.8,
    constituencies: ['Punggol GRC'] },
  { id: 'skg', name: 'Sengkang Town Council', lat: 1.3910, lng: 103.8950, radiusKm: 2.6,
    constituencies: ['Sengkang GRC'] },
  { id: 'tam', name: 'Tampines Town Council', lat: 1.3530, lng: 103.9450, radiusKm: 3.2,
    constituencies: ['Tampines GRC', 'Tampines Changkat SMC'] },
  { id: 'tjp', name: 'Tanjong Pagar Town Council', lat: 1.2760, lng: 103.8430, radiusKm: 3.0,
    constituencies: ['Tanjong Pagar GRC', 'Queenstown SMC', 'Radin Mas SMC'] },
  { id: 'wcj', name: 'West Coast-Jurong West Town Council', lat: 1.3400, lng: 103.7050, radiusKm: 3.4,
    constituencies: ['West Coast-Jurong West GRC', 'Pioneer SMC'] },
];

// Singapore's rough extent - the map is bounded to this so it cannot be panned
// to another country, and so a bad coordinate is obvious rather than plotted.
const SG_BOUNDS = { south: 1.15, west: 103.6, north: 1.48, east: 104.1 };

const EARTH_R_KM = 6371;
function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(s));
}

function inSingapore(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= SG_BOUNDS.south && lat <= SG_BOUNDS.north
    && lng >= SG_BOUNDS.west && lng <= SG_BOUNDS.east;
}

/**
 * Which modelled council region contains this point?
 *
 * Returns null when the point is outside every radius - deliberately NOT the
 * nearest council. A coarse circle model has genuine gaps, and filling them by
 * proximity would turn "we do not model this area" into a confident wrong answer.
 */
function councilFor(lat, lng) {
  if (!inSingapore(lat, lng)) return null;
  let best = null;
  for (const c of COUNCILS) {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d <= c.radiusKm && (!best || d < best.d)) best = { c, d };
  }
  return best ? best.c.name : null;
}

const councilNames = () => COUNCILS.map(c => c.name);

module.exports = {
  COUNCILS,
  SG_BOUNDS,
  councilFor,
  councilNames,
  inSingapore,
  haversineKm,
  // rides on API responses so the UI can label the grouping honestly
  BOUNDARIES_ARE_APPROXIMATE: true,
};
