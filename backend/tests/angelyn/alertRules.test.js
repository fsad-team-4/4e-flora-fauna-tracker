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
const app = require('../../src/index');
const { sequelize } = require('../../src/models');

// tokens for the three roles, obtained by registering + logging in real users
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
// ---------------------------------------------------------------------------
// GET /api/alert-rules/activity
//
// Firing counts are derived from the dispatch log (NotificationLog.rule_id), not
// from a counter column, so these tests seed log rows directly and assert the
// derivation - including the two cases that are easy to get wrong: a dispatch with
// no rule_id, and a rule whose last fire is older than the window.
// ---------------------------------------------------------------------------
describe('GET /api/alert-rules/activity', () => {
  const { NotificationLog } = require('../../src/models');
  let ruleA, ruleB;
  const HOUR = 3600 * 1000;

  beforeAll(async () => {
    const a = await request(app).post('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validRule, name: 'Activity Rule A' });
    const b = await request(app).post('/api/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validRule, name: 'Activity Rule B' });
    ruleA = a.body.id;
    ruleB = b.body.id;

    const now = Date.now();
    const seed = (rule_id, status, agoMs, retry_of = null) => NotificationLog.create({
      rule_id, channel: 'email', recipient: 'ops@test.com', status,
      message_preview: 'x', retry_of, createdAt: new Date(now - agoMs),
    });   // no { silent: true } - it makes Sequelize reject the createdAt override

    // rule A: 2 sent + 1 failed inside the 24h window
    await seed(ruleA, 'sent', 1 * HOUR);
    await seed(ruleA, 'sent', 2 * HOUR);
    const failedRow = await seed(ruleA, 'failed', 3 * HOUR);
    // a staff resend of the failed dispatch - same rule_id, but NOT a new trigger
    await seed(ruleA, 'sent', 0.5 * HOUR, failedRow.id);
    // rule B: nothing recent, one fire 100h ago (outside even the previous window)
    await seed(ruleB, 'sent', 100 * HOUR);
    // a dispatch with no rule behind it (work order / manual send)
    await seed(null, 'sent', 4 * HOUR);
    // previous-window traffic, for the trend denominator
    await seed(ruleA, 'sent', 30 * HOUR);
    await seed(ruleA, 'sent', 40 * HOUR);
  });

  test('staff can read activity', async () => {
    const res = await request(app).get('/api/alert-rules/activity')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  test('resident is denied', async () => {
    const res = await request(app).get('/api/alert-rules/activity')
      .set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });

  test('counts only the window, and keeps failures inside the count', async () => {
    const res = await request(app).get('/api/alert-rules/activity')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.windowHours).toBe(24);
    // 3 for rule A + 1 unattributed = 4 in the last 24h; the resend row is
    // excluded everywhere, or one fire + two resend clicks would read as 3 fires
    expect(res.body.total).toBe(4);
    expect(res.body.failed).toBe(1);
    expect(res.body.unattributed).toBe(1);
    expect(res.body.rules[ruleA].count).toBe(3);
    expect(res.body.rules[ruleA].failed).toBe(1);
  });

  test('prevTotal covers the preceding window of equal length', async () => {
    const res = await request(app).get('/api/alert-rules/activity')
      .set('Authorization', `Bearer ${adminToken}`);
    // the two rule-A rows at 30h and 40h fall in the 24-48h window
    expect(res.body.prevTotal).toBe(2);
  });

  test('a rule dormant longer than the window still reports its last fire', async () => {
    const res = await request(app).get('/api/alert-rules/activity')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.rules[ruleB].count).toBe(0);
    expect(res.body.rules[ruleB].lastTriggeredAt).toBeTruthy();
  });

  test('lastTriggeredAt is ISO in every environment, and a resend does not move it', async () => {
    const res = await request(app).get('/api/alert-rules/activity')
      .set('Authorization', `Bearer ${adminToken}`);
    const lastA = res.body.rules[ruleA].lastTriggeredAt;
    // raw MAX(createdAt) would leak SQLite's 'YYYY-MM-DD HH:MM:SS +00:00' string
    // while Postgres serializes ISO - the route must normalize
    expect(new Date(lastA).toISOString()).toBe(lastA);
    // the resend at 0.5h ago must not read as the rule's latest fire (1h ago)
    expect(Date.now() - new Date(lastA).getTime()).toBeGreaterThan(0.9 * HOUR);
  });

  test('hours is clamped to 1..720', async () => {
    const lo = await request(app).get('/api/alert-rules/activity?hours=0')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lo.body.windowHours).toBe(24); // 0 is falsy -> default
    const hi = await request(app).get('/api/alert-rules/activity?hours=99999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hi.body.windowHours).toBe(720);
    const neg = await request(app).get('/api/alert-rules/activity?hours=-5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(neg.body.windowHours).toBe(1);
  });

  test('a wider window absorbs the previous-window rows', async () => {
    const res = await request(app).get('/api/alert-rules/activity?hours=48')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.rules[ruleA].count).toBe(5);
  });

  test('"activity" is not swallowed by the /:id route', async () => {
    const res = await request(app).get('/api/alert-rules/activity')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body).toHaveProperty('rules');
    expect(res.body).not.toHaveProperty('trigger_type');
  });
});
