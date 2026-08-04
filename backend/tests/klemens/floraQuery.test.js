// Mock the AI query service so no real Gemini call is ever made - we only
// assert the controller's validation, RBAC, and response shape.
jest.mock('../../src/services/floraQueryService', () => ({
  queryCatalog: jest.fn(),
  hasApiKey: jest.fn(),
}));

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../../src/index');
const { sequelize, User } = require('../../src/models');
const bcrypt = require('bcryptjs');
const { queryCatalog, hasApiKey } = require('../../src/services/floraQueryService');

let staffToken;
let residentToken;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Resident', email: 'resident@example.com', password: 'secret1' });
  // staff/admin accounts are seeded directly - public registration
  // only ever creates residents
  await User.create({
    name: 'Staff',
    email: 'staff@example.com',
    password_hash: await bcrypt.hash('secret1', 10),
    role: 'field_officer',
  });

  const residentLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'resident@example.com', password: 'secret1' });
  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'staff@example.com', password: 'secret1' });
  residentToken = `Bearer ${residentLogin.body.token}`;
  staffToken = `Bearer ${staffLogin.body.token}`;
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(() => {
  queryCatalog.mockReset();
  hasApiKey.mockReset();
  hasApiKey.mockReturnValue(true);
  queryCatalog.mockResolvedValue({ answer: 'Two plants are at risk.', plantCount: 5 });
});

describe('AI catalog query (POST /api/flora/query)', () => {
  test('staff asks a valid question -> 200 with { question, answer, plantCount }', async () => {
    const res = await request(app)
      .post('/api/flora/query')
      .set('Authorization', staffToken)
      .send({ question: '  Which plants are at risk?  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      question: 'Which plants are at risk?',
      answer: 'Two plants are at risk.',
      plantCount: 5,
    });
    expect(queryCatalog).toHaveBeenCalledTimes(1);
    expect(queryCatalog).toHaveBeenCalledWith('Which plants are at risk?');
  });

  test('missing question -> 400', async () => {
    const res = await request(app)
      .post('/api/flora/query')
      .set('Authorization', staffToken)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('question is required');
    expect(queryCatalog).not.toHaveBeenCalled();
  });

  test('whitespace-only question -> 400', async () => {
    const res = await request(app)
      .post('/api/flora/query')
      .set('Authorization', staffToken)
      .send({ question: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('question is required');
    expect(queryCatalog).not.toHaveBeenCalled();
  });

  test('question over 500 characters -> 400', async () => {
    const res = await request(app)
      .post('/api/flora/query')
      .set('Authorization', staffToken)
      .send({ question: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('question must be 500 characters or fewer');
    expect(queryCatalog).not.toHaveBeenCalled();
  });

  test('resident attempts a query -> 403 (restrictTo staff/admin)', async () => {
    const res = await request(app)
      .post('/api/flora/query')
      .set('Authorization', residentToken)
      .send({ question: 'Which plants are at risk?' });

    expect(res.status).toBe(403);
    expect(queryCatalog).not.toHaveBeenCalled();
  });

  test('no auth token -> 401', async () => {
    const res = await request(app)
      .post('/api/flora/query')
      .send({ question: 'Which plants are at risk?' });

    expect(res.status).toBe(401);
    expect(queryCatalog).not.toHaveBeenCalled();
  });

  test('missing GEMINI_API_KEY -> 503', async () => {
    hasApiKey.mockReturnValue(false);

    const res = await request(app)
      .post('/api/flora/query')
      .set('Authorization', staffToken)
      .send({ question: 'Which plants are at risk?' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI service not configured');
    expect(queryCatalog).not.toHaveBeenCalled();
  });
});
