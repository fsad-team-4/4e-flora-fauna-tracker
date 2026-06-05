// Use an isolated in-memory SQLite DB so tests never touch the dev database.
// These must be set BEFORE requiring the app (config/database.js reads them at load).
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../../src/index');
const { sequelize } = require('../../src/models');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/auth/register', () => {
  test('valid data -> 201 with user fields and no password_hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Klemens', email: 'klemens@example.com', password: 'secret1' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Klemens',
      email: 'klemens@example.com',
      role: 'resident',
    });
    expect(res.body.user_id).toBeDefined();
    expect(res.body.password_hash).toBeUndefined();
  });

  test('duplicate email -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Klemens', email: 'klemens@example.com', password: 'secret1' });

    expect(res.status).toBe(400);
  });

  test('invalid input (bad email, short password) -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'not-an-email', password: '12' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('correct credentials -> 200 with a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'klemens@example.com', password: 'secret1' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  test('wrong password -> 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'klemens@example.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });
});
