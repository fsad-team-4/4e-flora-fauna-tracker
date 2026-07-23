process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../../src/index');
const { sequelize, RodentAssessment, WorkOrder, NotificationLog } = require('../../src/models');

let adminToken, staffToken, residentToken;

async function registerAndLogin(name, email, role) {
  await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}

// Insert a rodent assessment straight into the DB so the queue state is
// deterministic without depending on the Gemini-backed create route.
function makeAssessment(over = {}) {
  return RodentAssessment.create({
    block_number: 'Block 100',
    observations: 'Droppings and gnaw marks near the bin centre.',
    risk_level: 'high',
    escalate_to_contractor: true,
    ...over,
  });
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

describe('GET /api/work-orders/queue (pending escalations)', () => {
  beforeAll(async () => {
    await makeAssessment({ block_number: 'Block 100', risk_level: 'high' });
    await makeAssessment({ block_number: 'Block 100', risk_level: 'medium' });
    await makeAssessment({ block_number: 'Block 100', risk_level: 'high' });
    await makeAssessment({ block_number: 'Block 200', risk_level: 'medium' });
    // must NOT appear: not flagged, dismissed, or deleted
    await makeAssessment({ block_number: 'Block 300', escalate_to_contractor: false });
    await makeAssessment({ block_number: 'Block 400', escalation_status: 'dismissed' });
    await makeAssessment({ block_number: 'Block 500', is_deleted: true });
  });

  test('staff sees only pending escalations, grouped by block', async () => {
    const res = await request(app).get('/api/work-orders/queue').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totals.pending).toBe(4);
    expect(res.body.totals.blocks).toBe(2);
    const blocks = res.body.clusters.map(c => c.block);
    expect(blocks).toContain('Block 100');
    expect(blocks).toContain('Block 200');
    expect(blocks).not.toContain('Block 300');
    expect(blocks).not.toContain('Block 400');
    expect(blocks).not.toContain('Block 500');
  });

  test('the biggest/most-urgent cluster quantifies consolidation savings', async () => {
    const res = await request(app).get('/api/work-orders/queue').set('Authorization', `Bearer ${staffToken}`);
    const b100 = res.body.clusters.find(c => c.block === 'Block 100');
    expect(b100.count).toBe(3);
    expect(b100.risk_level).toBe('high'); // highest among high/medium/high
    expect(b100.call_outs_avoided).toBe(2); // 3 complaints -> 1 visit
    expect(b100.est_savings).toBe(2 * res.body.totals.callout_cost);
  });

  test('resident is forbidden -> 403', async () => {
    const res = await request(app).get('/api/work-orders/queue').set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/work-orders/queue');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/work-orders (approve & consolidate)', () => {
  test('consolidating a block into one work order removes them from the queue', async () => {
    const before = await request(app).get('/api/work-orders/queue').set('Authorization', `Bearer ${staffToken}`);
    const b100 = before.body.clusters.find(c => c.block === 'Block 100');
    const ids = b100.assessments.map(a => a.id);

    const res = await request(app)
      .post('/api/work-orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: ids });
    expect(res.status).toBe(201);
    expect(res.body.consolidated_count).toBe(3);
    expect(res.body.risk_level).toBe('high');
    expect(res.body.call_outs_avoided).toBe(2);
    expect(res.body.approved_by_name).toBe('Staff');
    expect(res.body.status).toBe('open');

    const after = await request(app).get('/api/work-orders/queue').set('Authorization', `Bearer ${staffToken}`);
    expect(after.body.clusters.find(c => c.block === 'Block 100')).toBeUndefined();
    expect(after.body.totals.pending).toBe(1); // only Block 200 left
  });

  test('empty assessment_ids -> 400', async () => {
    const res = await request(app)
      .post('/api/work-orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: [] });
    expect(res.status).toBe(400);
  });

  test('re-approving already-actioned assessments -> 400 (no double dispatch)', async () => {
    const wo = await WorkOrder.findOne({ order: [['createdAt', 'DESC']] });
    const res = await request(app)
      .post('/api/work-orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: wo.assessment_ids });
    expect(res.status).toBe(400);
  });

  test('resident cannot approve -> 403', async () => {
    const a = await makeAssessment({ block_number: 'Block 900' });
    const res = await request(app)
      .post('/api/work-orders')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ assessment_ids: [a.id] });
    expect(res.status).toBe(403);
  });

  test('dispatch emails the contractor and logs it to the notification timeline', async () => {
    const a = await makeAssessment({ block_number: 'Block 777', risk_level: 'critical' });
    const before = await NotificationLog.count();
    const res = await request(app)
      .post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assessment_ids: [a.id], dispatch: true, notes: 'Urgent - near playground' });
    expect(res.status).toBe(201);
    expect(res.body.email_status).toBe('sent'); // emailService stubs to console without SMTP
    expect(res.body.dispatched_to).toBeTruthy();
    expect(await NotificationLog.count()).toBe(before + 1);
  });
});

describe('POST /api/work-orders/dismiss (audit trail)', () => {
  test('dismissing a cluster records who/why and clears it from the queue', async () => {
    const before = await request(app).get('/api/work-orders/queue').set('Authorization', `Bearer ${staffToken}`);
    const b200 = before.body.clusters.find(c => c.block === 'Block 200');
    const ids = b200.assessments.map(a => a.id);

    const res = await request(app)
      .post('/api/work-orders/dismiss')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: ids, note: 'Bins already secured, will monitor' });
    expect(res.status).toBe(200);
    expect(res.body.dismissed).toBe(1);

    const row = await RodentAssessment.findByPk(ids[0]);
    expect(row.escalation_status).toBe('dismissed');
    expect(row.escalation_note).toMatch(/monitor/);
    expect(row.escalation_decided_by).toBeTruthy();
  });

  test('resident cannot dismiss -> 403', async () => {
    const res = await request(app)
      .post('/api/work-orders/dismiss')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ assessment_ids: [1] });
    expect(res.status).toBe(403);
  });

  test('undismiss (undo) puts a dismissed report back in the queue', async () => {
    const a = await makeAssessment({ block_number: 'Block Undo' });
    await request(app).post('/api/work-orders/dismiss')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: [a.id], note: 'oops' });
    expect((await RodentAssessment.findByPk(a.id)).escalation_status).toBe('dismissed');

    const res = await request(app).post('/api/work-orders/undismiss')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: [a.id] });
    expect(res.status).toBe(200);
    expect(res.body.restored).toBe(1);
    const row = await RodentAssessment.findByPk(a.id);
    expect(row.escalation_status).toBeNull();
    expect(row.escalation_decided_by).toBeNull();
  });
});

describe('PATCH /api/work-orders/:id/close', () => {
  test('closing an open work order marks it closed with an audit stamp', async () => {
    const wo = await WorkOrder.findOne({ where: { status: 'open' }, order: [['createdAt', 'ASC']] });
    const res = await request(app)
      .patch(`/api/work-orders/${wo.id}/close`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    expect(res.body.closed_by_name).toBe('Admin');
  });

  test('closing an already-closed work order -> 400', async () => {
    const wo = await WorkOrder.findOne({ where: { status: 'closed' } });
    const res = await request(app)
      .patch(`/api/work-orders/${wo.id}/close`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
