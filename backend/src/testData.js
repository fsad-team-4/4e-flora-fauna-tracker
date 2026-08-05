// angelyn
// TEST DATA - a known, fixed dataset written into the real tables so the
// completed application can be verified against the database rather than against
// hardcoded arrays. This is what replaced mockDataService.
//
// Not the same thing as seed.js: seed.js populates the estate so a demo looks
// alive. This script inserts a documented dataset whose expected values are
// asserted in tests/angelyn/test-cases.md, so a reviewer can trace any dashboard
// number back to specific rows.
//
// COVERS EVERY M4 PAGE, not just the dashboard. A page with an empty table cannot
// be verified - an empty Notification Log and a broken Notification Log look
// identical - so this writes rows for every surface the module owns: the estate
// dashboard, the rodent risk assessment list and map, the prevention scorecard,
// work orders and the action queue, alert rules, the notification log and the
// simulated sensor surface. Each dataset carries the mix of states the page is
// meant to distinguish (a failed notification as well as sent ones, a work order
// at every stage, a premises as well as blocks) rather than N copies of the happy
// path.
//
// Idempotent: every row it writes carries TAG in a free-text field, and the
// script deletes only TAG-carrying rows before re-inserting. Re-running converges
// to the same state and never touches records created by hand or by seed.js. The
// match is a LIKE, not equality, so a row can carry realistic text AND the tag -
// which is why a reviewer sees "[test-data]" at the end of the seeded free text.
//
// Targets whatever DATABASE_URL points at (Neon/Postgres in deployment, the local
// SQLite file when unset), because it goes through the Sequelize models.
//
// Usage:  npm run test-data
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  sequelize, User, GreeneryRecord, FaunaSighting, ResidentReport,
  RodentAssessment, WorkOrder, WorkOrderEvent, AlertRule, NotificationLog,
  SensorReading, MetricSnapshot,
} = require('./models');

const TAG = '[test-data]';
const PASSWORD = process.env.TEST_DATA_PASSWORD || 'local-demo-only';

// Tag suffix for fields that also carry real content. `tagged` is what goes into
// the row; `LIKE_TAG` is what finds it again.
const tagged = text => `${text} ${TAG}`;
const LIKE_TAG = { [Op.like]: `%${TAG}%` };

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function hoursAgo(n) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - Math.round(n * 60));
  return d;
}
const dateKey = d => d.toISOString().slice(0, 10);

// One account per role, so every access path in the app can be exercised. The
// resident is the account the case-status email in M3/M5 is addressed to.
const ACCOUNTS = [
  { name: 'Test Admin', email: 'test.admin@emservices.com.sg', role: 'admin' },
  { name: 'Test Officer', email: 'test.officer@emservices.com.sg', role: 'staff' },
  { name: 'Test Resident', email: 'test.resident@example.com', role: 'resident' },
];

/**
 * THE PLACES. Declared once, because a block label and its coordinates have to
 * agree across four tables - a rodent assessment, a resident case, a work order
 * and a sensor reading at "Blk 846 Yishun Ring Rd" must all land on the same pin,
 * or the map's co-occurrence ring and the block table's joins are testing nothing.
 *
 * Labels deliberately use BOTH spellings ("Block 123" and "Blk 846 ..."), because
 * the live data does, and blockKey() in services/blockDiagnosis.js exists to
 * normalise exactly that. A dataset that only ever wrote one spelling would let a
 * regression in that normaliser through.
 *
 * `premises: true` marks a location that is not a residential block. It matters
 * beyond cosmetics: a block is the town council's own contractor to dispatch, a
 * licensed food unit is NEA's, and the rodent map draws the two differently.
 */
const PLACES = {
  amk123: { block: 'Block 123', lat: 1.3691, lng: 103.8454, council: 'Ang Mo Kio Town Council' },
  amk456: { block: 'Block 456', lat: 1.3702, lng: 103.8467, council: 'Ang Mo Kio Town Council' },
  amk789: { block: 'Block 789', lat: 1.3675, lng: 103.8441, council: 'Ang Mo Kio Town Council' },
  amk234: { block: 'Block 234', lat: 1.3712, lng: 103.8432, council: 'Ang Mo Kio Town Council' },
  amkHub: { block: 'AMK Hub Basement Foodcourt', lat: 1.3695, lng: 103.8480, council: 'Ang Mo Kio Town Council', premises: true },
  chongBoon: { block: 'Chong Boon Market & Food Centre', lat: 1.3720, lng: 103.8496, council: 'Ang Mo Kio Town Council', premises: true },
  tp79: { block: 'Blk 79 Toa Payoh Lor 4', lat: 1.3355, lng: 103.8492, council: 'Bishan-Toa Payoh Town Council' },
  tp190: { block: 'Blk 190 Lor 6 Toa Payoh', lat: 1.3341, lng: 103.8563, council: 'Bishan-Toa Payoh Town Council' },
  bishan165: { block: 'Blk 165 Bishan St 13', lat: 1.3510, lng: 103.8480, council: 'Bishan-Toa Payoh Town Council' },
  ys846: { block: 'Blk 846 Yishun Ring Rd', lat: 1.4315, lng: 103.8372, council: 'Nee Soon Town Council' },
  ys290: { block: 'Blk 290 Yishun St 22', lat: 1.4288, lng: 103.8341, council: 'Nee Soon Town Council' },
  sunshine: { block: 'Sunshine Place Mall', lat: 1.4301, lng: 103.8358, council: 'Nee Soon Town Council', premises: true },
  sb355: { block: 'Blk 355 Sembawang Way', lat: 1.4478, lng: 103.8188, council: 'Sembawang Town Council' },
  cb411: { block: 'Blk 411 Canberra Rd', lat: 1.4462, lng: 103.8221, council: 'Sembawang Town Council' },
};
const at = key => PLACES[key];

// 18 plants: 4 critical, 5 at_risk, 9 healthy. The dashboard's criticalFlora and
// atRiskFlora KPIs are asserted against those counts.
const FLORA = [
  { species: 'Bougainvillea', place: 'amk123', health_status: 'critical', days: 3 },
  { species: 'Frangipani', place: 'amk456', health_status: 'at_risk', days: 5 },
  { species: 'Hibiscus', place: 'amk789', health_status: 'healthy', days: 6 },
  { species: 'Ixora', place: 'amk234', health_status: 'at_risk', days: 4 },
  { species: 'Lantana', place: 'tp79', health_status: 'healthy', days: 8 },
  { species: 'Heliconia', place: 'amk123', health_status: 'critical', days: 2 },
  { species: 'Bird of Paradise', place: 'bishan165', health_status: 'healthy', days: 9 },
  { species: 'Yellow Saraca', place: 'tp190', health_status: 'healthy', days: 11 },
  { species: 'Rain Tree', place: 'ys846', health_status: 'at_risk', days: 7 },
  { species: 'Tembusu', place: 'ys290', health_status: 'healthy', days: 14 },
  { species: 'Angsana', place: 'sb355', health_status: 'critical', days: 1 },
  { species: 'Sea Almond', place: 'cb411', health_status: 'healthy', days: 12 },
  { species: 'Golden Penda', place: 'amk456', health_status: 'healthy', days: 10 },
  { species: 'Trumpet Tree', place: 'bishan165', health_status: 'at_risk', days: 6 },
  { species: 'Fishtail Palm', place: 'amk789', health_status: 'healthy', days: 15 },
  { species: 'Red Powderpuff', place: 'tp79', health_status: 'critical', days: 2 },
  { species: 'Spider Lily', place: 'sb355', health_status: 'healthy', days: 13 },
  { species: 'Simpoh Air', place: 'cb411', health_status: 'at_risk', days: 5 },
];

