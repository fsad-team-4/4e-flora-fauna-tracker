// angelyn
// Demo seed for the M4 alerts module: populates AlertRule + NotificationLog with
// realistic sample data so the Alert Rules and Notification Log pages (and the
// dashboard's "Alerts Sent (7d)" KPI) don't look empty during a client demo.
//
// Also seeds a cross-module fixture (feeding sightings + rodent reports at one
// block) so the feeding/rodent correlation has real data to reason over.
//
// Idempotent: clears AlertRule + NotificationLog + MetricSnapshot entirely, and
// removes ONLY its own cross-module fixture rows (matched on their exact notes /
// observations) before re-inserting. It never touches other members' data.
//
// Run with:  npm run seed   (from backend/)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, SensorReading, AlertRule, NotificationLog, User, MetricSnapshot, FaunaSighting, RodentAssessment } = require('./models');
const estateData = require('./services/estateDataService');
const { computeEstateMetrics, computeRiskScore } = require('./services/estateStats');

// Demo login accounts. Alert Rules, Notification Log and the dashboard all need a
// staff/admin JWT, so the demo needs real users to sign in with. Same password for
// both to keep the demo simple - change before any non-demo use.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'local-demo-only';
const DEMO_USERS = [
  { name: 'Estate Admin', email: 'admin@emservices.com.sg', role: 'admin' },
  { name: 'Estate Officer', email: 'staff@emservices.com.sg', role: 'staff' },
];

