// Use an isolated in-memory SQLite DB so tests never touch the dev database.
// These must be set BEFORE requiring the app (config/database.js reads them at load).
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../../src/index');
const { sequelize, CaseStatusLog } = require('../../src/models');

const tokens = {};
let reportId;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  const accounts = [
    ['res1', 'resident'],
    ['res2', 'resident'],
    ['staff', 'staff'],
    ['admin', 'admin'],
  ];
  for (const [key, role] of accounts) {
    await request(app)
      .post('/api/auth/register')
      .send({ name: key, email: `${key}@example.com`, password: 'secret1', role });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `${key}@example.com`, password: 'secret1' });
    tokens[key] = `Bearer ${res.body.token}`;
  }
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/reports', () => {
  test('resident creates report -> 201, reported_by from token (body spoof ignored)', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', tokens.res1)
      .send({
        category: 'pigeon',
        title: 'Pigeons nesting',
        description: 'Corridor ledge',
        reported_by: 999,
      });

    expect(res.status).toBe(201);
    expect(res.body.reported_by).toBe(1);
    reportId = res.body.id;
  });

  test('invalid category -> 400', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', tokens.res1)
      .send({ category: 'bogus', title: 'x', description: 'y' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/reports', () => {
  beforeAll(async () => {
    // second resident's report, so list scoping is observable
    await request(app)
      .post('/api/reports')
      .set('Authorization', tokens.res2)
      .send({ category: 'pest', title: 'Ants', description: 'Void deck' });
  });

  test('resident sees only own reports', async () => {
    const res = await request(app).get('/api/reports').set('Authorization', tokens.res1);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].reported_by).toBe(1);
  });

  test('staff sees all reports', async () => {
    const res = await request(app).get('/api/reports').set('Authorization', tokens.staff);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test("resident viewing another resident's report -> 403", async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}`)
      .set('Authorization', tokens.res2);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/reports/:id/status', () => {
  test('resident -> 403', async () => {
    const res = await request(app)
      .patch(`/api/reports/${reportId}/status`)
      .set('Authorization', tokens.res1)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(403);
  });

  test('staff -> 200 and creates exactly one CaseStatusLog', async () => {
    const res = await request(app)
      .patch(`/api/reports/${reportId}/status`)
      .set('Authorization', tokens.staff)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');

    const logs = await CaseStatusLog.findAll({ where: { report_id: reportId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].old_status).toBe('open');
    expect(logs[0].new_status).toBe('in_progress');
  });
});

describe('DELETE /api/reports/:id', () => {
  test('staff -> 403', async () => {
    const res = await request(app)
      .delete(`/api/reports/${reportId}`)
      .set('Authorization', tokens.staff);

    expect(res.status).toBe(403);
  });

  test('admin -> 200, then GET on deleted report -> 404', async () => {
    const del = await request(app)
      .delete(`/api/reports/${reportId}`)
      .set('Authorization', tokens.admin);
    expect(del.status).toBe(200);

    const get = await request(app)
      .get(`/api/reports/${reportId}`)
      .set('Authorization', tokens.admin);
    expect(get.status).toBe(404);
  });
});
