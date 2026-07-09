process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Mock the rodent AI service so tests never call the real Gemini API.
// This makes the create path deterministic, fast and offline regardless of
// whether a GEMINI_API_KEY is present in the environment.
jest.mock('../../src/services/rodentService', () => ({
  hasApiKey: () => false,
  assessRodentRisk: jest.fn(),
  stubAssessment: (observations) => ({
    risk_level: 'medium',
    likely_cause: 'Test stub assessment',
    signs_identified: ['droppings'],
    immediate_actions: ['Document the location', 'Clear food sources', 'Re-inspect in 48h'],
    escalate_to_contractor: false,
    escalation_reason: null,
    estimated_timeline: 'Within 3 days',
  }),
}));

const request = require('supertest');
const app = require('../../src/index');
const { sequelize } = require('../../src/models');

let adminToken, staffToken, residentToken;

async function registerAndLogin(name, email, role) {
  await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
  adminToken = await registerAndLogin('Admin', 'admin@test.com', 'admin');
  staffToken = await registerAndLogin('Staff', 'staff@test.com', 'staff');
  residentToken = await registerAndLogin('Resident', 'resident@test.com', 'resident');
});

afterAll(async () => {
  await sequelize.close();
});

const observation = {
  block_number: 'Block 234',
  floor_level: 'Community garden',
  observations: 'Found droppings near the compost area and small holes in the soil along the fence line.',
};

describe('POST /api/rodent-assessments (create)', () => {
  test('staff creates an assessment -> 201 with a risk level', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(observation);
    expect(res.status).toBe(201);
    expect(['low', 'medium', 'high', 'critical']).toContain(res.body.risk_level);
  });

  test('the assessment saves the block_number it was given', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(observation);
    expect(res.body.block_number).toBe('Block 234');
  });

  test('with no API key the response is flagged as a stub', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(observation);
    expect(res.body.stubbed).toBe(true);
  });

  test('the assessment includes immediate actions', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(observation);
    expect(Array.isArray(res.body.immediate_actions)).toBe(true);
    expect(res.body.immediate_actions.length).toBeGreaterThan(0);
  });

  test('missing observations -> 400', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ block_number: 'Block 234' });
    expect(res.status).toBe(400);
  });

  test('resident is forbidden -> 403', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${residentToken}`)
      .send(observation);
    expect(res.status).toBe(403);
  });

  test('no token -> 401', async () => {
    const res = await request(app).post('/api/rodent-assessments').send(observation);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/rodent-assessments (history)', () => {
  test('staff can list past assessments -> 200 array', async () => {
    const res = await request(app)
      .get('/api/rodent-assessments')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('resident cannot list -> 403', async () => {
    const res = await request(app)
      .get('/api/rodent-assessments')
      .set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/rodent-assessments/:id (admin only)', () => {
  let assessmentId;
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(observation);
    assessmentId = res.body.id;
  });

  test('staff attempts delete -> 403', async () => {
    const res = await request(app)
      .delete(`/api/rodent-assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  test('admin can delete -> 200', async () => {
    const res = await request(app)
      .delete(`/api/rodent-assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