// 24 sightings. Block 123 carries the most, so it is the top hotspot, and several
// blocks clear a minCount of 3. The `feeding` tag is what the feeding/rodent
// correlation reads - the feeding-tagged blocks are deliberately blocks that ALSO
// carry rodent assessments below, so co-occurrence has something to find.
const FAUNA = [
  { species: 'cat', place: 'amk123', floor_level: 'L5', behaviour_tags: ['defecating'], hours: 2 },
  { species: 'cat', place: 'amk123', floor_level: 'L3', behaviour_tags: ['roaming'], hours: 20 },
  { species: 'cat', place: 'amk123', floor_level: 'L1', behaviour_tags: ['urinating'], hours: 24 },
  { species: 'cat', place: 'amk123', floor_level: 'Ground', behaviour_tags: ['feeding'], hours: 30 },
  { species: 'pigeon', place: 'amk456', floor_level: 'L12', behaviour_tags: ['roosting'], hours: 5 },
  { species: 'pigeon', place: 'amk456', floor_level: 'L12', behaviour_tags: ['feeding'], hours: 24 },
  { species: 'pigeon', place: 'amk456', floor_level: 'L8', behaviour_tags: ['roosting'], hours: 48 },
  { species: 'cat', place: 'amk789', floor_level: 'Ground', behaviour_tags: ['feeding'], hours: 24 },
  { species: 'crow', place: 'amkHub', floor_level: 'B1', behaviour_tags: ['feeding'], hours: 8 },
  { species: 'crow', place: 'amkHub', floor_level: 'B1', behaviour_tags: ['roosting'], hours: 32 },
  { species: 'myna', place: 'chongBoon', floor_level: 'Ground', behaviour_tags: ['feeding'], hours: 12 },
  { species: 'myna', place: 'chongBoon', floor_level: 'Ground', behaviour_tags: ['roaming'], hours: 36 },
  { species: 'crow', place: 'chongBoon', floor_level: 'Ground', behaviour_tags: ['feeding'], hours: 60 },
  { species: 'pigeon', place: 'tp79', floor_level: 'L2', behaviour_tags: ['roosting'], hours: 18 },
  { species: 'cat', place: 'tp190', floor_level: 'Ground', behaviour_tags: ['feeding'], hours: 26 },
  { species: 'cat', place: 'tp190', floor_level: 'L4', behaviour_tags: ['roaming'], hours: 50 },
  { species: 'pigeon', place: 'bishan165', floor_level: 'L9', behaviour_tags: ['roosting'], hours: 14 },
  { species: 'cat', place: 'ys846', floor_level: 'Ground', behaviour_tags: ['feeding'], hours: 6 },
  { species: 'cat', place: 'ys846', floor_level: 'L2', behaviour_tags: ['defecating'], hours: 40 },
  { species: 'pigeon', place: 'sunshine', floor_level: 'L1', behaviour_tags: ['feeding'], hours: 10 },
  { species: 'myna', place: 'sunshine', floor_level: 'L1', behaviour_tags: ['roaming'], hours: 34 },
  { species: 'cat', place: 'ys290', floor_level: 'L6', behaviour_tags: ['roaming'], hours: 44 },
  { species: 'pigeon', place: 'sb355', floor_level: 'L3', behaviour_tags: ['roosting'], hours: 22 },
  { species: 'cat', place: 'cb411', floor_level: 'Ground', behaviour_tags: ['feeding'], hours: 16 },
];

// 20 cases: 9 open, 6 in_progress, 5 resolved - the counts the case-status
// breakdown and the openCases KPI are asserted against.
// Coordinates matter: a resident submits a GPS pin, and townCouncils.councilFor()
// resolves a case to a council from that pin. Without coordinates a case cannot be
// attributed to any council, so these are spread across four modelled councils
// rather than all sitting in one.
const CASES = [
  { category: 'community_cat', place: 'amk123', title: 'Cat keeps coming up to L5', status: 'open', hours: 0.3 },
  { category: 'pigeon', place: 'amk456', title: 'Pigeon feeding at void deck', status: 'in_progress', hours: 2 },
  { category: 'flora_health', place: 'amk123', title: 'Bougainvillea looking sick', status: 'open', hours: 20 },
  { category: 'pest', place: 'amk234', title: 'Rodent sighting near garden', status: 'resolved', hours: 96 },
  { category: 'community_cat', place: 'amk123', title: 'Cat litter at staircase', status: 'open', hours: 24 },
  { category: 'flora_health', place: 'tp79', title: 'Dry patch on grass verge', status: 'in_progress', hours: 48 },
  { category: 'pigeon', place: 'amk456', title: 'Bird droppings on corridor', status: 'open', hours: 6 },
  { category: 'pest', place: 'ys846', title: 'Rats around the bin centre at night', status: 'in_progress', hours: 12 },
  { category: 'pest', place: 'amkHub', title: 'Droppings near the basement food stalls', status: 'open', hours: 9 },
  { category: 'pest', place: 'chongBoon', title: 'Rodent running across the market floor', status: 'in_progress', hours: 30 },
  { category: 'community_cat', place: 'tp190', title: 'Someone leaving food out at the void deck', status: 'open', hours: 18 },
  { category: 'flora_health', place: 'bishan165', title: 'Branch looks ready to fall', status: 'resolved', hours: 120 },
  { category: 'pest', place: 'sunshine', title: 'Rodent by the loading bay bins', status: 'open', hours: 4 },
  { category: 'pigeon', place: 'sunshine', title: 'Pigeons roosting over the entrance', status: 'in_progress', hours: 52 },
  { category: 'flora_health', place: 'sb355', title: 'Angsana shedding heavily', status: 'open', hours: 26 },
  { category: 'pest', place: 'cb411', title: 'Gnaw marks on the bin chute door', status: 'resolved', hours: 144 },
  { category: 'community_cat', place: 'ys290', title: 'Cat trapped behind the riser', status: 'resolved', hours: 72 },
  { category: 'flora_health', place: 'amk789', title: 'Palm fronds blocking the walkway', status: 'in_progress', hours: 36 },
  { category: 'pigeon', place: 'tp79', title: 'Nesting in the ceiling void', status: 'open', hours: 15 },
  { category: 'pest', place: 'ys846', title: 'Burrow holes by the drain', status: 'resolved', hours: 168 },
];