// n days ago (optionally at a set hour) as a real Date - used to spread the
// notification log across the last two weeks so the 7-day KPI and its
// week-over-week trend show believable, non-zero numbers.
function daysAgo(n, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Extra dispatch history so the Notification Log timeline has real density:
// a steady "sent" trickle across ~2 weeks, plus one failure "incident" burst
// (an SMS gateway outage) that shows up as a clear spike.
function genExtraLogs() {
  const out = [];
  const trickle = [
    { rule: 'Weekly estate summary', recipient: 'management@emservices.com.sg', preview: 'Weekly estate summary dispatched to management.' },
    { rule: 'Fauna hotspot warning', recipient: 'pestcontrol@emservices.com.sg', preview: 'Fauna hotspot alert dispatched to pest control.' },
    { rule: 'Critical flora alert', recipient: 'estate.ops@emservices.com.sg', preview: 'Critical flora alert dispatched to estate ops.' },
    { rule: 'Urgent case notification', recipient: 'duty.officer@emservices.com.sg', preview: 'Urgent case alert dispatched to the duty officer.' },
    { rule: 'Fauna hotspot warning', recipient: 'estate.ops@emservices.com.sg', preview: 'Fauna hotspot alert dispatched to estate ops.' },
  ];
  // a busy estate: ~26-33 dispatches/day spread across the full 24h so the
  // histogram renders as a continuous fine-line waveform rather than empty gaps.
  for (let d = 12; d >= 0; d--) {
    const n = 26 + ((d * 5) % 8); // 26-33 per day, deterministic
    for (let k = 0; k < n; k++) {
      const r = trickle[(d * 3 + k) % trickle.length];
      const hour = (k * 37) % 24;            // deterministic spread across the clock
      if (d === 0 && hour > new Date().getHours()) continue;
      const minute = (k * 17 + d * 7) % 60;
      out.push({ rule: r.rule, recipient: r.recipient, status: 'sent', createdAt: daysAgo(d, hour, minute), preview: r.preview });
    }
  }
  // SMS gateway outage ~2 days ago: 15 failed SMS legs over ~45 min + a few sent
  for (let i = 0; i < 15; i++) {
    out.push({ rule: 'Urgent case notification', recipient: 'duty.officer@emservices.com.sg', status: 'failed', channel: 'sms', createdAt: daysAgo(2, 14, 3 + i * 3), preview: `SMS gateway timeout (attempt ${i + 1}) - urgent case alert not delivered.` });
  }
  for (let i = 0; i < 4; i++) {
    out.push({ rule: 'Fauna hotspot warning', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(2, 14, 5 + i * 10), preview: 'Fauna hotspot alert dispatched to estate ops.' });
  }
  return out;
}

const RULES = [
  { name: 'Critical flora alert', trigger_type: 'flora_critical', threshold: 1, recipients: 'estate.ops@emservices.com.sg', channel: 'email', is_active: true },
  { name: 'Fauna hotspot warning', trigger_type: 'fauna_hotspot', threshold: 3, recipients: 'pestcontrol@emservices.com.sg, estate.ops@emservices.com.sg', channel: 'email', is_active: true },
  { name: 'Urgent case notification', trigger_type: 'new_case_urgent', threshold: null, recipients: 'duty.officer@emservices.com.sg', channel: 'both', is_active: true },
  { name: 'Weekly estate summary', trigger_type: 'weekly_summary', threshold: null, recipients: 'management@emservices.com.sg, estate.ops@emservices.com.sg', channel: 'email', is_active: true },
  { name: 'Pigeon roost SMS', trigger_type: 'fauna_hotspot', threshold: 5, recipients: 'cleaning.supervisor@emservices.com.sg', channel: 'sms', is_active: false },
];

// Notification log rows reference rules by name (resolved to ids after insert).
// createdAt is spread across ~2 weeks: 4 rows in the previous 7-day window and
// 7 in the most recent 7 days, so the dashboard trend badge reads "up".
const LOGS = [
  // previous 7-day window (8-14 days ago)
  { rule: 'Weekly estate summary', recipient: 'management@emservices.com.sg', status: 'sent', createdAt: daysAgo(13, 8), preview: 'Estate health update for the week: 2 plants critical, 1 at risk. 3 active fauna hotspots flagged at Block 123, Block 456.' },
  { rule: 'Weekly estate summary', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(13, 8), preview: 'Estate health update for the week: 2 plants critical, 1 at risk. 3 active fauna hotspots flagged at Block 123, Block 456.' },
  { rule: 'Fauna hotspot warning', recipient: 'pestcontrol@emservices.com.sg', status: 'sent', createdAt: daysAgo(11, 14), preview: 'Fauna hotspot: Block 123 logged 4 cat sightings in 24h. Recommend a site inspection.' },
  { rule: 'Critical flora alert', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(9, 10), preview: 'Flora alert: Bougainvillea at Block 123 flagged critical during the latest inspection.'},
  // most recent 7-day window (1-6 days ago)
  { rule: 'Weekly estate summary', recipient: 'management@emservices.com.sg', status: 'sent', createdAt: daysAgo(6, 8), preview: 'Estate health update for the week: 2 plants critical, 2 at risk. 3 active fauna hotspots flagged at Block 123, Block 456.' },
  { rule: 'Weekly estate summary', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(6, 8), preview: 'Estate health update for the week: 2 plants critical, 2 at risk. 3 active fauna hotspots flagged at Block 123, Block 456.' },
  { rule: 'Fauna hotspot warning', recipient: 'pestcontrol@emservices.com.sg', status: 'sent', createdAt: daysAgo(5, 15), preview: 'Fauna hotspot: Block 456 logged 3 pigeon sightings in 24h. Recommend a site inspection.' },
  { rule: 'Urgent case notification', recipient: 'duty.officer@emservices.com.sg', status: 'sent', createdAt: daysAgo(4, 11), preview: "Urgent case opened at Block 123: 'Cat keeps coming up to L5'. Assigned to the duty officer." },
  { rule: 'Pigeon roost SMS', recipient: 'cleaning.supervisor@emservices.com.sg', status: 'failed', createdAt: daysAgo(3, 16), preview: 'SMS gateway timeout - message was not delivered. Retry queued.' },
  { rule: 'Fauna hotspot warning', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(2, 13), preview: 'Fauna hotspot: Block 123 logged 5 cat sightings in 24h. Recommend a site inspection.' },
  { rule: 'Critical flora alert', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(1, 9), preview: 'Flora alert: Heliconia at Block 890 flagged critical during the latest inspection.' },
];

// ---------------------------------------------------------------------------
// Cross-module fixture for the risk map and the feeding/rodent correlation.
//
// SYNTHETIC DEMO FIXTURES. Every coordinate below is fabricated. That is fine
// for seed data - it is openly made up so the map and the correlation have
// something to reason over during a demo. It does NOT license the running system
// to guess a position for a real assessment: an officer with no signal still
// files with no coordinate, and that row stays OFF the map and COUNTED in the
// "not shown" line. Absence of a coordinate is real data, never a gap to fill.
//
// LAYOUT: one Ang Mo Kio estate, six blocks within ~400m. Rodent risk is spread
// across the blocks with a range of severities so the map's severity ramp has
// something to show. Feeding sightings are deliberately CLUSTERED NEAR the two
// blocks carrying the heaviest rodent risk (128 and 123) - that spatial
// co-occurrence is the whole point of the correlation. Block 126 carries feeding
// with NO nearby rodent, and Block 125 carries rodent with NO feeding, so the two
// map layers are honestly shown NOT to coincide everywhere.
//
// BLOCK FORMAT: the fauna module writes bare numbers ("128") and this module
// writes "Block 128". That inconsistency is real and lives in the data - the
// correlation normalises before joining. Fixtures follow each module's own
// convention rather than quietly harmonising them.
//
// Each fixture carries days_ago inline (destructured out before insert) so adding
// or removing a row can't desync a parallel date array.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// REAL LAYER, spread beyond the anchor estate.
//
// The Ang Mo Kio cluster above (blocks 122-128) is the demo's co-occurrence
// story and is left exactly as it was. These add genuine officer-reported points
// in three more town councils so the real layer is a spread of discrete reports
// rather than one dot - WITHOUT inventing positions for the ~35 existing
// assessments that were filed without one. Those stay unmapped and counted.
// Coordinates are HDB town centres, i.e. where an officer plausibly stood.
// ---------------------------------------------------------------------------
const RODENT_FIXTURES_REGIONAL = [
  // Bishan-Toa Payoh TC
  { block_number: 'Blk 165 Bishan St 13', floor_level: 'L1', days_ago: 11, gps_lat: 1.34640, gps_lng: 103.84870, risk_level: 'medium',
    observations: 'Droppings around the bin centre behind the coffee shop.',
    likely_cause: 'Food waste from the adjoining F&B units.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Clear Waste', detail: 'Tighten the F&B refuse clearing schedule.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Blk 79 Toa Payoh Lor 4', floor_level: 'L1', days_ago: 6, gps_lat: 1.33410, gps_lng: 103.85020, risk_level: 'high',
    observations: 'Live sighting at the refuse chute, plus fresh gnaw marks.',
    likely_cause: 'Established harbourage beside a continuous food source.', signs_identified: ['Live sighting', 'Gnaw marks'],
    immediate_actions: [{ title: 'Escalate', detail: 'Raise a pest control call-out for the chute area.' }],
    escalate_to_contractor: true, escalation_reason: 'Live sighting at a refuse chute' },
  { block_number: 'Blk 190 Lor 6 Toa Payoh', floor_level: 'L2', days_ago: 15, gps_lat: 1.33720, gps_lng: 103.85440, risk_level: 'low',
    observations: 'Isolated droppings on the second-storey corridor.',
    likely_cause: 'Occasional transit, no food source identified.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Monitor', detail: 'Re-inspect at the next routine round.' }],
    escalate_to_contractor: false, escalation_reason: null },

  // Nee Soon TC
  { block_number: 'Blk 846 Yishun Ring Rd', floor_level: 'L1', days_ago: 9, gps_lat: 1.42970, gps_lng: 103.83600, risk_level: 'high',
    observations: 'Burrow opening by the bin centre, droppings across the surround.',
    likely_cause: 'Harbourage established next to an uncleared refuse point.', signs_identified: ['Burrow', 'Rodent droppings'],
    immediate_actions: [{ title: 'Seal Burrow', detail: 'Seal the burrow and reinstate the surround.' }],
    escalate_to_contractor: true, escalation_reason: 'Active burrow at a refuse point' },
  { block_number: 'Blk 290 Yishun St 22', floor_level: 'L1', days_ago: 4, gps_lat: 1.43220, gps_lng: 103.83890, risk_level: 'medium',
    observations: 'Gnaw marks on the bin lids at the void deck.',
    likely_cause: 'Damaged bin seals allowing access.', signs_identified: ['Gnaw marks'],
    immediate_actions: [{ title: 'Repair Bins', detail: 'Replace the damaged lids.' }],
    escalate_to_contractor: false, escalation_reason: null },

  // Sembawang TC
  { block_number: 'Blk 355 Sembawang Way', floor_level: 'L1', days_ago: 13, gps_lat: 1.44860, gps_lng: 103.81820, risk_level: 'medium',
    observations: 'Droppings near the coffee shop bin bay.',
    likely_cause: 'F&B waste held overnight in the open bay.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Inspect Bins', detail: 'Check the bay is cleared before close.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Blk 411 Canberra Rd', floor_level: 'L1', days_ago: 2, gps_lat: 1.45080, gps_lng: 103.82330, risk_level: 'low',
    observations: 'A few droppings by the void deck seating, no live sighting.',
    likely_cause: 'Residents feeding birds at the seating area.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Advisory', detail: 'Issue a feeding advisory notice.' }],
    escalate_to_contractor: false, escalation_reason: null },
];


