// Tests for the Behavioural Diagnosis feature (Member 4 / Angelyn).
// The bulk are pure-function tests (no database, no HTTP - fast and
// deterministic), verifying the cross-domain feeding <-> rodent co-occurrence
// logic and the honesty guarantees: sample size, signal ordering, and the "both
// signals must be present" rule. A small RBAC block then exercises the route.
//
// Field names match the real domain data: fauna uses `block_number`,
// `behaviour_tags` (JSON array) and `createdAt`; rodent uses `block_number`,
// `risk_level` and `createdAt`.

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../../src/index');
const { sequelize } = require('../../src/models');
const {
  computeFeedingRodentCorrelation,
} = require('../../src/services/blockDiagnosis');

// Fixed clock so windowDays is deterministic. All fixture dates are relative.
const NOW = new Date('2026-07-23T00:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = n => new Date(NOW - n * DAY).toISOString();

function run(sightings, assessments, opts = {}) {
  return computeFeedingRodentCorrelation({ sightings, assessments, now: NOW, ...opts });
}

describe('computeFeedingRodentCorrelation - co-occurrence rule', () => {
  test('ranks a block that has BOTH feeding and rodent signals', () => {
    const sightings = [
      { block_number: 'Block 234', behaviour_tags: ['feeding'], createdAt: daysAgo(5) },
    ];
    const assessments = [
      { block_number: 'Block 234', risk_level: 'high', createdAt: daysAgo(3) },
    ];
    const result = run(sightings, assessments);
    expect(result).toHaveLength(1);
    expect(result[0].block_number).toBe('Block 234');
    expect(result[0].feedingCount).toBe(1);
    expect(result[0].rodentAssessmentCount).toBe(1);
  });

  test('excludes a block with feeding but no rodent reports', () => {
    const sightings = [{ block_number: 'Block A', behaviour_tags: ['feeding'], createdAt: daysAgo(1) }];
    expect(run(sightings, [])).toEqual([]);
  });

  test('excludes a block with rodent reports but no feeding', () => {
    const assessments = [{ block_number: 'Block B', risk_level: 'high', createdAt: daysAgo(1) }];
    expect(run([], assessments)).toEqual([]);
  });

  test('returns an empty array for empty inputs', () => {
    expect(run([], [])).toEqual([]);
    expect(computeFeedingRodentCorrelation()).toEqual([]);
  });
});

describe('block matching (trim + lowercase + strip "Block" prefix)', () => {
  test('matches feeding and rodent records that differ only in case/whitespace', () => {
    const sightings = [{ block_number: '  Block 234 ', behaviour_tags: ['feeding'], createdAt: daysAgo(4) }];
    const assessments = [{ block_number: 'block 234', risk_level: 'medium', createdAt: daysAgo(2) }];
    const result = run(sightings, assessments);
    expect(result).toHaveLength(1);
    expect(result[0].feedingCount).toBe(1);
    expect(result[0].rodentAssessmentCount).toBe(1);
  });

  test('reconciles the two modules\' formats: fauna "128" and rodent "Block 128" are the same block', () => {
    // The whole point of the cross-domain join: fauna writes bare numbers, rodent
    // writes "Block N". Without stripping the prefix these fall into separate
    // buckets and a genuine co-occurrence is silently missed.
    const sightings = [{ block_number: '128', behaviour_tags: ['feeding'], createdAt: daysAgo(20) }];
    const assessments = [{ block_number: 'Block 128', risk_level: 'high', createdAt: daysAgo(5) }];
    const result = run(sightings, assessments);
    expect(result).toHaveLength(1);
    expect(result[0].feedingCount).toBe(1);
    expect(result[0].rodentAssessmentCount).toBe(1);
    expect(result[0].elevatedRodentCount).toBe(1);
  });

  test('does not correlate records with a blank/unknown block', () => {
    const sightings = [{ block_number: '   ', behaviour_tags: ['feeding'], createdAt: daysAgo(1) }];
    const assessments = [{ block_number: null, risk_level: 'high', createdAt: daysAgo(1) }];
    expect(run(sightings, assessments)).toEqual([]);
  });
});

describe('feeding detection', () => {
  test('counts only feeding-tagged sightings, ignoring other behaviours', () => {
    const sightings = [
      { block_number: 'Block 5', behaviour_tags: ['feeding'], createdAt: daysAgo(3) },
      { block_number: 'Block 5', behaviour_tags: ['nesting', 'droppings'], createdAt: daysAgo(2) },
      { block_number: 'Block 5', behaviour_tags: [], createdAt: daysAgo(1) },
    ];
    const assessments = [{ block_number: 'Block 5', risk_level: 'low', createdAt: daysAgo(1) }];
    expect(run(sightings, assessments)[0].feedingCount).toBe(1);
  });

  test('supports the legacy mock shape (single `behaviour` string) too', () => {
    // regression guard: two fauna shapes coexist in this repo; assuming only the
    // array shape would silently zero the feeding count for mock-shaped rows.
    const sightings = [{ block_number: 'Block 7', behaviour: 'feeding', createdAt: daysAgo(2) }];
    const assessments = [{ block_number: 'Block 7', risk_level: 'high', createdAt: daysAgo(1) }];
    expect(run(sightings, assessments)[0].feedingCount).toBe(1);
  });

  test('counts feeding regardless of species (food waste is not cat-exclusive)', () => {
    const sightings = [
      { block_number: 'Block 9', species: 'cat', behaviour_tags: ['feeding'], createdAt: daysAgo(4) },
      { block_number: 'Block 9', species: 'pigeon', behaviour_tags: ['feeding'], createdAt: daysAgo(3) },
    ];
    const assessments = [{ block_number: 'Block 9', risk_level: 'medium', createdAt: daysAgo(1) }];
    expect(run(sightings, assessments)[0].feedingCount).toBe(2);
  });
});

describe('elevated rodent count', () => {
  test('counts only medium/high/critical as elevated', () => {
    const sightings = [{ block_number: 'Block 3', behaviour_tags: ['feeding'], createdAt: daysAgo(6) }];
    const assessments = [
      { block_number: 'Block 3', risk_level: 'low', createdAt: daysAgo(5) },
      { block_number: 'Block 3', risk_level: 'medium', createdAt: daysAgo(4) },
      { block_number: 'Block 3', risk_level: 'high', createdAt: daysAgo(3) },
      { block_number: 'Block 3', risk_level: 'critical', createdAt: daysAgo(2) },
    ];
    const result = run(sightings, assessments)[0];
    expect(result.rodentAssessmentCount).toBe(4);
    expect(result.elevatedRodentCount).toBe(3);
  });
});

describe('window filtering', () => {
  test('excludes records older than windowDays', () => {
    const sightings = [
      { block_number: 'Block 1', behaviour_tags: ['feeding'], createdAt: daysAgo(5) },
      { block_number: 'Block 1', behaviour_tags: ['feeding'], createdAt: daysAgo(40) }, // outside 30d
    ];
    const assessments = [
      { block_number: 'Block 1', risk_level: 'high', createdAt: daysAgo(2) },
      { block_number: 'Block 1', risk_level: 'high', createdAt: daysAgo(45) }, // outside 30d
    ];
    const result = run(sightings, assessments)[0];
    expect(result.feedingCount).toBe(1);
    expect(result.rodentAssessmentCount).toBe(1);
  });

  test('a custom windowDays widens the window', () => {
    const sightings = [{ block_number: 'Block 1', behaviour_tags: ['feeding'], createdAt: daysAgo(40) }];
    const assessments = [{ block_number: 'Block 1', risk_level: 'high', createdAt: daysAgo(45) }];
    expect(run(sightings, assessments)).toEqual([]); // default 30d
    expect(run(sightings, assessments, { windowDays: 60 })).toHaveLength(1);
  });
});

describe('honesty outputs', () => {
  test('sampleSize is the total count of records backing the block', () => {
    const sightings = [
      { block_number: 'Block 2', behaviour_tags: ['feeding'], createdAt: daysAgo(6) },
      { block_number: 'Block 2', behaviour_tags: ['feeding'], createdAt: daysAgo(5) },
    ];
    const assessments = [{ block_number: 'Block 2', risk_level: 'high', createdAt: daysAgo(2) }];
    const result = run(sightings, assessments)[0];
    expect(result.sampleSize).toBe(3); // 2 feeding + 1 rodent
  });

  test('reports the earliest date of each signal', () => {
    const sightings = [
      { block_number: 'Block 2', behaviour_tags: ['feeding'], createdAt: daysAgo(5) },
      { block_number: 'Block 2', behaviour_tags: ['feeding'], createdAt: daysAgo(10) }, // earliest
    ];
    const assessments = [
      { block_number: 'Block 2', risk_level: 'high', createdAt: daysAgo(3) },
      { block_number: 'Block 2', risk_level: 'high', createdAt: daysAgo(8) }, // earliest
    ];
    const result = run(sightings, assessments)[0];
    expect(result.firstFeedingDate).toBe(daysAgo(10));
    expect(result.firstRodentDate).toBe(daysAgo(8));
  });

  test('surfaces ordering: feeding that post-dates rodent reports is detectable', () => {
    // feeding first seen AFTER the first rodent report -> firstFeedingDate is later.
    const sightings = [{ block_number: 'Block 2', behaviour_tags: ['feeding'], createdAt: daysAgo(2) }];
    const assessments = [{ block_number: 'Block 2', risk_level: 'high', createdAt: daysAgo(9) }];
    const result = run(sightings, assessments)[0];
    expect(new Date(result.firstFeedingDate).getTime())
      .toBeGreaterThan(new Date(result.firstRodentDate).getTime());
  });
});

describe('ranking', () => {
  test('ranks blocks worst-first by elevated rodent count', () => {
    const sightings = [
      { block_number: 'Block Low', behaviour_tags: ['feeding'], createdAt: daysAgo(5) },
      { block_number: 'Block High', behaviour_tags: ['feeding'], createdAt: daysAgo(5) },
    ];
    const assessments = [
      { block_number: 'Block Low', risk_level: 'low', createdAt: daysAgo(3) },
      { block_number: 'Block High', risk_level: 'critical', createdAt: daysAgo(3) },
      { block_number: 'Block High', risk_level: 'high', createdAt: daysAgo(2) },
    ];
    const result = run(sightings, assessments);
    expect(result.map(b => b.block_number)).toEqual(['Block High', 'Block Low']);
  });
});

describe('GET /api/block-diagnosis (RBAC + contract)', () => {
  let staffToken, residentToken;
  async function registerAndLogin(name, email, role) {
    await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
    return res.body.token;
  }
  beforeAll(async () => {
    await sequelize.sync({ force: true });
    staffToken = await registerAndLogin('Staff', 'bd-staff@test.com', 'staff');
    residentToken = await registerAndLogin('Resident', 'bd-res@test.com', 'resident');
  });
  afterAll(async () => { await sequelize.close(); });

  test('staff gets a well-formed payload even with no data', async () => {
    const res = await request(app).get('/api/block-diagnosis').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(30);
    expect(Array.isArray(res.body.blocks)).toBe(true);
  });

  test('resident is forbidden -> 403', async () => {
    const res = await request(app).get('/api/block-diagnosis').set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/block-diagnosis');
    expect(res.status).toBe(401);
  });
});
