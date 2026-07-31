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
//   - These are used for the SIMULATED sensor layer and for labelling. They must
//     not be used to assign a town council to a real work order or report.
//
// Council names verified against the current list of 19 town councils; centres
// are the HDB town centres, taken as round figures because the radius is coarse.
const COUNCILS = [
  { id: 'amk', name: 'Ang Mo Kio Town Council', lat: 1.3691, lng: 103.8454, radiusKm: 2.4 },
  { id: 'btp', name: 'Bishan-Toa Payoh Town Council', lat: 1.3430, lng: 103.8500, radiusKm: 3.0 },
  { id: 'nsn', name: 'Nee Soon Town Council', lat: 1.4304, lng: 103.8354, radiusKm: 2.8 },
  { id: 'smb', name: 'Sembawang Town Council', lat: 1.4491, lng: 103.8200, radiusKm: 2.8 },
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
