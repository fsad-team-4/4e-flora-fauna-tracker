process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.ALERT_FALLBACK_EMAIL = 'fallback@test.com';

// Control nodemailer so resend outcomes are deterministic: any address containing
// "broken" throws (a stuck provider); everything else "sends".
jest.mock('../../src/services/emailService', () => ({
  sendEmail: jest.fn(async ({ to }) => {
    if (String(to).includes('broken')) throw new Error('SMTP 550 mailbox unavailable');
    return { ok: true, stubbed: true };
  }),
  hasMailer: () => false,
}));

const request = require('supertest');
const app = require('../../src/index');
const { sequelize, NotificationLog } = require('../../src/models');

let adminToken, staffToken, residentToken;
async function registerAndLogin(name, email, role) {
  await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}
const mkFailed = over => NotificationLog.create({
  channel: 'email', recipient: 'ops@test.com', status: 'failed',
  subject: 'Critical flora alert', body: 'Plant X is critical.', error_reason: 'SMTP timeout',
  severity: 'urgent', ...over,
});

beforeAll(async () => {
  await sequelize.sync({ force: true });
  adminToken = await registerAndLogin('Admin', 'n-admin@test.com', 'manager');
  staffToken = await registerAndLogin('Staff', 'n-staff@test.com', 'field_officer');
  residentToken = await registerAndLogin('Resident', 'n-res@test.com', 'resident');
});
afterAll(async () => { await sequelize.close(); });

describe('GET /api/notifications?rule_id=', () => {
  test('scopes the log to one rule and ignores junk ids', async () => {
    // rule_id is a real FK - create two rules to attribute log rows to
    const { AlertRule } = require('../../src/models');
    const mkRule = name => AlertRule.create({
      name, trigger_type: 'flora_critical', recipients: 'ops@test.com', channel: 'email', is_active: true,
    });
    const ruleA = await mkRule('Scope rule A');
    const ruleB = await mkRule('Scope rule B');
    const a = await mkFailed({ rule_id: ruleA.id });
    await mkFailed({ rule_id: ruleB.id });
    await mkFailed({ rule_id: null });

    const res = await request(app).get(`/api/notifications?rule_id=${ruleA.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBe(1);
    expect(res.body.logs[0].id).toBe(a.id);

    // a non-numeric rule_id must not filter (and must not 500)
    const junk = await request(app).get('/api/notifications?rule_id=abc')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(junk.status).toBe(200);
    expect(junk.body.logs.length).toBeGreaterThanOrEqual(3);

    await NotificationLog.destroy({ where: {} }); // leave the shared table clean
  });
});

describe('GET /api/notifications/stats', () => {
  test('staff gets reliability metrics', async () => {
    await NotificationLog.create({ channel: 'email', recipient: 'a@test.com', status: 'sent', body: 'ok' });
    await mkFailed({});
    const res = await request(app).get('/api/notifications/stats').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('deliveryRate');
    expect(res.body).toHaveProperty('unresolvedFailed');
    expect(res.body.fallbackConfigured).toBe(true);
  });
  test('resident forbidden', async () => {
    const res = await request(app).get('/api/notifications/stats').set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/notifications/:id/resend', () => {
  test('a resend that succeeds resolves the failure and writes a retry row', async () => {
    const f = await mkFailed({ recipient: 'reachable@test.com' });
    const before = await NotificationLog.count();
    const res = await request(app).post(`/api/notifications/${f.id}/resend`).set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.delivered).toBe(true);
    expect(res.body.resolved).toBe(true);
    expect(await NotificationLog.count()).toBe(before + 1); // retry recorded
    const orig = await NotificationLog.findByPk(f.id);
    expect(orig.resolved_at).toBeTruthy();
  });

  test('a still-failing critical alert escalates to the fallback recipient', async () => {
    const f = await mkFailed({ recipient: 'broken@test.com', severity: 'urgent' });
    const res = await request(app).post(`/api/notifications/${f.id}/resend`).set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.delivered).toBe(false);   // primary still broken
    expect(res.body.escalated).toBe(true);
    expect(res.body.fallback_delivered).toBe(true);
    expect(res.body.resolved).toBe(true);
  });

  test('resend of a missing id -> 404', async () => {
    const res = await request(app).post('/api/notifications/999999/resend').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
  });

  test('resident cannot resend -> 403', async () => {
    const f = await mkFailed({});
    const res = await request(app).post(`/api/notifications/${f.id}/resend`).set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/notifications/resend-failed (bulk)', () => {
  test('retries every unresolved failure group', async () => {
    await mkFailed({ recipient: 'grp1@test.com' });
    await mkFailed({ recipient: 'grp2@test.com' });
    const res = await request(app).post('/api/notifications/resend-failed').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.groups).toBeGreaterThanOrEqual(2);
    const unresolved = await NotificationLog.count({ where: { status: 'failed', resolved_at: null } });
    expect(unresolved).toBe(0); // all reachable ones resolved
  });
});

describe('POST /api/notifications/:id/acknowledge', () => {
  test('marks a dispatch acknowledged with the actor', async () => {
    const s = await NotificationLog.create({ channel: 'email', recipient: 'a@test.com', status: 'sent', body: 'ok' });
    const res = await request(app).post(`/api/notifications/${s.id}/acknowledge`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = await NotificationLog.findByPk(s.id);
    expect(row.acknowledged_at).toBeTruthy();
    expect(row.acknowledged_by_name).toBe('Admin');
  });

  test('unacknowledge (undo) clears the acknowledgement', async () => {
    const s = await NotificationLog.create({ channel: 'email', recipient: 'b@test.com', status: 'sent', body: 'ok' });
    await request(app).post(`/api/notifications/${s.id}/acknowledge`).set('Authorization', `Bearer ${staffToken}`);
    const res = await request(app).post(`/api/notifications/${s.id}/unacknowledge`).set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const row = await NotificationLog.findByPk(s.id);
    expect(row.acknowledged_at).toBeNull();
    expect(row.acknowledged_by_name).toBeNull();
  });
});

describe('GET /api/notifications/export', () => {
  test('returns CSV with a header row', async () => {
    const res = await request(app).get('/api/notifications/export').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv/);
    expect(res.text.split('\n')[0]).toContain('recipient');
  });
  test('resident cannot export -> 403', async () => {
    const res = await request(app).get('/api/notifications/export').set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });
});