/**
 * 26 rodent assessments across 12 locations - the rodent risk map, the assessment
 * list, the block diagnosis panel and the prevention scorecard all read these.
 *
 * SHAPED FOR THE THINGS THE PAGES HAVE TO DISTINGUISH, not for volume:
 *  - every risk_level appears, because the map's severity scale, the score weights
 *    and the escalation threshold all key off it;
 *  - the busiest locations carry SEVERAL assessments, so grouping by location has
 *    something to collapse and the "+N earlier reports" line has something to say;
 *  - three sit at premises (a mall, a food centre, a basement food court) rather
 *    than blocks, which is the case that decides whether the town council or NEA
 *    is the right agency;
 *  - two blocks are deliberately clean of feeding sightings and two are deliberately
 *    covered in them, so the feeding/rodent correlation can show a difference;
 *  - dates fan out across ~10 weeks so the 7d / 30d / 90d windows and the timeline
 *    scrubber each return a different answer. A dataset inside one week makes every
 *    window identical and the filter untestable.
 */
/**
 * Prose for `likely_cause`, keyed by the root-cause enum the fixture already carries.
 *
 * One sentence each, which is what the AI is asked to produce - not a label. A fixture that
 * stores a token where production stores a sentence makes the UI look broken and hides
 * genuine layout problems (a one-word value never wraps, so nothing reveals that the field
 * has no room for a real answer).
 */
const CAUSE_TEXT = {
  bin_overflow: 'Refuse bins here are overflowing between collections, leaving an accessible food source at ground level.',
  food_waste: 'Food waste is being left accessible near the reported area, sustaining an established population.',
  structural_gap: 'A gap in the structure is giving rodents a protected route into the building.',
  external_food_source: 'An external food source nearby - most likely deliberate feeding - is drawing rodents to this location.',
  vegetation: 'Dense vegetation against the building provides cover and harbourage right up to the wall line.',
  drain_ingress: 'Rodents appear to be entering from the drainage system rather than at ground level.',
  unknown: 'No single cause could be established from the evidence available at this visit.',
};

