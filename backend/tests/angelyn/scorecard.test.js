process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../../src/index');
const { sequelize } = require('../../src/models');
const { computeScorecard } = require('../../src/services/preventionScorecard');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-20T00:00:00Z').getTime();
const daysAgo = n => new Date(NOW - n * DAY).toISOString();

// A crafted history:
//  Block A - 3 reports then a work order 30d ago, no reports after  -> prevented
//  Block B - 2 reports then a work order 25d ago, 1 report after     -> recurred
//  Block C - 1 report then a work order 3d ago                       -> monitoring (too recent)
const assessments = [
  { id: 1, block_number: 'Block A', createdAt: daysAgo(32), is_deleted: false },
  { id: 2, block_number: 'Block A', createdAt: daysAgo(31), is_deleted: false },
  { id: 3, block_number: 'Block A', createdAt: daysAgo(30), is_deleted: false },
  { id: 4, block_number: 'Block B', createdAt: daysAgo(27), is_deleted: false },
  { id: 5, block_number: 'Block B', createdAt: daysAgo(26), is_deleted: false },
  { id: 6, block_number: 'Block B', createdAt: daysAgo(20), is_deleted: false }, // recurrence (within 14d after T_B=25d)
  { id: 7, block_number: 'Block C', createdAt: daysAgo(4), is_deleted: false },
];
const workOrders = [
  { id: 10, block_number: 'Block A', createdAt: daysAgo(30), status: 'closed', closed_at: daysAgo(26), consolidated_count: 3, is_deleted: false },
  { id: 11, block_number: 'Block B', createdAt: daysAgo(25), status: 'open', closed_at: null, consolidated_count: 2, is_deleted: false },
  { id: 12, block_number: 'Block C', createdAt: daysAgo(3), status: 'open', closed_at: null, consolidated_count: 1, is_deleted: false },
];

describe('computeScorecard (pure)', () => {
  const sc = computeScorecard({ assessments, workOrders, now: NOW, windowDays: 14, trendWeeks: 8 });
  const s = sc.summary;

  test('classifies each intervention by recurrence outcome', () => {
    expect(s.measured).toBe(2);      // A and B matured; C still monitoring
    expect(s.prevented).toBe(1);     // A
    expect(s.recurred).toBe(1);      // B
    expect(s.monitoring).toBe(1);    // C
  });

  test('repeat-risk reduction is volume-based (before -> after)', () => {
    // before: A=3, B=2 => 5 ; after: A=0, B=1 => 1 ; reduction = (5-1)/5 = 0.8
    expect(s.total_before).toBe(5);
    expect(s.total_after).toBe(1);
    expect(s.repeat_risk_reduction).toBeCloseTo(0.8, 5);
    expect(s.prevention_rate).toBeCloseTo(0.5, 5); // 1 of 2 measured prevented
  });

  test('operational metrics: time to close, completion, consolidation savings', () => {
    expect(s.avg_time_to_close_days).toBe(4);      // only A closed, 30d -> 26d
    expect(s.impact_completion).toBeCloseTo(1 / 3, 5); // 1 of 3 work orders closed
    expect(s.call_outs_avoided).toBe(2 + 1 + 0);   // (3-1)+(2-1)+(1-1)
    expect(s.est_savings).toBe(3 * sc.params.calloutCost);
  });

  test('trend has one bucket per week, oldest first', () => {
    expect(sc.trend).toHaveLength(8);
    const t = sc.trend.map(w => new Date(w.weekStart).getTime());
    expect(t[0]).toBeLessThan(t[t.length - 1]);
  });

  test('empty input yields null rates, not fabricated zeros', () => {
    const empty = computeScorecard({ assessments: [], workOrders: [], now: NOW });
    expect(empty.summary.repeat_risk_reduction).toBeNull();
    expect(empty.summary.prevention_rate).toBeNull();
    expect(empty.summary.impact_completion).toBeNull();
    expect(empty.summary.measured).toBe(0);
  });
});

describe('GET /api/scorecard (RBAC)', () => {
  let staffToken, residentToken;
  async function registerAndLogin(name, email, role) {
    await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
    return res.body.token;
  }
  beforeAll(async () => {
    await sequelize.sync({ force: true });
    staffToken = await registerAndLogin('Staff', 'sc-staff@test.com', 'field_officer');
    residentToken = await registerAndLogin('Resident', 'sc-res@test.com', 'resident');
  });
  afterAll(async () => { await sequelize.close(); });

  test('staff gets a well-formed scorecard even with no data', async () => {
    const res = await request(app).get('/api/scorecard').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(Array.isArray(res.body.interventions)).toBe(true);
    expect(Array.isArray(res.body.trend)).toBe(true);
  });

  test('resident is forbidden -> 403', async () => {
    const res = await request(app).get('/api/scorecard').set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/scorecard');
    expect(res.status).toBe(401);
  });
});
