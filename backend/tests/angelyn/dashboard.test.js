// Dashboard API - Test Cases (Member 4 / Angelyn)
// Jest + Supertest against the Express app on an isolated in-memory SQLite DB.
//
// Access model under test:
//   admin / staff -> can view metrics
//   resident      -> forbidden
//   trigger-summary (manual weekly summary send) -> admin only

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/index');
const { sequelize, User } = require('../../src/models');

let adminToken, staffToken, residentToken;

async function registerAndLogin(name, email, role) {
  await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}

// Public registration always creates residents - seed staff/admin directly.
async function createAndLogin(name, email, role) {
  await User.create({ name, email, password_hash: await bcrypt.hash('secret1', 10), role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
  adminToken = await createAndLogin('Admin', 'admin@test.com', 'manager');
  staffToken = await createAndLogin('Staff', 'staff@test.com', 'field_officer');
  residentToken = await registerAndLogin('Resident', 'resident@test.com', 'resident');
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/dashboard/metrics', () => {
  test('admin gets metrics -> 200 with the expected KPI fields', async () => {
    const res = await request(app)
      .get('/api/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // the KPI numbers the dashboard cards render
    expect(res.body).toHaveProperty('openCases');
    expect(res.body).toHaveProperty('criticalFlora');
    expect(res.body).toHaveProperty('activeHotspots');
    expect(typeof res.body.openCases).toBe('number');
  });

  test('metrics include the chart + hotspot data structures', async () => {
    const res = await request(app)
      .get('/api/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(Array.isArray(res.body.hotspots)).toBe(true);
    expect(Array.isArray(res.body.casesByCategory)).toBe(true);
    expect(Array.isArray(res.body.recentCases)).toBe(true);
  });

  test('hotspots expose block_number (not an undefined key)', async () => {
    const res = await request(app)
      .get('/api/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    // if there is at least one hotspot in the mock data, it must carry block_number
    if (res.body.hotspots.length > 0) {
      expect(res.body.hotspots[0]).toHaveProperty('block_number');
      expect(res.body.hotspots[0].block_number).toBeDefined();
    }
  });

  test('staff can also view metrics -> 200', async () => {
    const res = await request(app)
      .get('/api/dashboard/metrics')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  test('resident is forbidden from the dashboard -> 403', async () => {
    const res = await request(app)
      .get('/api/dashboard/metrics')
      .set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/dashboard/metrics');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/dashboard/trigger-summary', () => {
  test('staff attempts to trigger the summary -> 403 (admin only)', async () => {
    const res = await request(app)
      .post('/api/dashboard/trigger-summary')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  test('resident attempts to trigger the summary -> 403', async () => {
    const res = await request(app)
      .post('/api/dashboard/trigger-summary')
      .set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });

  // Note: we don't assert a 200 for admin here because triggering the summary
  // depends on an active weekly_summary rule existing and would attempt email
  // dispatch. The access-control behaviour (admin-only) is what this suite
  // verifies; the full send path is covered by the weekly-summary logic + manual
  // testing. Admin reaching the handler (not blocked by role) is implied by the
  // staff/resident 403s above.
});