const RODENT = [
  { place: 'amk123', floor: 'Ground', risk: 'critical', days: 1, cause: 'bin_overflow', signs: ['Rodent droppings', 'Burrow or nest', 'Gnaw marks'], obs: 'Active burrows behind the bin centre, fresh droppings along the wall base.', escalate: true },
  { place: 'amk123', floor: 'L1', risk: 'high', days: 4, cause: 'food_waste', signs: ['Rodent droppings', 'Grease marks'], obs: 'Droppings by the refuse chute door, smear marks up the frame.' },
  { place: 'amk123', floor: 'Ground', risk: 'medium', days: 12, cause: 'vegetation', signs: ['Runways'], obs: 'Runways worn through the shrub bed towards the bin centre.' },
  { place: 'amk123', floor: 'Ground', risk: 'high', days: 26, cause: 'bin_overflow', signs: ['Rodent droppings'], obs: 'Bins overflowing again on collection day, droppings around the base.' },
  { place: 'amkHub', floor: 'B1', risk: 'critical', days: 2, cause: 'food_waste', signs: ['Rodent droppings', 'Gnaw marks', 'Live sighting'], obs: 'Live sighting behind the stall line during service, gnawed packaging in the store.', escalate: true },
  { place: 'amkHub', floor: 'B1', risk: 'high', days: 16, cause: 'structural_gap', signs: ['Gnaw marks'], obs: 'Gap under the service door has been gnawed wider.' },
  { place: 'chongBoon', floor: 'Ground', risk: 'high', days: 3, cause: 'food_waste', signs: ['Rodent droppings', 'Live sighting'], obs: 'Rodent seen crossing the wet market floor after closing.' },
  { place: 'chongBoon', floor: 'Ground', risk: 'medium', days: 21, cause: 'drain_ingress', signs: ['Runways'], obs: 'Runway from the open drain into the stall backspace.' },
  { place: 'ys846', floor: 'Ground', risk: 'high', days: 5, cause: 'bin_overflow', signs: ['Burrow or nest', 'Rodent droppings'], obs: 'Burrow opening by the bin centre, droppings across the surround.' },
  { place: 'ys846', floor: 'Ground', risk: 'critical', days: 9, cause: 'external_food_source', signs: ['Burrow or nest', 'Live sighting'], obs: 'Multiple burrows under the shrub line, two live sightings in one visit.', escalate: true },
  { place: 'ys846', floor: 'L2', risk: 'medium', days: 33, cause: 'food_waste', signs: ['Rodent droppings'], obs: 'Scattered droppings on the L2 corridor near the chute.' },
  { place: 'sunshine', floor: 'B1', risk: 'high', days: 6, cause: 'food_waste', signs: ['Rodent droppings', 'Gnaw marks'], obs: 'Gnawed sacks at the loading bay, droppings behind the compactor.' },
  { place: 'sunshine', floor: 'B1', risk: 'medium', days: 38, cause: 'structural_gap', signs: ['Runways'], obs: 'Runway along the pipe run into the service corridor.' },
  { place: 'tp190', floor: 'Ground', risk: 'high', days: 7, cause: 'external_food_source', signs: ['Rodent droppings', 'Runways'], obs: 'Food left out at the void deck overnight, droppings the next morning.' },
  { place: 'tp190', floor: 'Ground', risk: 'medium', days: 29, cause: 'external_food_source', signs: ['Rodent droppings'], obs: 'Same void deck, smaller quantity of droppings.' },
  { place: 'tp79', floor: 'Ground', risk: 'medium', days: 11, cause: 'vegetation', signs: ['Runways'], obs: 'Overgrown bed against the wall giving cover along the whole length.' },
  { place: 'tp79', floor: 'L1', risk: 'low', days: 45, cause: 'unknown', signs: [], obs: 'Resident report of a sighting, no signs found on inspection.' },
  { place: 'bishan165', floor: 'Ground', risk: 'medium', days: 14, cause: 'drain_ingress', signs: ['Runways', 'Rodent droppings'], obs: 'Droppings along the drain edge behind the block.' },
  { place: 'bishan165', floor: 'Ground', risk: 'low', days: 52, cause: 'unknown', signs: [], obs: 'Follow-up after baiting, no new signs.' },
  { place: 'ys290', floor: 'Ground', risk: 'medium', days: 19, cause: 'bin_overflow', signs: ['Rodent droppings'], obs: 'Droppings at the bin centre entrance, bins not overflowing at time of visit.' },
  { place: 'sb355', floor: 'Ground', risk: 'high', days: 8, cause: 'structural_gap', signs: ['Gnaw marks', 'Rodent droppings'], obs: 'Chute door seal chewed through, droppings inside the hopper room.' },
  { place: 'sb355', floor: 'Ground', risk: 'low', days: 60, cause: 'unknown', signs: [], obs: 'Routine check, nothing found.' },
  { place: 'cb411', floor: 'Ground', risk: 'medium', days: 23, cause: 'vegetation', signs: ['Burrow or nest'], obs: 'Two burrow openings in the turf beside the walkway.' },
  { place: 'cb411', floor: 'Ground', risk: 'low', days: 68, cause: 'unknown', signs: [], obs: 'Burrows backfilled on the previous visit, still closed.' },
  { place: 'amk456', floor: 'Ground', risk: 'low', days: 41, cause: 'unknown', signs: [], obs: 'Inspection prompted by a pigeon complaint, no rodent signs.' },
  { place: 'amk234', floor: 'Ground', risk: 'medium', days: 55, cause: 'food_waste', signs: ['Rodent droppings'], obs: 'Droppings by the community garden compost bay.' },

  /* ---- THE ACTION QUEUE'S PENDING TAB ----------------------------------------------
   * Everything below is escalated and deliberately sits at a location with NO work
   * order, because that is the exact condition the queue filters on
   * (escalate_to_contractor = true AND work_order_id IS NULL AND escalation_status IS
   * NULL - see PENDING_WHERE in routes/workOrders.js). An escalation at a location that
   * already has an order is NOT pending, and the link-up at the end of writeTestData is
   * what enforces that.
   *
   * SIZED FOR THE CONSOLIDATION STORY, which is what this queue exists to tell. The
   * whole value claim is "N separate reports at one block become ONE contractor visit",
   * and call_outs_avoided is count - 1 - so a queue of single-report clusters would show
   * a saving of zero on every row and demonstrate nothing. Hence a 4, a 3, two 2s and two
   * 1s: the singles are the honest case where consolidation saves nothing, and they need
   * to be visible too or the queue looks like it always pays off.
   */
  { place: 'ys290', floor: 'Ground', risk: 'critical', days: 2, cause: 'bin_overflow', signs: ['Burrow or nest', 'Rodent droppings', 'Live sighting'], obs: 'Burrows under the bin centre slab, rodent seen entering during inspection.', escalate: true },
  { place: 'ys290', floor: 'Ground', risk: 'high', days: 4, cause: 'bin_overflow', signs: ['Rodent droppings', 'Gnaw marks'], obs: 'Bin centre door seal chewed, droppings inside the hopper.', escalate: true },
  { place: 'ys290', floor: 'L1', risk: 'high', days: 6, cause: 'food_waste', signs: ['Rodent droppings'], obs: 'Droppings along the L1 corridor by the chute.', escalate: true },
  { place: 'ys290', floor: 'Ground', risk: 'medium', days: 19, cause: 'bin_overflow', signs: ['Rodent droppings'], obs: 'Follow-up: droppings still present at the bin centre entrance.', escalate: true },

  { place: 'tp79', floor: 'Ground', risk: 'critical', days: 3, cause: 'external_food_source', signs: ['Burrow or nest', 'Live sighting'], obs: 'Three burrow openings behind the coffee shop, two live sightings.', escalate: true },
  { place: 'tp79', floor: 'Ground', risk: 'high', days: 5, cause: 'food_waste', signs: ['Rodent droppings', 'Runways'], obs: 'Runways from the bin bay into the shrub line, heavy droppings.', escalate: true },
  { place: 'tp79', floor: 'L2', risk: 'high', days: 9, cause: 'structural_gap', signs: ['Gnaw marks'], obs: 'Gnawed service riser cover on L2.', escalate: true },

  { place: 'chongBoon', floor: 'Ground', risk: 'critical', days: 1, cause: 'food_waste', signs: ['Rodent droppings', 'Live sighting', 'Gnaw marks'], obs: 'Live sighting at the stall backspace during trading hours.', escalate: true },
  { place: 'chongBoon', floor: 'Ground', risk: 'high', days: 7, cause: 'bin_overflow', signs: ['Rodent droppings'], obs: 'Refuse bay overflowing, droppings across the loading area.', escalate: true },

  { place: 'cb411', floor: 'Ground', risk: 'high', days: 5, cause: 'drain_ingress', signs: ['Runways', 'Rodent droppings'], obs: 'Runway out of the open drain into the bin bay.', escalate: true },
  { place: 'cb411', floor: 'Ground', risk: 'medium', days: 23, cause: 'vegetation', signs: ['Burrow or nest'], obs: 'Burrow openings in the turf beside the walkway have reopened.', escalate: true },

  { place: 'bishan165', floor: 'Ground', risk: 'high', days: 8, cause: 'structural_gap', signs: ['Gnaw marks', 'Rodent droppings'], obs: 'Chute hopper door does not seal, droppings inside.', escalate: true },

  /* ---- A DISMISSED ESCALATION ------------------------------------------------------
   * Reviewed and NOT actioned, which is the queue's second exit path alongside raising
   * an order. It exists so the exclusion is falsifiable: without a dismissed row, a
   * queue that had forgotten to filter them out would look exactly like one that filters
   * correctly. It is also the only data the dismiss/undo flow has to work against.
   */
  { place: 'amk789', floor: 'Ground', risk: 'medium', days: 12, cause: 'unknown', signs: [], obs: 'Resident reported a sighting at the bin centre; no signs found on two visits.', escalate: true, dismissed: 'Inspected twice, no evidence of activity. Advised resident to re-report if seen again.' },
];

/**
 * 6 work orders, one at each pipeline stage. The action queue, the work order
 * detail view and the scorecard's "closed the loop" figures all read these, and a
 * pipeline where every order sits at `raised` cannot demonstrate any of it.
 *
 * `stages` lists the stages the order has ALREADY passed through, with the day it
 * moved. writeTestData turns that into both the WorkOrderEvent rows (the append-only
 * log, which is the source of truth) and the denormalised <stage>_at/_by columns
 * (the read cache) - so the two agree by construction rather than by hand, which is
 * exactly the drift services/workOrderStages.js exists to prevent.
 */
const WORK_ORDERS = [
  {
    place: 'amk123', risk: 'critical', agency: 'Town Council pest contractor',
    stages: [['raised', 1], ['dispatched', 1], ['scheduled', 0.5], ['in_progress', 0.2]],
    note: 'Two critical assessments at the same bin centre inside a week.',
  },
  {
    place: 'ys846', risk: 'critical', agency: 'Town Council pest contractor',
    stages: [['raised', 9], ['dispatched', 9], ['scheduled', 8], ['in_progress', 6], ['resolved', 5], ['closed', 4]],
    note: 'Burrows treated and backfilled, follow-up inspection clear.',
  },
  {
    place: 'amkHub', risk: 'critical', agency: 'NEA - licensed premises',
    stages: [['raised', 2], ['dispatched', 2]],
    note: 'Food court is a licensed premises - referred rather than dispatched to the council contractor.',
  },
  {
    place: 'sunshine', risk: 'high', agency: 'NEA - licensed premises',
    stages: [['raised', 6], ['dispatched', 5], ['scheduled', 4]],
    note: 'Mall management notified, contractor attendance booked.',
  },
  {
    place: 'sb355', risk: 'high', agency: 'Town Council pest contractor',
    stages: [['raised', 8], ['dispatched', 7], ['scheduled', 6], ['in_progress', 3], ['resolved', 2]],
    note: 'Chute door seal replaced, awaiting closure sign-off.',
  },
  {
    place: 'tp190', risk: 'high', agency: 'Town Council enforcement',
    stages: [['raised', 7]],
    note: 'Repeat feeding at the void deck - enforcement rather than baiting.',
  },
  // Two more so no board column is a singleton. Both sit at locations whose assessments
  // are NOT part of the pending set above - an order here would pull those escalations
  // out of the queue, which is the whole point of keeping the two sets disjoint.
  {
    place: 'amk456', risk: 'medium', agency: 'Town Council pest contractor',
    stages: [['raised', 12], ['dispatched', 11]],
    note: 'Low-grade but persistent - bundled with the quarterly baiting round.',
  },
  {
    place: 'amk234', risk: 'high', agency: 'Town Council pest contractor',
    stages: [['raised', 15], ['dispatched', 14], ['scheduled', 12], ['in_progress', 10]],
    note: 'Community garden compost bay - contractor treating and advising the gardeners.',
  },
];

