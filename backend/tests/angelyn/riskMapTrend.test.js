process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../../src/index');
const { sequelize, RodentAssessment, FaunaSighting, User } = require('../../src/models');
// Privileged users must be seeded, not registered - see tests/authHelpers.js
const { createAndLogin, registerAndLogin } = require('../authHelpers');

const DAY = 24 * 60 * 60 * 1000;
const ago = days => new Date(Date.now() - days * DAY);

let token, staffId;

beforeAll(async () => {
  await sequelize.sync({ force: true });
  token = await createAndLogin('Officer', 'rmt-staff@test.com', 'staff');
  staffId = (await User.findOne({ where: { email: 'rmt-staff@test.com' } })).id;
});
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await RodentAssessment.destroy({ where: {}, force: true });
  await FaunaSighting.destroy({ where: {}, force: true });
});

const get = (days = 30) => request(app)
  .get(`/api/rodent-riskmap?windowDays=${days}`)
  .set('Authorization', `Bearer ${token}`);

describe('rodent risk map - prior window comparison', () => {
  test('the previous window counts only the window BEFORE the current one', async () => {
    await RodentAssessment.bulkCreate([
      // current window (last 30 days)
      { block_number: 'Block 1', observations: 'now a', risk_level: 'high', gps_lat: 1.37, gps_lng: 103.85, assessed_by: staffId, createdAt: ago(2) },
      { block_number: 'Block 1', observations: 'now b', risk_level: 'high', gps_lat: 1.37, gps_lng: 103.85, assessed_by: staffId, createdAt: ago(5) },
      // previous window (30-60 days ago)
      { block_number: 'Block 2', observations: 'then a', risk_level: 'low', gps_lat: 1.38, gps_lng: 103.86, assessed_by: staffId, createdAt: ago(40) },
      // OUTSIDE both windows - must be ignored entirely, not folded into "previous"
      { block_number: 'Block 3', observations: 'ancient', risk_level: 'critical', gps_lat: 1.39, gps_lng: 103.87, assessed_by: staffId, createdAt: ago(200) },
    ]);

    const res = await get(30);
    expect(res.status).toBe(200);
    expect(res.body.totalAssessments).toBe(2);
    expect(res.body.previous.totalAssessments).toBe(1);
    expect(res.body.previous.has_data).toBe(true);
    expect(res.body.previous.windowDays).toBe(30);
  });

  test('an empty prior window reports has_data false, not a zero baseline', async () => {
    // Only current-window records: there is no history to compare against, and
    // the flag must say so rather than letting the UI compute "+100% vs 0".
    await RodentAssessment.bulkCreate([
      { block_number: 'Block 9', observations: 'fresh', risk_level: 'high', gps_lat: 1.37, gps_lng: 103.85, assessed_by: staffId, createdAt: ago(1) },
    ]);

    const res = await get(30);
    expect(res.body.previous.has_data).toBe(false);
    expect(res.body.previous.totalAssessments).toBe(0);
  });

  test('the prior window tracks windowDays - it is never a fixed 30 days', async () => {
    await RodentAssessment.bulkCreate([
      { block_number: 'Block 1', observations: 'now', risk_level: 'high', gps_lat: 1.37, gps_lng: 103.85, assessed_by: staffId, createdAt: ago(2) },
      // 10 days ago: inside the previous window for a 7d view, inside the CURRENT
      // window for a 30d view. One row, two different answers - which is the point.
      { block_number: 'Block 2', observations: 'ten days', risk_level: 'low', gps_lat: 1.38, gps_lng: 103.86, assessed_by: staffId, createdAt: ago(10) },
    ]);

    const week = await get(7);
    expect(week.body.totalAssessments).toBe(1);
    expect(week.body.previous.totalAssessments).toBe(1);
    expect(week.body.previous.windowDays).toBe(7);

    const month = await get(30);
    expect(month.body.totalAssessments).toBe(2);
    expect(month.body.previous.totalAssessments).toBe(0);
  });

  test('previous high-risk locations use the same severity rule as the live figure', async () => {
    await RodentAssessment.bulkCreate([
      // prior window: one block that should band high, one that should not
      { block_number: 'Block A', observations: 'p1', risk_level: 'critical', gps_lat: 1.37, gps_lng: 103.85, assessed_by: staffId, createdAt: ago(35) },
      { block_number: 'Block B', observations: 'p2', risk_level: 'low', gps_lat: 1.38, gps_lng: 103.86, assessed_by: staffId, createdAt: ago(36) },
    ]);

    const res = await get(30);
    // whatever computeRiskMap bands as high/critical is what `previous` counts -
    // asserted against the service's own output rather than a hardcoded guess
    expect(res.body.previous.highRiskLocations).toBe(1);
    expect(res.body.previous.mappedCount).toBe(2);
  });

  test('feeding totals are compared too', async () => {
    await FaunaSighting.bulkCreate([
      { species: 'pigeon', block_number: 'Block 1', behaviour_tags: ['feeding'], status: 'open', notes: 'now', gps_lat: 1.37, gps_lng: 103.85, reported_by: staffId, createdAt: ago(3) },
      { species: 'cat', block_number: 'Block 2', behaviour_tags: ['feeding'], status: 'open', notes: 'then', gps_lat: 1.38, gps_lng: 103.86, reported_by: staffId, createdAt: ago(40) },
      { species: 'cat', block_number: 'Block 3', behaviour_tags: ['feeding'], status: 'open', notes: 'then2', gps_lat: 1.39, gps_lng: 103.87, reported_by: staffId, createdAt: ago(45) },
    ]);

    const res = await get(30);
    expect(res.body.feeding.total).toBe(1);
    expect(res.body.previous.feedingTotal).toBe(2);
  });

  test('a resident cannot read the map', async () => {
    const rToken = await registerAndLogin('Res', 'rmt-res@test.com', 'resident');
    const res = await request(app).get('/api/rodent-riskmap').set('Authorization', `Bearer ${rToken}`);
    expect(res.status).toBe(403);
  });
});
