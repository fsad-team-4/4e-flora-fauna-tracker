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
// Idempotent: every row it writes carries TAG in a free-text field, and the
// script deletes only TAG-carrying rows before re-inserting. Re-running converges
// to the same state and never touches records created by hand or by seed.js.
//
// Targets whatever DATABASE_URL points at (Neon/Postgres in deployment, the local
// SQLite file when unset), because it goes through the Sequelize models.
//
// Usage:  npm run test-data
require('dotenv').config();

const bcrypt = require('bcryptjs');
const {
  sequelize, User, GreeneryRecord, FaunaSighting, ResidentReport,
} = require('./models');

const TAG = '[test-data]';
const PASSWORD = process.env.TEST_DATA_PASSWORD || 'local-demo-only';

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

// One account per role, so every access path in the app can be exercised. The
// resident is the account the case-status email in M3/M5 is addressed to.
const ACCOUNTS = [
  { name: 'Test Admin', email: 'test.admin@emservices.com.sg', role: 'admin' },
  { name: 'Test Officer', email: 'test.officer@emservices.com.sg', role: 'staff' },
  { name: 'Test Resident', email: 'test.resident@example.com', role: 'resident' },
];

// 7 plants: 2 critical, 2 at_risk, 3 healthy. The dashboard's criticalFlora and
// atRiskFlora KPIs are asserted against those counts.
const FLORA = [
  { species: 'Bougainvillea', location_zone: 'Block 123', health_status: 'critical', days: 3 },
  { species: 'Frangipani', location_zone: 'Block 456', health_status: 'at_risk', days: 5 },
  { species: 'Hibiscus', location_zone: 'Block 789', health_status: 'healthy', days: 6 },
  { species: 'Ixora', location_zone: 'Block 234', health_status: 'at_risk', days: 4 },
  { species: 'Lantana', location_zone: 'Block 567', health_status: 'healthy', days: 8 },
  { species: 'Heliconia', location_zone: 'Block 890', health_status: 'critical', days: 2 },
  { species: 'Bird of Paradise', location_zone: 'Block 345', health_status: 'healthy', days: 9 },
];

// 7 sightings. Block 123 carries 4 and Block 456 carries 3, so Block 123 is the
// top hotspot and both clear a minCount of 3. Two are tagged feeding, which is
// what the feeding/rodent correlation reads.
const FAUNA = [
  { species: 'cat', block_number: 'Block 123', floor_level: 'L5', behaviour_tags: ['defecating'], hours: 2, gps_lat: 1.3691, gps_lng: 103.8454 },
  { species: 'cat', block_number: 'Block 123', floor_level: 'L3', behaviour_tags: ['roaming'], hours: 20, gps_lat: 1.3691, gps_lng: 103.8454 },
  { species: 'pigeon', block_number: 'Block 456', floor_level: 'L12', behaviour_tags: ['roosting'], hours: 5, gps_lat: 1.3702, gps_lng: 103.8467 },
  { species: 'pigeon', block_number: 'Block 456', floor_level: 'L12', behaviour_tags: ['feeding'], hours: 24, gps_lat: 1.3702, gps_lng: 103.8467 },
  { species: 'pigeon', block_number: 'Block 456', floor_level: 'L8', behaviour_tags: ['roosting'], hours: 48, gps_lat: 1.3702, gps_lng: 103.8467 },
  { species: 'cat', block_number: 'Block 123', floor_level: 'L1', behaviour_tags: ['urinating'], hours: 24, gps_lat: 1.3691, gps_lng: 103.8454 },
  { species: 'cat', block_number: 'Block 789', floor_level: 'Ground', behaviour_tags: ['feeding'], hours: 24, gps_lat: 1.3675, gps_lng: 103.8441 },
];