// ===========================================================================
// SIMULATED RATSENSE SENSOR DEPLOYMENT - NOT REAL READINGS
//
// The client's brief describes an existing pilot with smart sensors and cameras
// monitoring rodent activity. Nothing below came from that pilot: these rows
// MODEL what such a deployment would emit, so the regional surface has a
// genuinely continuous field to interpolate. Officer-reported assessments are
// discrete events and are never interpolated; only this layer is.
//
// Every row is written with is_simulated: true, the API pins that flag in its
// WHERE clause, and the UI labels the layer from it. No service that computes a
// real metric reads this table - asserted by tests/angelyn/simulatedDataIsolation.
//
// Placement models a real deployment: sensors sit at refuse chutes, bin centres,
// F&B units and void decks - the places rodents are actually monitored - not on
// a uniform grid. Baselines CORRELATE with the real assessment fixtures, so the
// two layers tell one coherent story: the Ang Mo Kio blocks carrying high-risk
// reports (123/128) sit under the hottest simulated readings, and the Toa Payoh
// and Yishun escalations show as secondary peaks.
// ===========================================================================
const SENSOR_DEPLOYMENT = [
  // --- Ang Mo Kio TC: the anchor estate, hottest (matches blocks 123/128) ----
  { id: 'AMK-RC-001', lat: 1.36780, lng: 103.84660, type: 'refuse_chute', tc: 'Ang Mo Kio Town Council', base: 8.4 },
  { id: 'AMK-BC-002', lat: 1.36792, lng: 103.84648, type: 'bin_centre',   tc: 'Ang Mo Kio Town Council', base: 7.9 },
  { id: 'AMK-VD-003', lat: 1.36810, lng: 103.84700, type: 'void_deck',    tc: 'Ang Mo Kio Town Council', base: 5.2 },
  { id: 'AMK-RC-004', lat: 1.36925, lng: 103.84521, type: 'refuse_chute', tc: 'Ang Mo Kio Town Council', base: 7.1 },
  { id: 'AMK-BC-005', lat: 1.36910, lng: 103.84540, type: 'bin_centre',   tc: 'Ang Mo Kio Town Council', base: 6.6 },
  { id: 'AMK-FB-006', lat: 1.36960, lng: 103.84610, type: 'fnb_unit',     tc: 'Ang Mo Kio Town Council', base: 6.0 },
  { id: 'AMK-VD-007', lat: 1.37010, lng: 103.84500, type: 'void_deck',    tc: 'Ang Mo Kio Town Council', base: 3.4 },
  { id: 'AMK-BC-008', lat: 1.36850, lng: 103.84480, type: 'bin_centre',   tc: 'Ang Mo Kio Town Council', base: 4.1 },
  { id: 'AMK-FB-009', lat: 1.37180, lng: 103.84760, type: 'fnb_unit',     tc: 'Ang Mo Kio Town Council', base: 5.5 },
  { id: 'AMK-VD-010', lat: 1.37320, lng: 103.84410, type: 'void_deck',    tc: 'Ang Mo Kio Town Council', base: 2.2 },
  { id: 'AMK-RC-011', lat: 1.36640, lng: 103.85010, type: 'refuse_chute', tc: 'Ang Mo Kio Town Council', base: 3.8 },
  { id: 'AMK-BC-012', lat: 1.37480, lng: 103.84980, type: 'bin_centre',   tc: 'Ang Mo Kio Town Council', base: 2.9 },

  // --- Bishan-Toa Payoh TC: secondary peak at the Lor 4 escalation ----------
  { id: 'BTP-RC-001', lat: 1.33410, lng: 103.85020, type: 'refuse_chute', tc: 'Bishan-Toa Payoh Town Council', base: 7.6 },
  { id: 'BTP-FB-002', lat: 1.33470, lng: 103.84960, type: 'fnb_unit',     tc: 'Bishan-Toa Payoh Town Council', base: 6.3 },
  { id: 'BTP-BC-003', lat: 1.33720, lng: 103.85440, type: 'bin_centre',   tc: 'Bishan-Toa Payoh Town Council', base: 3.1 },
  { id: 'BTP-BC-004', lat: 1.34640, lng: 103.84870, type: 'bin_centre',   tc: 'Bishan-Toa Payoh Town Council', base: 5.4 },
  { id: 'BTP-FB-005', lat: 1.34700, lng: 103.84800, type: 'fnb_unit',     tc: 'Bishan-Toa Payoh Town Council', base: 4.8 },
  { id: 'BTP-VD-006', lat: 1.35080, lng: 103.84520, type: 'void_deck',    tc: 'Bishan-Toa Payoh Town Council', base: 2.0 },
  { id: 'BTP-RC-007', lat: 1.33180, lng: 103.85700, type: 'refuse_chute', tc: 'Bishan-Toa Payoh Town Council', base: 3.6 },
  { id: 'BTP-VD-008', lat: 1.35510, lng: 103.83900, type: 'void_deck',    tc: 'Bishan-Toa Payoh Town Council', base: 1.7 },

  // --- Nee Soon TC: burrow escalation at Yishun Ring Rd --------------------
  { id: 'NSN-BC-001', lat: 1.42970, lng: 103.83600, type: 'bin_centre',   tc: 'Nee Soon Town Council', base: 7.8 },
  { id: 'NSN-RC-002', lat: 1.43030, lng: 103.83540, type: 'refuse_chute', tc: 'Nee Soon Town Council', base: 6.9 },
  { id: 'NSN-VD-003', lat: 1.43220, lng: 103.83890, type: 'void_deck',    tc: 'Nee Soon Town Council', base: 4.6 },
  { id: 'NSN-FB-004', lat: 1.42760, lng: 103.83530, type: 'fnb_unit',     tc: 'Nee Soon Town Council', base: 5.1 },
  { id: 'NSN-BC-005', lat: 1.43610, lng: 103.84150, type: 'bin_centre',   tc: 'Nee Soon Town Council', base: 2.8 },
  { id: 'NSN-VD-006', lat: 1.42280, lng: 103.83180, type: 'void_deck',    tc: 'Nee Soon Town Council', base: 1.9 },
  { id: 'NSN-RC-007', lat: 1.44050, lng: 103.83760, type: 'refuse_chute', tc: 'Nee Soon Town Council', base: 3.3 },

  // --- Sembawang TC: quietest, matching the low/medium reports there -------
  { id: 'SMB-BC-001', lat: 1.44860, lng: 103.81820, type: 'bin_centre',   tc: 'Sembawang Town Council', base: 4.4 },
  { id: 'SMB-FB-002', lat: 1.44910, lng: 103.81760, type: 'fnb_unit',     tc: 'Sembawang Town Council', base: 3.9 },
  { id: 'SMB-VD-003', lat: 1.45080, lng: 103.82330, type: 'void_deck',    tc: 'Sembawang Town Council', base: 2.1 },
  { id: 'SMB-RC-004', lat: 1.44620, lng: 103.82040, type: 'refuse_chute', tc: 'Sembawang Town Council', base: 2.6 },
  { id: 'SMB-BC-005', lat: 1.45330, lng: 103.81530, type: 'bin_centre',   tc: 'Sembawang Town Council', base: 1.8 },
  { id: 'SMB-VD-006', lat: 1.44300, lng: 103.82580, type: 'void_deck',    tc: 'Sembawang Town Council', base: 1.4 },
];

