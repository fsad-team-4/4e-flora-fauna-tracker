// Own-profile endpoints: GET /me, PATCH /me, POST /change-password.
// Isolated in-memory SQLite so tests never touch the dev database.
// These must be set BEFORE requiring the app (config/database.js reads them at load).
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/index');
const { sequelize, User } = require('../../src/models');

const CREDS = { name: 'Profile Tester', email: 'profile@example.com', password: 'secret1' };
let token;

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await request(app).post('/api/auth/register').send(CREDS);
  token = await login(CREDS.email, CREDS.password);
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/auth/me', () => {
  test('returns the caller profile without the password hash', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: CREDS.name, email: CREDS.email, role: 'resident' });
    expect(res.body.user_id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.password_hash).toBeUndefined();
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/auth/me', () => {
  test('updates the name and re-issues a token carrying it', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Tester' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Tester');
    // the JWT embeds `name`, so a stale token would leave the nav bar wrong
    expect(res.body.token).toBeDefined();
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(payload.name).toBe('Renamed Tester');

    token = res.body.token;
  });

  test('rejects an email already taken by another user', async () => {
    await request(app).post('/api/auth/register')
      .send({ name: 'Other', email: 'taken@example.com', password: 'secret1' });

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'taken@example.com' });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/already registered/i);
  });

  test('rejects a malformed email', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  test('empty body -> 400 rather than a silent no-op', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('cannot escalate own role', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Still Resident', role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('resident');
    const row = await User.findOne({ where: { email: CREDS.email } });
    expect(row.role).toBe('resident');
    token = res.body.token;
  });
});

describe('POST /api/auth/change-password', () => {
  test('wrong current password -> 401 and the old password still works', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'wrongpass', new_password: 'newsecret1' });

    expect(res.status).toBe(401);
    expect(await login(CREDS.email, CREDS.password)).toBeDefined();
  });

  test('new password shorter than 6 chars -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: CREDS.password, new_password: 'abc' });

    expect(res.status).toBe(400);
  });

  test('reusing the current password -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: CREDS.password, new_password: CREDS.password });

    expect(res.status).toBe(400);
  });

  test('correct current password -> 200, and only the new one logs in', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: CREDS.password, new_password: 'newsecret1' });

    expect(res.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login')
      .send({ email: CREDS.email, password: CREDS.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login')
      .send({ email: CREDS.email, password: 'newsecret1' });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.token).toBeDefined();
  });

  test('no token -> 401', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ current_password: 'x', new_password: 'yyyyyy' });
    expect(res.status).toBe(401);
  });
});