// 7 cases: 4 open, 2 in_progress, 1 resolved - the counts the case-status
// breakdown and the openCases KPI are asserted against.
// Coordinates matter: a resident submits a GPS pin, and townCouncils.councilFor()
// resolves a case to a council from that pin. Without coordinates a case cannot be
// attributed to any council, so these are spread across the four councils that
// services/townCouncils.js actually models - Ang Mo Kio, Bishan-Toa Payoh,
// Nee Soon and Sembawang - rather than all sitting in one.
const CASES = [
  { category: 'community_cat', block_number: 'Block 123', title: 'Cat keeps coming up to L5', status: 'open', hours: 0.3, gps_lat: 1.3691, gps_lng: 103.8454 },
  { category: 'pigeon', block_number: 'Block 456', title: 'Pigeon feeding at void deck', status: 'in_progress', hours: 2, gps_lat: 1.4304, gps_lng: 103.8354 },
  { category: 'flora_health', block_number: 'Block 123', title: 'Bougainvillea looking sick', status: 'open', hours: 20, gps_lat: 1.3700, gps_lng: 103.8460 },
  { category: 'pest', block_number: 'Block 234', title: 'Rodent sighting near garden', status: 'resolved', hours: 96, gps_lat: 1.3430, gps_lng: 103.8500 },
  { category: 'community_cat', block_number: 'Block 123', title: 'Cat litter at staircase', status: 'open', hours: 24, gps_lat: 1.3685, gps_lng: 103.8449 },
  { category: 'flora_health', block_number: 'Block 567', title: 'Dry patch on grass', status: 'in_progress', hours: 48, gps_lat: 1.4491, gps_lng: 103.8200 },
  { category: 'pigeon', block_number: 'Block 456', title: 'Bird droppings on Block 456 corridor', status: 'open', hours: 6, gps_lat: 1.4310, gps_lng: 103.8360 },
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

  // Clear only previous test-data rows, identified by TAG.
  await GreeneryRecord.destroy({ where: { health_notes: TAG } });
  await FaunaSighting.destroy({ where: { notes: TAG } });
  await ResidentReport.destroy({ where: { description: TAG } });

  await GreeneryRecord.bulkCreate(FLORA.map(f => ({
    species: f.species,
    location_zone: f.location_zone,
    location: f.location_zone,
    health_status: f.health_status,
    health_notes: TAG,
    last_inspected_at: daysAgo(f.days),
    recorded_by: users.staff.id,
  })));

  await FaunaSighting.bulkCreate(FAUNA.map(s => ({
    species: s.species,
    block_number: s.block_number,
    floor_level: s.floor_level,
    behaviour_tags: s.behaviour_tags,
    gps_lat: s.gps_lat,
    gps_lng: s.gps_lng,
    notes: TAG,
    reported_by: users.staff.id,
    createdAt: hoursAgo(s.hours),
  })), { silent: true }); // keep our createdAt instead of stamping "now"

  await ResidentReport.bulkCreate(CASES.map(c => ({
    category: c.category,
    title: c.title,
    description: TAG,
    block_number: c.block_number,
    gps_lat: c.gps_lat,
    gps_lng: c.gps_lng,
    status: c.status,
    reported_by: users.resident.id,
    createdAt: hoursAgo(c.hours),
  })), { silent: true }); // keep our createdAt instead of stamping "now"

  return { users, flora: FLORA.length, fauna: FAUNA.length, cases: CASES.length };
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
};

// Only run when invoked as a script (npm run test-data). Requiring this file from
// a test imports the dataset without writing anything.
if (require.main === module) {
  writeTestData()
    .then(async (r) => {
      console.log(`Test data written to ${sequelize.getDialect()}:`);
      console.log(`  users            ${ACCOUNTS.length} (admin / staff / resident)`);
      console.log(`  greenery records ${r.flora}`);
      console.log(`  fauna sightings  ${r.fauna}`);
      console.log(`  resident reports ${r.cases}`);
      console.log(`  password         ${PASSWORD}`);
      await sequelize.close();
    })
    .catch(async (err) => {
      console.error('Failed to write test data:', err);
      await sequelize.close();
      process.exit(1);
    });
}

module.exports = { writeTestData, TAG, ACCOUNTS, FLORA, FAUNA, CASES, EXPECTED };