// 4 alert rules, one per trigger_type, so the Alert Rules page can be checked
// against every branch of the rule engine. One is deliberately inactive: a page
// that only ever renders active rules hides the is_active toggle's effect.
const ALERT_RULES = [
  { name: 'Critical flora - notify horticulture', trigger_type: 'flora_critical', threshold: 1, recipients: 'test.officer@emservices.com.sg', channel: 'email', is_active: true },
  { name: 'Fauna hotspot - 3+ sightings at a block', trigger_type: 'fauna_hotspot', threshold: 3, recipients: 'test.officer@emservices.com.sg,test.admin@emservices.com.sg', channel: 'email', is_active: true },
  { name: 'Urgent pest case - notify duty officer', trigger_type: 'new_case_urgent', threshold: null, recipients: 'test.officer@emservices.com.sg', channel: 'both', is_active: true },
  { name: 'Weekly estate summary', trigger_type: 'weekly_summary', threshold: null, recipients: 'test.admin@emservices.com.sg', channel: 'email', is_active: false },
];

/**
 * 12 notification log entries. The log's whole purpose is to make delivery
 * FALSIFIABLE - an officer has to be able to see that something did not arrive -
 * so the mix is what matters here, not the count:
 *  - sent, failed, and a retry OF a failure (retry_of), which is the pair the
 *    retry column renders;
 *  - one failure acknowledged and one still outstanding, because the badge counts
 *    unacknowledged failures only;
 *  - both channels, and every severity, so the filters have something to filter.
 * `ruleIdx` indexes ALERT_RULES; writeTestData resolves it to the real id after
 * the rules are inserted, rather than assuming the ids come back 1-4.
 */
const NOTIFICATIONS = [
  { ruleIdx: 0, channel: 'email', recipient: 'test.officer@emservices.com.sg', status: 'sent', severity: 'warning', subject: 'Critical flora at Block 123', preview: 'Bougainvillea at Block 123 moved to critical.', source_type: 'flora', source_id: '1', hours: 3 },
  { ruleIdx: 1, channel: 'email', recipient: 'test.officer@emservices.com.sg', status: 'sent', severity: 'info', subject: 'Fauna hotspot: Block 123', preview: '4 sightings at Block 123 in the last 7 days.', source_type: 'fauna', source_id: 'Block 123', hours: 8 },
  { ruleIdx: 2, channel: 'email', recipient: 'test.officer@emservices.com.sg', status: 'sent', severity: 'critical', subject: 'Urgent pest case at AMK Hub Basement Foodcourt', preview: 'Live sighting reported during service hours.', source_type: 'case', source_id: '9', hours: 9 },
  { ruleIdx: 2, channel: 'sms', recipient: '+6580000001', status: 'sent', severity: 'critical', subject: 'Urgent pest case at AMK Hub Basement Foodcourt', preview: 'Live sighting reported during service hours.', source_type: 'case', source_id: '9', hours: 9 },
  // The failure the retry below refers to. Kept in the log rather than replaced:
  // an overwritten failure is an unfalsifiable claim of delivery.
  { key: 'bounce', ruleIdx: 0, channel: 'email', recipient: 'horticulture@emservices.com.sg', status: 'failed', severity: 'warning', subject: 'Critical flora at Blk 79 Toa Payoh Lor 4', preview: 'Red Powderpuff moved to critical.', error: 'SMTP 550 - mailbox unavailable', source_type: 'flora', source_id: '16', hours: 30 },
  { retryOf: 'bounce', ruleIdx: 0, channel: 'email', recipient: 'test.officer@emservices.com.sg', status: 'sent', severity: 'warning', subject: 'Critical flora at Blk 79 Toa Payoh Lor 4', preview: 'Red Powderpuff moved to critical. Resent to the duty officer.', source_type: 'flora', source_id: '16', hours: 29 },
  { ruleIdx: 1, channel: 'email', recipient: 'test.officer@emservices.com.sg', status: 'failed', severity: 'warning', subject: 'Fauna hotspot: Chong Boon Market & Food Centre', preview: '3 feeding sightings in 7 days.', error: 'Connection timed out after 30000ms', source_type: 'fauna', source_id: 'Chong Boon Market & Food Centre', hours: 26, acknowledged: true },
  { ruleIdx: 2, channel: 'email', recipient: 'test.officer@emservices.com.sg', status: 'failed', severity: 'critical', subject: 'Urgent pest case at Sunshine Place Mall', preview: 'Rodent reported at the loading bay.', error: 'SMTP AUTH disabled for tenant', source_type: 'case', source_id: '13', hours: 4 },
  { ruleIdx: 3, channel: 'email', recipient: 'test.admin@emservices.com.sg', status: 'sent', severity: 'info', subject: 'Weekly estate summary', preview: '20 cases, 9 open. 4 critical plants.', source_type: 'summary', source_id: 'week-31', hours: 60 },
  { ruleIdx: null, channel: 'email', recipient: 'test.resident@example.com', status: 'sent', severity: 'info', subject: 'Pest control update - Blk 846 Yishun Ring Rd: Work completed', preview: 'The pest control work at your reported location is complete.', source_type: 'work_order', source_id: '2', hours: 120 },
  { ruleIdx: null, channel: 'email', recipient: 'test.resident@example.com', status: 'sent', severity: 'info', subject: 'Your report has been resolved', preview: 'Case 20 at Blk 846 Yishun Ring Rd is now resolved.', source_type: 'case', source_id: '20', hours: 166 },
  { ruleIdx: 1, channel: 'sms', recipient: '+6580000002', status: 'sent', severity: 'info', subject: 'Fauna hotspot: Blk 190 Lor 6 Toa Payoh', preview: '2 feeding sightings at the void deck.', source_type: 'fauna', source_id: 'Blk 190 Lor 6 Toa Payoh', hours: 50 },
];

