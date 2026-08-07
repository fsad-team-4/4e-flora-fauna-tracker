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
  queryCatalog.mockResolvedValue({
    answer: 'Two plants are at risk.',
    plantCount: 5,
    referencedPlants: [{ id: 3, species: 'Ficus benjamina', common_name: 'Weeping Fig' }],
  });
});

describe('AI catalog query (POST /api/flora/query)', () => {
  test('staff asks a valid question -> 200 with { question, answer, plantCount, referencedPlants }', async () => {
    const res = await request(app)
      .post('/api/flora/query')
      .set('Authorization', staffToken)
      .send({ question: '  Which plants are at risk?  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      question: 'Which plants are at risk?',
      answer: 'Two plants are at risk.',
      plantCount: 5,
      referencedPlants: [{ id: 3, species: 'Ficus benjamina', common_name: 'Weeping Fig' }],
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

  // The raw SDK message ("429 RESOURCE_EXHAUSTED: ...") means nothing to staff,
  // so the controller maps failures onto actionable messages and logs the cause.
  describe('AI failures', () => {
    let consoleError;

    beforeEach(() => {
      // keep the controller's console.error out of the test output
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    const ask = () =>
      request(app)
        .post('/api/flora/query')
        .set('Authorization', staffToken)
        .send({ question: 'Which plants are at risk?' });

    test('rate limited (status 429) -> 429 busy message, original error logged', async () => {
      const err = new Error('429 RESOURCE_EXHAUSTED: quota exceeded for gemini-3.5-flash');
      err.status = 429;
      queryCatalog.mockRejectedValue(err);

      const res = await ask();

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('The AI service is busy right now. Please try again in a moment.');
      expect(consoleError).toHaveBeenCalled();
    });

    test('quota mentioned in the message with no status -> 429', async () => {
      queryCatalog.mockRejectedValue(new Error('You exceeded your current quota'));

      const res = await ask();

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('The AI service is busy right now. Please try again in a moment.');
    });

    test('model overloaded (status 503) -> 503, not the not-configured message', async () => {
      const err = new Error('The model is overloaded. Please try again later.');
      err.status = 503;
      queryCatalog.mockRejectedValue(err);

      const res = await ask();

      expect(res.status).toBe(503);
      expect(res.body.error).toBe(
        'The AI service is temporarily overloaded. Please try again in a moment.'
      );
      expect(res.body.error).not.toBe('AI service not configured');
    });

    test('unknown failure -> 502 generic message, raw SDK message not leaked', async () => {
      queryCatalog.mockRejectedValue(new Error('socket hang up on generativelanguage.googleapis.com'));

      const res = await ask();

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('Could not get an answer from the AI service. Please try again.');
      expect(res.body.error).not.toContain('socket hang up');
    });
  });
});
