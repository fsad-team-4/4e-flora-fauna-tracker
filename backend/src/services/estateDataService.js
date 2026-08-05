// angelyn
// Real queries against the tables the other members own: flora (M1 GreeneryRecord),
// fauna (M2 FaunaSighting) and resident cases (M3 ResidentReport).
//
// This replaces mockDataService, which returned hardcoded arrays while those
// tables were still being built. The function names and the returned field names
// are deliberately unchanged, so estateStats, blockDiagnosis, the dashboard, the
// metric snapshots and the weekly summary keep their existing contract. The only
// difference callers see is that these are async now.
//
// Soft-deleted rows are excluded everywhere: the other modules hide them from
// their own lists, so a metric that counted them would disagree with the page a
// user is looking at.
const { GreeneryRecord, FaunaSighting, ResidentReport } = require('../models');
const { councilFor, BOUNDARIES_ARE_APPROXIMATE } = require('./townCouncils');

// The council in charge of a row, resolved from its GPS pin. Null when the row has
// no usable position or sits outside every modelled region - never a nearest-guess.
// Every consumer that shows this must also show that it is approximate; the flag
// travels with the value so that cannot be forgotten.
function councilOf(row) {
  const lat = Number(row.gps_lat);
  const lng = Number(row.gps_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return councilFor(lat, lng);
}

// Shernell's GreeneryRecord stores the block in location_zone ('Block 123').
// The dashboard contract calls that block_number, so both keys are returned
// rather than making every consumer know which module named it what.
async function getFloraRecords() {
  const rows = await GreeneryRecord.findAll({
    where: { is_deleted: false },
    order: [['id', 'ASC']],
  });
  return rows.map(r => ({
    id: r.id,
    species: r.species,
    location: r.location_zone,
    block_number: r.location_zone,
    health_status: r.health_status,
    last_inspected: r.last_inspected_at,
    // Always null: GreeneryRecord has no gps_lat/gps_lng, so a plant cannot be
    // resolved to a council by position. Present in the shape anyway so the UI
    // has one uniform contract and renders "not recorded" without special-casing.
    // Attributing flora needs either coordinates on the model or a block register.
    town_council: null,
  }));
}

// behaviour_tags is returned as the real JSON array. blockDiagnosis and
// feedingPoints both already read the array shape; the single-string `behaviour`
// key was a mockDataService artefact and no longer exists.
async function getFaunaSightings() {
  const rows = await FaunaSighting.findAll({
    where: { is_deleted: false },
    order: [['id', 'ASC']],
  });
  return rows.map(r => ({
    id: r.id,
    species: r.species,
    block_number: r.block_number,
    floor: r.floor_level,
    behaviour_tags: r.behaviour_tags,
    gps_lat: r.gps_lat,
    gps_lng: r.gps_lng,
    town_council: councilOf(r),
    town_council_approximate: BOUNDARIES_ARE_APPROXIMATE,
    createdAt: r.createdAt,
  }));
}

async function getCases() {
  const rows = await ResidentReport.findAll({
    where: { is_deleted: false },
    order: [['id', 'ASC']],
  });
  return rows.map(r => ({
    id: r.id,
    category: r.category,
    block_number: r.block_number,
    title: r.title,
    status: r.status,
    gps_lat: r.gps_lat,
    gps_lng: r.gps_lng,
    town_council: councilOf(r),
    town_council_approximate: BOUNDARIES_ARE_APPROXIMATE,
    createdAt: r.createdAt,
  }));
}

module.exports = { getFloraRecords, getFaunaSightings, getCases };