/**
 * Simulated sensor readings for the sensor surface layer.
 *
 * is_simulated is TRUE on every row and the route pins it in the WHERE clause -
 * these are a modelled "what if the estate had activity sensors" layer, not
 * measurements, and the surface labels itself as such. Writing them through the
 * same table with the flag set is what keeps them out of every other query.
 *
 * 8 sensors x 4 readings each: one per location_type at a spread of activity, so
 * the surface has a gradient to render rather than a uniform field, and 4 readings
 * apiece so its recency window has both current and stale values to choose between.
 */
const SENSOR_SITES = [
  { id: 'SNS-AMK-123-CHUTE', place: 'amk123', location_type: 'refuse_chute', base: 0.82 },
  { id: 'SNS-AMK-123-BIN', place: 'amk123', location_type: 'bin_centre', base: 0.91 },
  { id: 'SNS-AMK-HUB-FNB', place: 'amkHub', location_type: 'fnb_unit', base: 0.88 },
  { id: 'SNS-CBM-FNB', place: 'chongBoon', location_type: 'fnb_unit', base: 0.64 },
  { id: 'SNS-YS-846-BIN', place: 'ys846', location_type: 'bin_centre', base: 0.77 },
  { id: 'SNS-TP-190-VOID', place: 'tp190', location_type: 'void_deck', base: 0.53 },
  { id: 'SNS-BSN-165-CHUTE', place: 'bishan165', location_type: 'refuse_chute', base: 0.31 },
  { id: 'SNS-SB-355-CHUTE', place: 'sb355', location_type: 'refuse_chute', base: 0.46 },
];

// Fixed offsets rather than a random walk. A dataset whose values change between
// runs cannot have an expected value, so nothing about it can be asserted.
const SENSOR_OFFSETS = [
  { hours: 2, delta: 0 },
  { hours: 26, delta: -0.08 },
  { hours: 50, delta: -0.14 },
  { hours: 74, delta: -0.05 },
];

/**
 * 14 days of daily metric snapshots - the dashboard's trend deltas and sparklines
 * read these, and with no history every trend renders as "no comparison".
 *
 * The series is written by hand and trends DOWNWARD towards today on open cases and
 * critical flora, because the point of the prevention story is that intervention
 * moves the numbers. Today's snapshot is deliberately NOT written: the dashboard
 * computes today live from the tables, and a stored row for today would let a stale
 * snapshot silently override the real count.
 */
const SNAPSHOT_SERIES = [
  { d: 14, open: 16, crit: 7, risk: 6, hot: 5, sight: 31, score: 62 },
  { d: 13, open: 16, crit: 7, risk: 6, hot: 5, sight: 30, score: 61 },
  { d: 12, open: 15, crit: 6, risk: 6, hot: 5, sight: 29, score: 58 },
  { d: 11, open: 15, crit: 6, risk: 5, hot: 4, sight: 28, score: 56 },
  { d: 10, open: 14, crit: 6, risk: 5, hot: 4, sight: 28, score: 55 },
  { d: 9, open: 14, crit: 5, risk: 5, hot: 4, sight: 27, score: 52 },
  { d: 8, open: 13, crit: 5, risk: 5, hot: 4, sight: 26, score: 50 },
  { d: 7, open: 13, crit: 5, risk: 5, hot: 3, sight: 26, score: 49 },
  { d: 6, open: 12, crit: 4, risk: 5, hot: 3, sight: 25, score: 47 },
  { d: 5, open: 12, crit: 4, risk: 5, hot: 3, sight: 25, score: 46 },
  { d: 4, open: 11, crit: 4, risk: 5, hot: 3, sight: 24, score: 44 },
  { d: 3, open: 10, crit: 4, risk: 5, hot: 3, sight: 24, score: 43 },
  { d: 2, open: 10, crit: 4, risk: 5, hot: 3, sight: 24, score: 42 },
  { d: 1, open: 9, crit: 4, risk: 5, hot: 3, sight: 24, score: 41 },
];

