process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

/**
 * THE GUARD.
 *
 * Simulated RATSENSE readings exist so the regional map has a continuous field
 * to interpolate. They must never influence a computed metric - not the risk
 * index, not the prevention rate, not the feeding/rodent correlation, not the
 * risk map, not a KPI on any page.
 *
 * This suite proves it two ways:
 *   1. STATICALLY - no service that computes a real metric even mentions
 *      SensorReading. A leak would have to be written in source first.
 *   2. BEHAVIOURALLY - every metric endpoint returns byte-identical output with
 *      an empty SensorReadings table and with it full of extreme readings.
 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../src/index');
const { sequelize, SensorReading, RodentAssessment, FaunaSighting, User } = require('../../src/models');

const SRC = path.join(__dirname, '../../src');

let adminToken;
async function registerAndLogin(name, email, role) {
  await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}

// Extreme values: if any metric were reading this table, these would visibly
// move it. Positioned on top of the real assessments so proximity cannot be an
// excuse either.
const LOUD_READINGS = Array.from({ length: 60 }, (_, i) => ({
  sensor_id: `LOUD-${i % 6}`,
  lat: 1.36780,
  lng: 103.84660,
  location_type: 'refuse_chute',
  town_council: 'Ang Mo Kio Town Council',
  activity_level: 9999,
  recorded_at: new Date(Date.now() - (i % 20) * 86400000),
  is_simulated: true,
}));

const METRIC_ENDPOINTS = [
  '/api/dashboard/metrics',
  '/api/scorecard',
  '/api/block-diagnosis',
  '/api/rodent-riskmap',
];

// Several metrics derive week/window boundaries from Date.now() at request time,
// so two calls milliseconds apart legitimately differ in their timestamps. That
// is a clock artifact, not a data difference. Normalising every ISO timestamp to
// a fixed token keeps the comparison about the DATA - which is what the guard is
// actually asserting.
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
const normaliseClock = v => JSON.parse(JSON.stringify(v).replace(ISO, '<timestamp>'));

async function snapshotMetrics(token) {
  const out = {};
  for (const url of METRIC_ENDPOINTS) {
    const res = await request(app).get(url).set('Authorization', `Bearer ${token}`);
    out[url] = { status: res.status, body: normaliseClock(res.body) };
  }
  return out;
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
  adminToken = await registerAndLogin('Admin', 'sim-admin@test.com', 'admin');
  const admin = await User.findOne({ where: { email: 'sim-admin@test.com' } });

  // a little real data so the metrics are not all trivially empty
  await RodentAssessment.bulkCreate([
    { block_number: 'Block 128', observations: 'Droppings by the chute', risk_level: 'high', gps_lat: 1.36780, gps_lng: 103.84660, escalate_to_contractor: true, assessed_by: admin.id },
    { block_number: 'Block 123', observations: 'Live sighting at the bin centre', risk_level: 'critical', gps_lat: 1.36925, gps_lng: 103.84521, escalate_to_contractor: true, assessed_by: admin.id },
    { block_number: 'Block 123', observations: 'Filed without a position', risk_level: 'medium', escalate_to_contractor: false, assessed_by: admin.id },
  ]);
  await FaunaSighting.bulkCreate([
    { species: 'cat', block_number: '123', behaviour_tags: ['feeding'], status: 'open', gps_lat: 1.36912, gps_lng: 103.84545, notes: 'Food bowls at the void deck', reported_by: admin.id },
  ]);
});
afterAll(async () => { await sequelize.close(); });

describe('static: no real-metric service reads SensorReading', () => {
  // Every service that computes a metric a human acts on. If a future change
  // wires simulated readings into one of these, this test fails at review time.
  const GUARDED = [
    'services/estateStats.js',
    'services/preventionScorecard.js',
    'services/blockDiagnosis.js',
    'services/rodentRiskMap.js',
    'services/feedingPoints.js',
    'services/metricsSnapshot.js',
    'services/weeklySummary.js',
    'routes/dashboard.js',
    'routes/scorecard.js',
    'routes/blockDiagnosis.js',
    'routes/rodentRiskMap.js',
  ];

  test.each(GUARDED)('%s does not reference SensorReading', file => {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    expect(src).not.toMatch(/SensorReading/);
    expect(src).not.toMatch(/sensor_reading|SensorReadings/i);
  });

  test('only the sensor surface service and its route may read it', () => {
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : (e.name.endsWith('.js') ? [p] : []);
    });
    const readers = walk(SRC)
      .filter(f => /SensorReading/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(SRC, f))
      .sort();
    // The simulated layer's own model, its service, its route, the model
    // registry, and the two scripts that WRITE the rows (seed.js and testData.js).
    // Anything else appearing here is a leak.
    //
    // A writer is not a leak: the risk this test exists to catch is a simulated
    // reading being counted as a real measurement, which only happens on the READ
    // side. Both scripts set is_simulated: true, and routes/sensorSurface.js pins
    // that flag in its WHERE clause - so what they insert is reachable from exactly
    // one endpoint, which labels itself as modelled. The guarded list above is what
    // holds the read side honest.
    expect(readers).toEqual([
      'models/SensorReading.js',
      'models/index.js',
      'routes/sensorSurface.js',
      'services/sensorSurface.js',
      'seed.js',
      'testData.js',
    ].sort());
  });
});

describe('behavioural: simulated readings do not move any metric', () => {
  test('every metric endpoint is identical with and without simulated readings', async () => {
    expect(await SensorReading.count()).toBe(0);
    const before = await snapshotMetrics(adminToken);

    await SensorReading.bulkCreate(LOUD_READINGS);
    expect(await SensorReading.count()).toBe(LOUD_READINGS.length);

    const after = await snapshotMetrics(adminToken);
    expect(after).toEqual(before);
  });

  test('the risk index specifically is untouched', async () => {
    const res = await request(app).get('/api/dashboard/metrics').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // present, numeric, and not inflated by 60 readings of 9999
    expect(typeof res.body.riskScore).toBe('number');
    expect(res.body.riskScore).toBeLessThanOrEqual(100);
  });

  test('the risk map still counts only reported positions, ignoring 6 co-located sensors', async () => {
    const res = await request(app).get('/api/rodent-riskmap').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalAssessments).toBe(3);
    expect(res.body.mappedCount).toBe(2);
    expect(res.body.unmappedCount).toBe(1);   // stays counted, never placed
    expect(res.body.points).toHaveLength(2);  // not 2 + sensors
  });
});

describe('the simulated layer labels itself at the API boundary', () => {
  test('the surface endpoint declares is_simulated and a plain-language disclosure', async () => {
    const res = await request(app).get('/api/sensor-surface').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.is_simulated).toBe(true);
    expect(res.body.disclosure).toBe('Simulated sensor data (pilot integration not yet live)');
    expect(res.body.boundaries_approximate).toBe(true);
    expect(res.body.asOf).toBeTruthy();
  });

  test('a resident cannot read the sensor surface', async () => {
    const residentToken = await registerAndLogin('Res', 'sim-res@test.com', 'resident');
    const res = await request(app).get('/api/sensor-surface').set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });
});
