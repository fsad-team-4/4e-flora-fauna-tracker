// Alert Rules API - Test Cases (Member 4 / Angelyn)
// Tested with Jest + Supertest against the Express app, using an isolated
// in-memory SQLite database so the dev database is never touched.
//
// Access model under test:
//   admin  -> full CRUD
//   staff  -> read only (list/get); writes forbidden
//   resident -> no access at all

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/index');
const { sequelize, User } = require('../../src/models');

// tokens for the three roles, obtained by registering + logging in real users
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
  adminToken = await createAndLogin('Admin', 'admin@test.com', 'admin');
  staffToken = await createAndLogin('Staff', 'staff@test.com', 'staff');
  residentToken = await registerAndLogin('Resident', 'resident@test.com', 'resident');
});

afterAll(async () => {
  await sequelize.close();
});

const validRule = {
  name: 'Critical Flora Alert',
  trigger_type: 'flora_critical',
  threshold: 1,
  recipients: 'ops@estate.sg',
  channel: 'email',
};

describe('POST /api/alert-rules (create)', () => {
  test('admin creates a valid rule -> 201', async () => {
    const res = await request(app)
      .post('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validRule);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Critical Flora Alert');
    expect(res.body.id).toBeDefined();
  });

  test('staff attempts create -> 403 (read-only)', async () => {
    const res = await request(app)
      .post('/api/alert-rules')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(validRule);
    expect(res.status).toBe(403);
  });

  test('resident attempts create -> 403', async () => {
    const res = await request(app)
      .post('/api/alert-rules')
      .set('Authorization', `Bearer ${residentToken}`)
      .send(validRule);
    expect(res.status).toBe(403);
  });

  test('no token -> 401', async () => {
    const res = await request(app).post('/api/alert-rules').send(validRule);
    expect(res.status).toBe(401);
  });

  test('missing required fields -> 400', async () => {
    const res = await request(app)
      .post('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ trigger_type: 'flora_critical' }); // no name, no recipients
    expect(res.status).toBe(400);
  });

  test('invalid trigger_type -> 400', async () => {
    const res = await request(app)
      .post('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validRule, trigger_type: 'made_up' });
    expect(res.status).toBe(400);
  });

  test('malformed recipient email -> 400', async () => {
    const res = await request(app)
      .post('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validRule, recipients: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/alert-rules (list)', () => {
  test('admin can list rules -> 200 array', async () => {
    const res = await request(app)
      .get('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('staff can also list rules -> 200 (read access)', async () => {
    const res = await request(app)
      .get('/api/alert-rules')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  test('resident cannot list rules -> 403', async () => {
    const res = await request(app)
      .get('/api/alert-rules')
      .set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/alert-rules/:id (update)', () => {
  let ruleId;
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validRule, name: 'To Be Updated' });
    ruleId = res.body.id;
  });

  test('admin can toggle is_active -> 200', async () => {
    const res = await request(app)
      .patch(`/api/alert-rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });

  test('staff attempts update -> 403', async () => {
    const res = await request(app)
      .patch(`/api/alert-rules/${ruleId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ is_active: true });
    expect(res.status).toBe(403);
  });

  test('updating a non-existent rule -> 404', async () => {
    const res = await request(app)
      .patch('/api/alert-rules/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: true });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/alert-rules/:id (soft delete)', () => {
  let ruleId;
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validRule, name: 'To Be Deleted' });
    ruleId = res.body.id;
  });

  test('staff attempts delete -> 403', async () => {
    const res = await request(app)
      .delete(`/api/alert-rules/${ruleId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  test('admin deletes -> 200, then it no longer appears in the list', async () => {
    const del = await request(app)
      .delete(`/api/alert-rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.find(r => r.id === ruleId)).toBeUndefined();
  });
});