// Writes the dataset and returns what it wrote. Exported so test cases can insert
// the same documented rows and assert against them - the dataset is defined once,
// here, rather than duplicated between this script and the tests.
async function writeTestData() {
  await sequelize.sync();

  const password_hash = await bcrypt.hash(PASSWORD, 10);
  const users = {};
  for (const a of ACCOUNTS) {
    const [user] = await User.findOrCreate({
      where: { email: a.email },
      defaults: { name: a.name, role: a.role, password_hash },
    });
    // Keep role and password authoritative if the row already existed.
    await user.update({ name: a.name, role: a.role, password_hash });
    users[a.role] = user;
  }
  const officer = users.staff;

  // Clear only previous test-data rows, identified by TAG. Work order EVENTS go
  // first: they reference a work order, so deleting the orders first would either
  // orphan them or fail the constraint depending on the dialect.
  const priorOrders = await WorkOrder.findAll({ where: { notes: LIKE_TAG }, attributes: ['id'] });
  if (priorOrders.length) {
    await WorkOrderEvent.destroy({ where: { work_order_id: priorOrders.map(o => o.id) } });
  }
  await WorkOrder.destroy({ where: { notes: LIKE_TAG } });
  await GreeneryRecord.destroy({ where: { health_notes: LIKE_TAG } });
  await FaunaSighting.destroy({ where: { notes: LIKE_TAG } });
  await ResidentReport.destroy({ where: { description: LIKE_TAG } });
  await RodentAssessment.destroy({ where: { follow_up_notes: LIKE_TAG } });
  await NotificationLog.destroy({ where: { body: LIKE_TAG } });
  await AlertRule.destroy({ where: { name: { [Op.in]: ALERT_RULES.map(r => r.name) } } });
  await SensorReading.destroy({ where: { sensor_id: { [Op.in]: SENSOR_SITES.map(s => s.id) } } });
  await MetricSnapshot.destroy({ where: { snapshot_date: { [Op.in]: SNAPSHOT_SERIES.map(s => dateKey(daysAgo(s.d))) } } });

  await GreeneryRecord.bulkCreate(FLORA.map(f => ({
    species: f.species,
    location_zone: at(f.place).block,
    location: at(f.place).block,
    health_status: f.health_status,
    health_notes: tagged(`Inspected ${f.days}d ago.`),
    last_inspected_at: daysAgo(f.days),
    recorded_by: officer.id,
  })));

  await FaunaSighting.bulkCreate(FAUNA.map(s => ({
    species: s.species,
    block_number: at(s.place).block,
    floor_level: s.floor_level,
    behaviour_tags: s.behaviour_tags,
    gps_lat: at(s.place).lat,
    gps_lng: at(s.place).lng,
    notes: tagged(`${s.species} - ${s.behaviour_tags.join(', ') || 'observed'}.`),
    reported_by: officer.id,
    createdAt: hoursAgo(s.hours),
    updatedAt: hoursAgo(s.hours),
  })), { silent: true }); // keep our createdAt instead of stamping "now"

  const reports = await ResidentReport.bulkCreate(CASES.map(c => ({
    category: c.category,
    title: c.title,
    description: tagged(c.title + '.'),
    block_number: at(c.place).block,
    gps_lat: at(c.place).lat,
    gps_lng: at(c.place).lng,
    status: c.status,
    reported_by: users.resident.id,
    createdAt: hoursAgo(c.hours),
    updatedAt: hoursAgo(c.hours),
  })), { silent: true, returning: true }); // keep our createdAt instead of stamping "now"

  const assessments = await RodentAssessment.bulkCreate(RODENT.map(r => ({
    block_number: at(r.place).block,
    floor_level: r.floor,
    gps_lat: at(r.place).lat,
    gps_lng: at(r.place).lng,
    observations: r.obs,
    risk_level: r.risk,
    /* TWO DIFFERENT FIELDS, TWO DIFFERENT SHAPES - and writing the enum into both is what
     * put `bin_overflow` on screen.
     *
     *   likely_cause  is the AI's FREE-TEXT sentence (see the response contract in
     *                 services/rodentService.js). The fixture used to store the bare enum
     *                 key here, so the lifecycle panel rendered "bin_overflow" under
     *                 "Likely cause" - not a UI bug, a fixture that did not look like a
     *                 real record.
     *   root_cause    is the officer-set ENUM, and the key belongs here. It was null on
     *                 every fixture row, so the root-cause taxonomy had no data at all.
     *
     * CAUSE_TEXT below is keyed by the same token, so the two can never describe different
     * causes for one row. */
    likely_cause: CAUSE_TEXT[r.cause] || r.cause,
    root_cause: r.cause,
    signs_identified: r.signs,
    escalate_to_contractor: !!r.escalate,
    escalation_reason: r.escalate ? 'Critical band with active harbourage - beyond in-house treatment.' : null,
    // A dismissal carries WHO decided and WHEN, not just the status. The model calls
    // these fields the decision audit, and a dismissed row with no decider is a record
    // that something was reviewed by nobody.
    escalation_status: r.dismissed ? 'dismissed' : null,
    escalation_note: r.dismissed || null,
    escalation_decided_by: r.dismissed ? officer.id : null,
    escalation_decided_at: r.dismissed ? daysAgo(Math.max(0, r.days - 1)) : null,
    follow_up_notes: TAG,
    assessed_by: officer.id,
    createdAt: daysAgo(r.days),
    updatedAt: daysAgo(r.days),
  })), { silent: true, returning: true });

  // Work orders, plus the append-only stage log behind each one. Written from the
  // SAME `stages` list so the log and the denormalised columns cannot disagree.
  const orders = [];
  for (const w of WORK_ORDERS) {
    const place = at(w.place);
    const linked = assessments.filter(a => a.block_number === place.block);
    const lastStage = w.stages[w.stages.length - 1][0];
    const raisedAt = daysAgo(w.stages[0][1]);
    const lastAt = daysAgo(w.stages[w.stages.length - 1][1]);
    const row = {
      // BOTH timestamps, explicitly. `silent: true` is what stops Sequelize
      // stamping createdAt as "now" - but it stops it stamping updatedAt too, and
      // that column is NOT NULL, so a silent create must supply both itself.
      createdAt: raisedAt,
      updatedAt: lastAt,
      block_number: place.block,
      animal_type: 'rodent',
      target_agency: w.agency,
      assessment_ids: linked.map(a => a.id),
      consolidated_count: linked.length || 1,
      risk_level: w.risk,
      status: lastStage,
      town_council: place.council,
      // Only the resident cases actually AT this location, and only where the
      // resident can be reached - the same rule WorkOrder.js states for the
      // resident email. An unrelated case id here would address the wrong person.
      resident_report_ids: reports.filter(r => r.block_number === place.block).map(r => r.id),
      photo_urls: [],
      notes: tagged(w.note),
      approved_by: officer.id,
      approved_by_name: officer.name,
      is_deleted: false,
    };
    // the read cache: one <stage>_at / _by / _by_name triple per stage passed
    for (const [stage, days] of w.stages) {
      if (stage === 'raised') continue; // `raised` is createdAt, it has no column triple
      row[`${stage}_at`] = daysAgo(days);
      row[`${stage}_by`] = officer.id;
      row[`${stage}_by_name`] = officer.name;
    }
    if (w.stages.some(([s]) => s === 'dispatched')) row.dispatched_to = w.agency;
    if (w.stages.some(([s]) => s === 'scheduled')) row.scheduled_for = daysAgo(w.stages.find(([s]) => s === 'scheduled')[1] - 1);
    const created = await WorkOrder.create(row, { silent: true });
    await WorkOrderEvent.bulkCreate(w.stages.map(([stage, days]) => ({
      work_order_id: created.id,
      stage,
      at: daysAgo(days),
      actor_id: officer.id,
      actor_name: officer.name,
      note: stage === 'raised' ? w.note : null,
    })));
    /* THE LINK BACK. Without this the dataset contradicted itself.
     *
     * The order recorded `assessment_ids`, but the assessments themselves kept
     * work_order_id = null - and null is exactly what the pending queue filters on. So
     * Block 123, Blk 846 and AMK Hub each showed up as PENDING while already carrying an
     * open work order, and an officer working the queue would have raised a second order
     * for a block that already had one. That is the precise failure this queue exists to
     * prevent, reproduced by the fixture meant to demonstrate it.
     *
     * Setting it here rather than in the RODENT array is deliberate: the id is not known
     * until the order is created, and duplicating the block-to-order mapping in two
     * places is how the two would drift.
     */
    if (linked.length) {
      await RodentAssessment.update(
        { work_order_id: created.id },
        { where: { id: linked.map(a => a.id) }, silent: true },
      );
    }
    orders.push(created);
  }

  const rules = await AlertRule.bulkCreate(ALERT_RULES.map(r => ({
    name: r.name,
    trigger_type: r.trigger_type,
    threshold: r.threshold,
    recipients: r.recipients,
    channel: r.channel,
    is_active: r.is_active,
    is_deleted: false,
    created_by: officer.id,
  })), { returning: true });

  // Two passes, because a retry row references the id of the failure it retries -
  // which does not exist until the first pass has been written.
  const byKey = {};
  for (const n of NOTIFICATIONS.filter(n => !n.retryOf)) {
    const row = await NotificationLog.create({
      rule_id: n.ruleIdx == null ? null : rules[n.ruleIdx].id,
      channel: n.channel,
      recipient: n.recipient,
      status: n.status,
      severity: n.severity,
      subject: n.subject,
      message_preview: n.preview,
      body: tagged(n.preview),
      error_reason: n.error || null,
      source_type: n.source_type,
      source_id: n.source_id,
      acknowledged_at: n.acknowledged ? hoursAgo(n.hours - 1) : null,
      acknowledged_by: n.acknowledged ? officer.id : null,
      acknowledged_by_name: n.acknowledged ? officer.name : null,
      createdAt: hoursAgo(n.hours),
      updatedAt: hoursAgo(n.acknowledged ? n.hours - 1 : n.hours),
    }, { silent: true });
    if (n.key) byKey[n.key] = row;
  }
  for (const n of NOTIFICATIONS.filter(n => n.retryOf)) {
    await NotificationLog.create({
      rule_id: n.ruleIdx == null ? null : rules[n.ruleIdx].id,
      channel: n.channel,
      recipient: n.recipient,
      status: n.status,
      severity: n.severity,
      subject: n.subject,
      message_preview: n.preview,
      body: tagged(n.preview),
      source_type: n.source_type,
      source_id: n.source_id,
      retry_of: byKey[n.retryOf].id,
      createdAt: hoursAgo(n.hours),
      updatedAt: hoursAgo(n.hours),
    }, { silent: true });
  }

  await SensorReading.bulkCreate(SENSOR_SITES.flatMap(s => SENSOR_OFFSETS.map(o => ({
    sensor_id: s.id,
    lat: at(s.place).lat,
    lng: at(s.place).lng,
    location_type: s.location_type,
    town_council: at(s.place).council,
    // clamped, so an offset can never push a modelled level outside 0-1
    activity_level: Math.max(0, Math.min(1, Number((s.base + o.delta).toFixed(2)))),
    recorded_at: hoursAgo(o.hours),
    is_simulated: true,
  }))));

  await MetricSnapshot.bulkCreate(SNAPSHOT_SERIES.map(s => ({
    snapshot_date: dateKey(daysAgo(s.d)),
    open_cases: s.open,
    critical_flora: s.crit,
    at_risk_flora: s.risk,
    active_hotspots: s.hot,
    total_sightings: s.sight,
    risk_score: s.score,
  })));

  return {
    users,
    flora: FLORA.length,
    fauna: FAUNA.length,
    cases: CASES.length,
    rodent: RODENT.length,
    workOrders: orders.length,
    rules: rules.length,
    notifications: NOTIFICATIONS.length,
    sensors: SENSOR_SITES.length * SENSOR_OFFSETS.length,
    snapshots: SNAPSHOT_SERIES.length,
  };
}