// Deterministic pseudo-noise: a seeded run must reproduce the same surface, so
// Math.random() is deliberately avoided.
function sensorNoise(i, day) {
  return (Math.sin(i * 12.9898 + day * 78.233) * 43758.5453) % 1;
}

// One reading per sensor every ~2 days over the window, with a mild upward drift
// on the hot sensors so the "as of" scrubber shows a story rather than noise.
function buildSensorReadings(days = 30, stepDays = 2) {
  const rows = [];
  SENSOR_DEPLOYMENT.forEach((s, i) => {
    for (let d = days; d >= 0; d -= stepDays) {
      const progress = (days - d) / days;              // 0 at oldest -> 1 at newest
      const drift = s.base >= 6 ? progress * 1.8 : progress * 0.3;
      const wobble = sensorNoise(i, d) * 1.1;
      const level = Math.max(0, Math.round((s.base + drift + wobble) * 10) / 10);
      rows.push({
        sensor_id: s.id,
        lat: s.lat,
        lng: s.lng,
        location_type: s.type,
        town_council: s.tc,
        activity_level: level,
        recorded_at: daysAgo(d, 6 + (i % 12)),
        is_simulated: true,   // never anything else in seed data
      });
    }
  });
  return rows;
}

const FEEDING_FIXTURES = [
  // near Block 123 - co-occurs with the 123 rodent cluster
  { species: 'cat',    block_number: '123', floor_level: '1', behaviour_tags: ['feeding'], status: 'open', days_ago: 25, gps_lat: 1.36912, gps_lng: 103.84545, notes: 'Food bowls left at the void deck' },
  { species: 'cat',    block_number: '123', floor_level: '1', behaviour_tags: ['feeding'], status: 'open', days_ago: 23, gps_lat: 1.36908, gps_lng: 103.84532, notes: 'Same feeding spot, food scraps not cleared' },
  { species: 'pigeon', block_number: '123', floor_level: '1', behaviour_tags: ['feeding'], status: 'open', days_ago: 21, gps_lat: 1.36920, gps_lng: 103.84550, notes: 'Bread scattered near the bin centre' },
  // filed with no position - stays off the map, counted in the "not shown" line
  { species: 'cat',    block_number: '123', floor_level: '2', behaviour_tags: ['feeding'], status: 'open', days_ago: 20, notes: 'Feeding observed at the staircase landing' },
  // near Block 128 - co-occurs with the heaviest rodent cluster
  { species: 'cat',    block_number: '128', floor_level: '1', behaviour_tags: ['feeding'], status: 'open', days_ago: 24, gps_lat: 1.36786, gps_lng: 103.84652, notes: 'Cats fed daily at the void deck seating' },
  { species: 'pigeon', block_number: '128', floor_level: '1', behaviour_tags: ['feeding'], status: 'open', days_ago: 22, gps_lat: 1.36773, gps_lng: 103.84668, notes: 'Rice and bread left out near the bin centre' },
  { species: 'cat',    block_number: '128', floor_level: '1', behaviour_tags: ['feeding'], status: 'open', days_ago: 19, gps_lat: 1.36795, gps_lng: 103.84663, notes: 'Cat food containers left by the staircase' },
  // feeding with NO nearby rodent report - the two layers do not always coincide
  { species: 'cat',    block_number: '126', floor_level: '1', behaviour_tags: ['feeding'], status: 'open', days_ago: 18, gps_lat: 1.36990, gps_lng: 103.84560, notes: 'Feeding spot at the linkway seating' },
];

