// angelyn
// Demo seed for the M4 alerts module: populates AlertRule + NotificationLog with
// realistic sample data so the Alert Rules and Notification Log pages (and the
// dashboard's "Alerts Sent (7d)" KPI) don't look empty during a client demo.
//
// Idempotent: clears ONLY these two tables and re-inserts, so re-running gives the
// same state. It never touches Users, reports, flora, etc.
//
// Run with:  npm run seed   (from backend/)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, AlertRule, NotificationLog, User, MetricSnapshot } = require('./models');
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
  { name: 'Pigeon roost SMS (paused)', trigger_type: 'fauna_hotspot', threshold: 5, recipients: 'cleaning.supervisor@emservices.com.sg', channel: 'sms', is_active: false },
];

// Notification log rows reference rules by name (resolved to ids after insert).
// createdAt is spread across ~2 weeks: 4 rows in the previous 7-day window and
// 7 in the most recent 7 days, so the dashboard trend badge reads "up".
const LOGS = [
  // previous 7-day window (8-14 days ago)
  { rule: 'Weekly estate summary', recipient: 'management@emservices.com.sg', status: 'sent', createdAt: daysAgo(13, 8), preview: 'Estate health update for the week: 2 plants critical, 1 at risk. 3 active fauna hotspots flagged at Block 123, Block 456.' },
  { rule: 'Weekly estate summary', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(13, 8), preview: 'Estate health update for the week: 2 plants critical, 1 at risk. 3 active fauna hotspots flagged at Block 123, Block 456.' },
  { rule: 'Fauna hotspot warning', recipient: 'pestcontrol@emservices.com.sg', status: 'sent', createdAt: daysAgo(11, 14), preview: 'Fauna hotspot: Block 123 logged 4 cat sightings in 24h. Recommend a site inspection.' },
  { rule: 'Critical flora alert', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(9, 10), preview: 'Flora alert: Bougainvillea at Block 123 flagged critical during the latest inspection.' },
  // most recent 7-day window (1-6 days ago)
  { rule: 'Weekly estate summary', recipient: 'management@emservices.com.sg', status: 'sent', createdAt: daysAgo(6, 8), preview: 'Estate health update for the week: 2 plants critical, 2 at risk. 3 active fauna hotspots flagged at Block 123, Block 456.' },
  { rule: 'Weekly estate summary', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(6, 8), preview: 'Estate health update for the week: 2 plants critical, 2 at risk. 3 active fauna hotspots flagged at Block 123, Block 456.' },
  { rule: 'Fauna hotspot warning', recipient: 'pestcontrol@emservices.com.sg', status: 'sent', createdAt: daysAgo(5, 15), preview: 'Fauna hotspot: Block 456 logged 3 pigeon sightings in 24h. Recommend a site inspection.' },
  { rule: 'Urgent case notification', recipient: 'duty.officer@emservices.com.sg', status: 'sent', createdAt: daysAgo(4, 11), preview: "Urgent case opened at Block 123: 'Cat keeps coming up to L5'. Assigned to the duty officer." },
  { rule: 'Pigeon roost SMS (paused)', recipient: 'cleaning.supervisor@emservices.com.sg', status: 'failed', createdAt: daysAgo(3, 16), preview: 'SMS gateway timeout - message was not delivered. Retry queued.' },
  { rule: 'Fauna hotspot warning', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(2, 13), preview: 'Fauna hotspot: Block 123 logged 5 cat sightings in 24h. Recommend a site inspection.' },
  { rule: 'Critical flora alert', recipient: 'estate.ops@emservices.com.sg', status: 'sent', createdAt: daysAgo(1, 9), preview: 'Flora alert: Heliconia at Block 890 flagged critical during the latest inspection.' },
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
    const open_cases = today.openCases + Math.ceil(d / 3);
    const critical_flora = today.criticalFlora + (d >= 6 ? 1 : 0);
    const at_risk_flora = today.atRiskFlora + (d >= 8 ? 1 : 0);
    const active_hotspots = today.activeHotspots + (d >= 5 ? 1 : 0);
    const total_sightings = today.totalSightings + Math.round(d / 2);
    const risk_score = computeRiskScore({ criticalFlora: critical_flora, activeHotspots: active_hotspots, openCases: open_cases, atRiskFlora: at_risk_flora });
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    snapshots.push({ snapshot_date: dt.toISOString().slice(0, 10), open_cases, critical_flora, at_risk_flora, active_hotspots, total_sightings, risk_score });
  }
  await MetricSnapshot.bulkCreate(snapshots);

  // sanity output so the demo runner can confirm the numbers before presenting
  const since = daysAgo(7, 0);
  const prev = daysAgo(14, 0);
  const { Op } = require('sequelize');
  const last7 = await NotificationLog.count({ where: { createdAt: { [Op.gte]: since } } });
  const prev7 = await NotificationLog.count({ where: { createdAt: { [Op.gte]: prev, [Op.lt]: since } } });
  console.log(`Seeded ${DEMO_USERS.length} demo users, ${createdRules.length} alert rules, ${allLogs.length} notification log entries and ${snapshots.length} days of metric history.`);
  console.log(`Dashboard "Alerts Sent (7d)": ${last7} (prev 7d: ${prev7}, trend ${last7 - prev7 >= 0 ? '+' : ''}${last7 - prev7}).`);
  console.log(`Estate risk index today: ${today.riskScore}/100 (${today.riskStatus}).`);
  console.log(`Login: ${DEMO_USERS.map(u => u.email).join(', ')}  (password: set via DEMO_PASSWORD env var)`);


  await sequelize.close();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
