// Tests for the Rodent Risk Map feature (Member 4 / Angelyn).
// Mostly pure-function tests (no database, no HTTP - fast and deterministic),
// verifying the severity-weighted map points and, above all, the honesty
// guarantees: unmapped assessments are counted but NEVER placed, positions are
// never invented, and one report is distinguishable from several. A small RBAC
// block then exercises the route.
//
// Field names match the real domain data: rodent uses `block_number`,
// `floor_level`, `risk_level`, `gps_lat`, `gps_lng`, `createdAt`.

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

// Mock the rodent AI service so the create-path tests never call the real Gemini
// API (deterministic, fast, offline regardless of any GEMINI_API_KEY in .env).
jest.mock('../../src/services/rodentService', () => ({
  hasApiKey: () => false,
  assessRodentRisk: jest.fn(),
  stubAssessment: () => ({
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
const { computeRiskMap, RISK_WEIGHTS } = require('../../src/services/rodentRiskMap');

const NOW = new Date('2026-07-23T00:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = n => new Date(NOW - n * DAY).toISOString();

function run(assessments, opts = {}) {
  return computeRiskMap({ assessments, now: NOW, ...opts });
}

// clustered coordinates around one estate (~tens of metres apart)
const C1 = { gps_lat: 1.36910, gps_lng: 103.84540 };
const C2 = { gps_lat: 1.36934, gps_lng: 103.84556 };

describe('exported weights (explainable, not magic)', () => {
  test('weights are low 1, medium 3, high 6, critical 10', () => {
    expect(RISK_WEIGHTS).toEqual({ low: 1, medium: 3, high: 6, critical: 10 });
  });
  test('the result echoes the weights for the UI', () => {
    expect(run([]).weights).toEqual(RISK_WEIGHTS);
  });
});

describe('coverage counts (the map is honest about itself)', () => {
  test('totalAssessments = mapped + unmapped, within the window', () => {
    const assessments = [
      { block_number: 'Block 123', risk_level: 'high', ...C1, createdAt: daysAgo(2) },
      { block_number: 'Block 123', risk_level: 'low', createdAt: daysAgo(3) }, // no coords
      { block_number: 'Block 123', risk_level: 'medium', createdAt: daysAgo(4) }, // no coords
    ];
    const r = run(assessments);
    expect(r.totalAssessments).toBe(3);
    expect(r.mappedCount).toBe(1);
    expect(r.unmappedCount).toBe(2);
    expect(r.mappedCount + r.unmappedCount).toBe(r.totalAssessments);
  });

  test('empty input returns zero coverage and no points', () => {
    const r = run([]);
    expect(r).toMatchObject({ totalAssessments: 0, mappedCount: 0, unmappedCount: 0, points: [], scaleMax: 0 });
  });
});

describe('never invents a position', () => {
  test('assessments without coordinates are excluded from points, counted as unmapped', () => {
    const assessments = [{ block_number: 'Block 5', risk_level: 'critical', createdAt: daysAgo(1) }];
    const r = run(assessments);
    expect(r.points).toEqual([]);
    expect(r.unmappedCount).toBe(1);
  });

  test('explicit null coordinates (the real-DB shape) are unmapped, never placed at (0,0)', () => {
    // regression: Number(null) === 0, which would sit an unmapped report on null
    // island. The ~34 pre-feature rows come back as null, not undefined.
    const assessments = [
      { block_number: 'Block 5', risk_level: 'high', gps_lat: null, gps_lng: null, createdAt: daysAgo(1) },
      { block_number: 'Block 6', risk_level: 'medium', gps_lat: null, gps_lng: null, createdAt: daysAgo(2) },
    ];
    const r = run(assessments);
    expect(r.points).toEqual([]);
    expect(r.mappedCount).toBe(0);
    expect(r.unmappedCount).toBe(2);
  });

  test('a partial coordinate (lat only) is treated as no position', () => {
    const assessments = [{ block_number: 'Block 5', risk_level: 'high', gps_lat: 1.369, createdAt: daysAgo(1) }];
    const r = run(assessments);
    expect(r.points).toEqual([]);
    expect(r.unmappedCount).toBe(1);
  });

  test('out-of-range coordinates are rejected, not clamped to an edge', () => {
    const assessments = [{ block_number: 'Block 5', risk_level: 'high', gps_lat: 999, gps_lng: 999, createdAt: daysAgo(1) }];
    const r = run(assessments);
    expect(r.points).toEqual([]);
    expect(r.unmappedCount).toBe(1);
  });

  test('a mapped point sits at the EXACT reported coordinate', () => {
    const assessments = [{ block_number: 'Block 123', risk_level: 'high', ...C1, createdAt: daysAgo(1) }];
    const p = run(assessments).points[0];
    expect(p.lat).toBe(C1.gps_lat);
    expect(p.lng).toBe(C1.gps_lng);
  });
});

describe('severity weighting and point shape', () => {
  test('weightedScore sums count x band weight; riskLevel is the peak', () => {
    const assessments = [
      { block_number: 'Block 123', risk_level: 'medium', ...C1, createdAt: daysAgo(2) },
      { block_number: 'Block 123', risk_level: 'high', ...C1, createdAt: daysAgo(3) },
    ];
    const p = run(assessments).points[0];
    expect(p.count).toBe(2);
    expect(p.weightedScore).toBe(3 + 6);
    expect(p.riskLevel).toBe('high'); // peak
    expect(p.block).toBe('Block 123');
  });

  test('a point carries the assessments behind it (for click-through), latest first', () => {
    const assessments = [
      { id: 1, block_number: 'Block 123', risk_level: 'low', ...C1, createdAt: daysAgo(9) },
      { id: 2, block_number: 'Block 123', risk_level: 'high', ...C1, createdAt: daysAgo(2) },
    ];
    const p = run(assessments).points[0];
    expect(p.assessments.map(a => a.id)).toEqual([2, 1]); // most recent first
  });
});

describe('aggregation without moving points', () => {
  test('assessments at the SAME exact coordinate collapse to one point', () => {
    const assessments = [
      { block_number: 'Block 123', risk_level: 'high', ...C1, createdAt: daysAgo(2) },
      { block_number: 'Block 123', risk_level: 'high', ...C1, createdAt: daysAgo(3) },
    ];
    const r = run(assessments);
    expect(r.points).toHaveLength(1);
    expect(r.points[0].count).toBe(2);
  });

  test('assessments at DISTINCT coordinates stay separate points', () => {
    const assessments = [
      { block_number: 'Block 123', risk_level: 'high', ...C1, createdAt: daysAgo(2) },
      { block_number: 'Block 123', risk_level: 'high', ...C2, createdAt: daysAgo(3) },
    ];
    expect(run(assessments).points).toHaveLength(2);
  });
});

describe('one report must not read as loudly as several', () => {
  test('same severity, more reports -> higher weightedScore and count', () => {
    const one = run([
      { block_number: 'A', risk_level: 'high', ...C1, createdAt: daysAgo(1) },
    ]).points[0];
    const five = run([
      { block_number: 'B', risk_level: 'high', ...C2, createdAt: daysAgo(1) },
      { block_number: 'B', risk_level: 'high', ...C2, createdAt: daysAgo(2) },
      { block_number: 'B', risk_level: 'high', ...C2, createdAt: daysAgo(3) },
      { block_number: 'B', risk_level: 'high', ...C2, createdAt: daysAgo(4) },
      { block_number: 'B', risk_level: 'high', ...C2, createdAt: daysAgo(5) },
    ]).points[0];
    expect(five.count).toBeGreaterThan(one.count);
    expect(five.weightedScore).toBeGreaterThan(one.weightedScore); // 30 vs 6
  });
});

describe('window and risk filtering', () => {
  test('excludes assessments older than windowDays (from both counts and points)', () => {
    const assessments = [
      { block_number: 'A', risk_level: 'high', ...C1, createdAt: daysAgo(5) },
      { block_number: 'A', risk_level: 'high', ...C2, createdAt: daysAgo(40) },
    ];
    const r = run(assessments);
    expect(r.totalAssessments).toBe(1);
    expect(r.points).toHaveLength(1);
  });

  test('excludes assessments with a null/unknown risk level (cannot be weighted)', () => {
    const assessments = [{ block_number: 'A', risk_level: null, ...C1, createdAt: daysAgo(1) }];
    const r = run(assessments);
    expect(r.totalAssessments).toBe(0);
    expect(r.points).toEqual([]);
  });
});

describe('GET /api/rodent-riskmap (RBAC + contract)', () => {
  let staffToken, residentToken;
  async function registerAndLogin(name, email, role) {
    await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
    return res.body.token;
  }
  beforeAll(async () => {
    await sequelize.sync({ force: true });
    staffToken = await registerAndLogin('Staff', 'rm-staff@test.com', 'staff');
    residentToken = await registerAndLogin('Resident', 'rm-res@test.com', 'resident');
  });
  afterAll(async () => { await sequelize.close(); });

  test('staff gets a well-formed payload even with no data', async () => {
    const res = await request(app).get('/api/rodent-riskmap').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(30);
    expect(res.body.weights).toEqual(RISK_WEIGHTS);
    expect(Array.isArray(res.body.points)).toBe(true);
    expect(res.body).toMatchObject({ totalAssessments: 0, mappedCount: 0, unmappedCount: 0 });
  });

  test('the payload carries a feeding layer alongside the rodent points', async () => {
    const res = await request(app).get('/api/rodent-riskmap').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.feeding).toMatchObject({ total: 0, mappedCount: 0, unmappedCount: 0 });
    expect(Array.isArray(res.body.feeding.points)).toBe(true);
  });

  test('staff can create an assessment WITH coordinates and it is stored', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        block_number: 'Block 123',
        observations: 'Droppings near the bin centre at the void deck, fresh.',
        gps_lat: 1.36910,
        gps_lng: 103.84540,
      });
    expect(res.status).toBe(201);
    expect(res.body.gps_lat).toBeCloseTo(1.36910);
    expect(res.body.gps_lng).toBeCloseTo(103.84540);
  });

  test('an assessment filed WITHOUT coordinates stores null (filing must still work)', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ block_number: 'Block 999', observations: 'Gnaw marks on a bin lid, no signal in the stairwell.' });
    expect(res.status).toBe(201);
    expect(res.body.gps_lat).toBeNull();
    expect(res.body.gps_lng).toBeNull();
  });

  test('an out-of-range coordinate is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/rodent-assessments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ block_number: 'Block 1', observations: 'Droppings along the corridor near the chute.', gps_lat: 999, gps_lng: 10 });
    expect(res.status).toBe(400);
  });

  test('resident is forbidden -> 403', async () => {
    const res = await request(app).get('/api/rodent-riskmap').set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/rodent-riskmap');
    expect(res.status).toBe(401);
  });
});