// Expected values a reviewer (or a test case) can check the dashboard against.
// Derived from the dataset above rather than written out by hand, so editing a row
// cannot leave a stale expectation behind.
const EXPECTED = {
  totalFlora: FLORA.length,
  totalCases: CASES.length,
  criticalFlora: FLORA.filter(f => f.health_status === 'critical').length,
  atRiskFlora: FLORA.filter(f => f.health_status === 'at_risk').length,
  totalSightings: FAUNA.length,
  openCases: CASES.filter(c => c.status === 'open').length,
  casesByStatus: {
    open: CASES.filter(c => c.status === 'open').length,
    in_progress: CASES.filter(c => c.status === 'in_progress').length,
    resolved: CASES.filter(c => c.status === 'resolved').length,
  },
  totalAssessments: RODENT.length,
  escalatedAssessments: RODENT.filter(r => r.escalate).length,
  assessmentsByRisk: ['low', 'medium', 'high', 'critical'].reduce((m, b) => {
    m[b] = RODENT.filter(r => r.risk === b).length;
    return m;
  }, {}),
  // distinct locations after normalisation - what the map's "By location" view and
  // the block table both group to
  rodentLocations: new Set(RODENT.map(r => r.place)).size,
  premisesLocations: new Set(RODENT.filter(r => at(r.place).premises).map(r => r.place)).size,
  /* THE ACTION QUEUE, derived the same way the route derives it - a location is pending
   * only while it has an escalation AND no work order. Written as a computation rather
   * than a number so adding a work order cannot leave a stale "7 clusters" behind. */
  orderedPlaces: new Set(WORK_ORDERS.map(w => w.place)).size,
  pendingEscalations: RODENT.filter(r => r.escalate && !r.dismissed && !WORK_ORDERS.some(w => w.place === r.place)).length,
  pendingClusters: new Set(
    RODENT.filter(r => r.escalate && !r.dismissed && !WORK_ORDERS.some(w => w.place === r.place)).map(r => r.place),
  ).size,
  dismissedEscalations: RODENT.filter(r => r.dismissed).length,
  // count - 1 per cluster: N reports at one block become ONE visit, so the saving is
  // every report after the first. Same rule as routes/workOrders.js.
  callOutsAvoidable: [...new Set(
    RODENT.filter(r => r.escalate && !r.dismissed && !WORK_ORDERS.some(w => w.place === r.place)).map(r => r.place),
  )].reduce((sum, place) => sum
    + Math.max(0, RODENT.filter(r => r.place === place && r.escalate && !r.dismissed).length - 1), 0),
  workOrders: WORK_ORDERS.length,
  closedWorkOrders: WORK_ORDERS.filter(w => w.stages.some(([s]) => s === 'closed')).length,
  alertRules: ALERT_RULES.length,
  activeAlertRules: ALERT_RULES.filter(r => r.is_active).length,
  notifications: NOTIFICATIONS.length,
  failedNotifications: NOTIFICATIONS.filter(n => n.status === 'failed').length,
  unacknowledgedFailures: NOTIFICATIONS.filter(n => n.status === 'failed' && !n.acknowledged).length,
  sensorReadings: SENSOR_SITES.length * SENSOR_OFFSETS.length,
  snapshots: SNAPSHOT_SERIES.length,
};

// Only run when invoked as a script (npm run test-data). Requiring this file from
// a test imports the dataset without writing anything.
if (require.main === module) {
  writeTestData()
    .then(async (r) => {
      console.log(`Test data written to ${sequelize.getDialect()}:`);
      console.log(`  users               ${ACCOUNTS.length} (admin / staff / resident)`);
      console.log(`  greenery records    ${r.flora}`);
      console.log(`  fauna sightings     ${r.fauna}`);
      console.log(`  resident reports    ${r.cases}`);
      console.log(`  rodent assessments  ${r.rodent} across ${EXPECTED.rodentLocations} locations`);
      console.log(`  work orders         ${r.workOrders} (every pipeline stage covered)`);
      console.log(`  action queue        ${EXPECTED.pendingClusters} pending clusters, ${EXPECTED.pendingEscalations} escalations, ${EXPECTED.callOutsAvoidable} call-outs avoidable, ${EXPECTED.dismissedEscalations} dismissed`);
      console.log(`  alert rules         ${r.rules} (${EXPECTED.activeAlertRules} active)`);
      console.log(`  notification log    ${r.notifications} (${EXPECTED.failedNotifications} failed, 1 retry)`);
      console.log(`  sensor readings     ${r.sensors} (simulated)`);
      console.log(`  metric snapshots    ${r.snapshots} days`);
      console.log(`  password            ${PASSWORD}`);
      await sequelize.close();
    })
    .catch(async (err) => {
      console.error('Failed to write test data:', err);
      await sequelize.close();
      process.exit(1);
    });
}

module.exports = {
  writeTestData, TAG, ACCOUNTS, PLACES,
  FLORA, FAUNA, CASES, RODENT, WORK_ORDERS, ALERT_RULES, NOTIFICATIONS,
  SENSOR_SITES, SNAPSHOT_SERIES, EXPECTED,
};