// Rodent reports dated AFTER the feeding and escalating over time, so the
// sequence supports the diagnosis rather than contradicting it. Coordinates stay
// within the block (void deck / corridor / refuse chute), never scattered.
const RODENT_FIXTURES = [
  // Block 128 - the heaviest, escalating cluster. Two capture points: a busy one
  // at the void deck (4 reports) and the refuse chute (2). Weighted total is 22,
  // and the single most intense CELL is High x2 = 12 - the two numbers the heat
  // map legend must not conflate.
  { block_number: 'Block 128', floor_level: 'L1', days_ago: 12, gps_lat: 1.36780, gps_lng: 103.84660, risk_level: 'low',
    observations: 'Droppings near the void deck seating at Block 128.',
    likely_cause: 'Food waste around the void deck seating.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Clear Waste', detail: 'Clear food waste around the void deck seating.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Block 128', floor_level: 'L1', days_ago: 10, gps_lat: 1.36780, gps_lng: 103.84660, risk_level: 'medium',
    observations: 'More droppings around the Block 128 bin centre, food scraps present.',
    likely_cause: 'A sustained food source near the bin centre.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Inspect Bins', detail: 'Check bin seals and the clearing schedule.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Block 128', floor_level: 'L1', days_ago: 8, gps_lat: 1.36792, gps_lng: 103.84648, risk_level: 'medium',
    observations: 'Droppings along the Block 128 corridor near the side staircase.',
    likely_cause: 'Rodents travelling the corridor to the food source.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Inspect Corridor', detail: 'Check the corridor and staircase for harbourage.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Block 128', floor_level: 'L1', days_ago: 7, gps_lat: 1.36780, gps_lng: 103.84660, risk_level: 'medium',
    observations: 'Gnaw marks on the Block 128 bin lids, droppings recurring.',
    likely_cause: 'Persistent food source supporting continued activity.', signs_identified: ['Gnaw marks', 'Rodent droppings'],
    immediate_actions: [{ title: 'Repair Bins', detail: 'Replace damaged bin lids and reseal.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Block 128', floor_level: 'L1', days_ago: 5, gps_lat: 1.36792, gps_lng: 103.84648, risk_level: 'high',
    observations: 'Rub marks and a burrow opening by the Block 128 refuse chute.',
    likely_cause: 'Established harbourage next to an ongoing food source.', signs_identified: ['Rub marks', 'Burrow'],
    immediate_actions: [{ title: 'Inspect Chute', detail: 'Seal the burrow and inspect the chute surround.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Block 128', floor_level: 'L1', days_ago: 3, gps_lat: 1.36780, gps_lng: 103.84660, risk_level: 'high',
    observations: 'Live sighting near the Block 128 bin centre in the evening.',
    likely_cause: 'Established rodent presence with a persistent food source.', signs_identified: ['Live sighting', 'Rodent droppings'],
    immediate_actions: [{ title: 'Escalate', detail: 'Raise a pest control call-out and pair with a feeding advisory.' }],
    escalate_to_contractor: true, escalation_reason: 'Live sighting alongside a persistent food source' },

  // Block 123 - the original escalating cluster, three distinct spots.
  { block_number: 'Block 123', floor_level: 'L1', days_ago: 9, gps_lat: 1.36910, gps_lng: 103.84540, risk_level: 'low',
    observations: 'Droppings found near the bin centre at the void deck.',
    likely_cause: 'Food waste accumulating near the refuse point.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Clear Waste', detail: 'Clear accumulated food waste around the bin centre.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Block 123', floor_level: 'L1', days_ago: 6, gps_lat: 1.36934, gps_lng: 103.84556, risk_level: 'medium',
    observations: 'More droppings along the same corridor, plus gnaw marks on the bin lid.',
    likely_cause: 'A sustained food source is supporting continued rodent activity.', signs_identified: ['Rodent droppings', 'Gnaw marks'],
    immediate_actions: [{ title: 'Inspect Bins', detail: 'Check bin lids and seals for damage across the block.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Block 123', floor_level: 'L1', days_ago: 4, gps_lat: 1.36925, gps_lng: 103.84521, risk_level: 'high',
    observations: 'Live sighting near the refuse chute in the evening.',
    likely_cause: 'Established rodent presence with an ongoing food source.', signs_identified: ['Live sighting', 'Rodent droppings'],
    immediate_actions: [{ title: 'Escalate', detail: 'Raise a pest control call-out for the block.' }],
    escalate_to_contractor: true, escalation_reason: 'Live sighting alongside a persistent food source' },

  // Block 125 - a single CRITICAL report, no feeding nearby. One report at the
  // darkest severity: on the map this is a SMALL marker in the DEEPEST colour,
  // proving colour (severity) and size (count) are independent channels.
  { block_number: 'Block 125', floor_level: 'L1', days_ago: 5, gps_lat: 1.37010, gps_lng: 103.84500, risk_level: 'critical',
    observations: 'Multiple live sightings and a suspected nest behind the Block 125 substation.',
    likely_cause: 'Sheltered harbourage next to the substation.', signs_identified: ['Live sighting', 'Nest'],
    immediate_actions: [{ title: 'Escalate', detail: 'Urgent pest control call-out; cordon the area.' }],
    escalate_to_contractor: true, escalation_reason: 'Suspected nest with repeated live sightings' },

  // Block 124 - two reports at one spot, moderate.
  { block_number: 'Block 124', floor_level: 'L1', days_ago: 8, gps_lat: 1.36960, gps_lng: 103.84610, risk_level: 'low',
    observations: 'A few droppings by the Block 124 letterbox area.',
    likely_cause: 'Litter around the letterboxes.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Clean', detail: 'Sweep and clear litter around the letterboxes.' }],
    escalate_to_contractor: false, escalation_reason: null },
  { block_number: 'Block 124', floor_level: 'L1', days_ago: 6, gps_lat: 1.36960, gps_lng: 103.84610, risk_level: 'medium',
    observations: 'Droppings and gnaw marks near the Block 124 bin point.',
    likely_cause: 'Food waste at the bin point.', signs_identified: ['Rodent droppings', 'Gnaw marks'],
    immediate_actions: [{ title: 'Inspect Bins', detail: 'Check the bin point seals and clearing.' }],
    escalate_to_contractor: false, escalation_reason: null },

  // Block 122 - a single faint low report.
  { block_number: 'Block 122', floor_level: 'L1', days_ago: 11, gps_lat: 1.36850, gps_lng: 103.84480, risk_level: 'low',
    observations: 'Isolated droppings at the Block 122 void deck.',
    likely_cause: 'One-off litter.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Monitor', detail: 'Note and re-check on the next round.' }],
    escalate_to_contractor: false, escalation_reason: null },

  // Block 130 - filed with NO GPS signal. Counted in the heat map, but stays OFF
  // the risk map and inside the "not shown" line. Never placed at a guess.
  { block_number: 'Block 130', floor_level: 'L1', days_ago: 7, risk_level: 'medium',
    observations: 'Droppings reported at Block 130; officer had no GPS signal to record a position.',
    likely_cause: 'Food waste near the bin centre.', signs_identified: ['Rodent droppings'],
    immediate_actions: [{ title: 'Re-inspect', detail: 'Return with a position where signal allows.' }],
    escalate_to_contractor: false, escalation_reason: null },
];

async function seed() {
  await sequelize.sync();

  // ensure the demo login accounts exist, idempotently (keyed on email, so real
  // users are never touched and re-running just refreshes the demo credentials)
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let adminId = null;
  for (const u of DEMO_USERS) {
    const [user, created] = await User.findOrCreate({
      where: { email: u.email },
      defaults: { name: u.name, role: u.role, password_hash },
    });
    if (!created) {
      await user.update({ name: u.name, role: u.role, password_hash });
    }
    if (u.role === 'admin') adminId = user.id;
  }

  // attribute the rules to the demo admin (created_by is a nullable FK)
  const created_by = adminId;

  // clear only these two tables - logs first because they reference rules
  await NotificationLog.destroy({ where: {} });
  await AlertRule.destroy({ where: {} });

  const createdRules = await AlertRule.bulkCreate(
    RULES.map(r => ({ ...r, created_by })),
    { validate: true }
  );
  const ruleId = Object.fromEntries(createdRules.map(r => [r.name, r.id]));

  const allLogs = [...LOGS, ...genExtraLogs()];
  await NotificationLog.bulkCreate(
    allLogs.map(l => ({
      rule_id: ruleId[l.rule],
      channel: l.channel || (l.rule.includes('SMS') ? 'sms' : 'email'),
      recipient: l.recipient,
      status: l.status,
      message_preview: l.preview,
      createdAt: l.createdAt,
      updatedAt: l.createdAt,
    })),
    { silent: true } // keep our provided createdAt instead of stamping "now"
  );

  // seed 10 days of metric history so the dashboard's trend arrows have a real
  // baseline to diff against on day one. Values drift slightly higher in the past
  // and converge to today's actual numbers, so the estate reads as "improving".
  const today = computeEstateMetrics({
    flora: await estateData.getFloraRecords(),
    sightings: await estateData.getFaunaSightings(),
    cases: await estateData.getCases(),
  });
  await MetricSnapshot.destroy({ where: {} });
  const snapshots = [];
  for (let d = 10; d >= 1; d--) {
    // The old headroom warning here is gone with the formula it described: the score
    // is a weighted share now, bounded by construction rather than clipped, so drift
    // no longer has to be kept inside a gap below the ceiling. The denominators are
    // held at today's totals - the point of the history is that the estate IMPROVED,
    // so the same population with fewer problems must score lower.
    const open_cases = today.openCases + (d >= 7 ? 2 : d >= 4 ? 1 : 0);
    const critical_flora = today.criticalFlora;                          // hold steady
    const at_risk_flora = today.atRiskFlora + (d >= 8 ? 1 : 0);
    const active_hotspots = today.activeHotspots + (d >= 5 ? 1 : 0);
    const total_sightings = today.totalSightings + Math.round(d / 2);
    const risk_score = computeRiskScore({
      criticalFlora: critical_flora,
      activeHotspots: active_hotspots,
      openCases: open_cases,
      atRiskFlora: at_risk_flora,
      totalFlora: today.totalFlora,
      // past open cases are added on top, so the case population grows with them
      totalCases: today.totalCases + (open_cases - today.openCases),
    });
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    snapshots.push({ snapshot_date: dt.toISOString().slice(0, 10), open_cases, critical_flora, at_risk_flora, active_hotspots, total_sightings, risk_score });
  }
  await MetricSnapshot.bulkCreate(snapshots);

  // ---- cross-module fixture ------------------------------------------------
  // Remove ONLY our own fixture rows (matched on their exact notes/observations)
  // so re-running doesn't stack duplicates. Everything else in these two tables -
  // including rows created through the UI, and the fauna module's own data - is
  // left untouched.
  await FaunaSighting.destroy({ where: { notes: FEEDING_FIXTURES.map(f => f.notes) } });
  await RodentAssessment.destroy({ where: { observations: RODENT_FIXTURES.map(r => r.observations) } });

  await FaunaSighting.bulkCreate(
    FEEDING_FIXTURES.map(({ days_ago, ...f }, i) => ({
      ...f,
      reported_by: adminId,          // NOT NULL on FaunaSighting
      createdAt: daysAgo(days_ago, 9 + (i % 8)),   // hour bounded so extra rows never roll the date
      updatedAt: daysAgo(days_ago, 9 + (i % 8)),
    })),
    { silent: true }
  );

  await RodentAssessment.destroy({ where: { observations: RODENT_FIXTURES_REGIONAL.map(r => r.observations) } });
  await RodentAssessment.bulkCreate(
    [...RODENT_FIXTURES, ...RODENT_FIXTURES_REGIONAL].map(({ days_ago, ...r }, i) => ({
      ...r,
      assessed_by: adminId,
      createdAt: daysAgo(days_ago, 9 + (i % 8)),
      updatedAt: daysAgo(days_ago, 9 + (i % 8)),
    })),
    { silent: true }
  );

  // SIMULATED sensor layer. Replaced wholesale each seed so a re-run does not
  // stack duplicate readings on the same sensors.
  await SensorReading.destroy({ where: {} });
  const sensorRows = buildSensorReadings();
  await SensorReading.bulkCreate(sensorRows, { silent: true });

  // sanity output so the demo runner can confirm the numbers before presenting
  const since = daysAgo(7, 0);
  const prev = daysAgo(14, 0);
  const { Op } = require('sequelize');
  const last7 = await NotificationLog.count({ where: { createdAt: { [Op.gte]: since } } });
  const prev7 = await NotificationLog.count({ where: { createdAt: { [Op.gte]: prev, [Op.lt]: since } } });
  console.log(`Seeded ${DEMO_USERS.length} demo users, ${createdRules.length} alert rules, ${allLogs.length} notification log entries and ${snapshots.length} days of metric history.`);
  console.log(`Dashboard "Alerts Sent (7d)": ${last7} (prev 7d: ${prev7}, trend ${last7 - prev7 >= 0 ? '+' : ''}${last7 - prev7}).`);
  console.log(`Estate risk index today: ${today.riskScore}/100 (${today.riskStatus}).`);
  const rodentMapped = RODENT_FIXTURES.filter(r => r.gps_lat != null && r.gps_lng != null).length;
  const feedingMapped = FEEDING_FIXTURES.filter(f => f.gps_lat != null && f.gps_lng != null).length;
  console.log(`Correlation fixture: ${FEEDING_FIXTURES.length} feeding sightings (${feedingMapped} mapped) and ${RODENT_FIXTURES.length} rodent reports (${rodentMapped} mapped) across an Ang Mo Kio estate; feeding clustered near blocks 123 and 128.`);
  console.log(`SIMULATED RATSENSE layer: ${SENSOR_DEPLOYMENT.length} sensors, ${sensorRows.length} readings across 4 town councils - is_simulated=true, excluded from every computed metric.`);
  console.log(`Login: ${DEMO_USERS.map(u => u.email).join(', ')}  (password: set via DEMO_PASSWORD env var)`);

  await sequelize.close();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});