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
const { sequelize, AlertRule, NotificationLog, User, MetricSnapshot, FaunaSighting, RodentAssessment } = require('./models');
const mock = require('./services/mockDataService');
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
    flora: mock.getFloraRecords(),
    sightings: mock.getFaunaSightings(),
    cases: mock.getCases(),
  });
  await MetricSnapshot.destroy({ where: {} });
  const snapshots = [];
  for (let d = 10; d >= 1; d--) {
    // The risk score caps at 100 and today is already 76, so the seeded drift has
    // to stay inside that ~24pt headroom. Overshoot and computeRiskScore() clamps,
    // which flatlines the early history at the ceiling and makes the trend line
    // report the cap rather than the estate.
    const open_cases = today.openCases + (d >= 7 ? 2 : d >= 4 ? 1 : 0);  // +10 max
    const critical_flora = today.criticalFlora;                          // hold steady
    const at_risk_flora = today.atRiskFlora + (d >= 8 ? 1 : 0);          // +3 max
    const active_hotspots = today.activeHotspots + (d >= 5 ? 1 : 0);     // +10 max
    const total_sightings = today.totalSightings + Math.round(d / 2);
    const risk_score = computeRiskScore({ criticalFlora: critical_flora, activeHotspots: active_hotspots, openCases: open_cases, atRiskFlora: at_risk_flora });
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

  await RodentAssessment.bulkCreate(
    RODENT_FIXTURES.map(({ days_ago, ...r }, i) => ({
      ...r,
      assessed_by: adminId,
      createdAt: daysAgo(days_ago, 9 + (i % 8)),
      updatedAt: daysAgo(days_ago, 9 + (i % 8)),
    })),
    { silent: true }
  );

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
  console.log(`Login: ${DEMO_USERS.map(u => u.email).join(', ')}  (password: set via DEMO_PASSWORD env var)`);

  await sequelize.close();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});