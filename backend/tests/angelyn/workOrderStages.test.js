process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

// Deterministic mail: anything to "broken" throws so a failed send can be asserted.
jest.mock('../../src/services/emailService', () => ({
  sendEmail: jest.fn(async ({ to }) => {
    if (String(to).includes('broken')) throw new Error('SMTP 550 mailbox unavailable');
    return { ok: true, stubbed: true };
  }),
  hasMailer: () => false,
}));

const request = require('supertest');
const app = require('../../src/index');
const { sequelize, RodentAssessment, WorkOrder, WorkOrderEvent, NotificationLog, ResidentReport, User } = require('../../src/models');

let adminToken, staffToken, residentToken, residentId;

async function registerAndLogin(name, email, role) {
  await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}

// A pending escalation is what the queue consolidates into a work order.
const makeAssessment = over => RodentAssessment.create({
  observations: 'Droppings by the bin chute',
  risk_level: 'high',
  escalate_to_contractor: true,
  ...over,
});

// Raise a work order through the real approval route, so every fixture starts
// from a genuine 'raised' event rather than a hand-built row.
async function raiseWorkOrder(block) {
  const a = await makeAssessment({ block_number: block });
  const res = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assessment_ids: [a.id] });
  expect(res.status).toBe(201);
  return res.body;
}

const patchStage = (id, token, body) => request(app)
  .patch(`/api/work-orders/${id}/stage`)
  .set('Authorization', `Bearer ${token}`)
  .send(body);

beforeAll(async () => {
  await sequelize.sync({ force: true });
  adminToken = await registerAndLogin('Admin', 'wos-admin@test.com', 'manager');
  staffToken = await registerAndLogin('Officer', 'wos-staff@test.com', 'field_officer');
  residentToken = await registerAndLogin('Resident', 'wos-res@test.com', 'resident');
  residentId = (await User.findOne({ where: { email: 'wos-res@test.com' } })).id;
});
afterAll(async () => { await sequelize.close(); });

describe('stage pipeline - forward movement', () => {
  test('a raised work order logs a real raised event with a time and an actor', async () => {
    const wo = await raiseWorkOrder('Block 10');
    const events = await WorkOrderEvent.findAll({ where: { work_order_id: wo.id } });
    expect(events).toHaveLength(1);
    expect(events[0].stage).toBe('raised');
    expect(events[0].actor_name).toBe('Admin');
    expect(events[0].at).toBeTruthy();
    expect(wo.status).toBe('raised');
  });

  test('staff can move non-financial stages, and each writes its own event', async () => {
    const wo = await raiseWorkOrder('Block 11');
    const d = await patchStage(wo.id, staffToken, { stage: 'dispatched', note: 'Called contractor' });
    expect(d.status).toBe(200);
    expect(d.body.status).toBe('dispatched');
    expect(d.body.dispatched_by_name).toBe('Officer');

    const p = await patchStage(wo.id, staffToken, { stage: 'in_progress' });
    expect(p.status).toBe(200);
    expect(p.body.in_progress_by_name).toBe('Officer');

    const events = await WorkOrderEvent.findAll({ where: { work_order_id: wo.id }, order: [['at', 'ASC']] });
    expect(events.map(e => e.stage)).toEqual(['raised', 'dispatched', 'in_progress']);
  });

  test('a resident cannot move any stage', async () => {
    const wo = await raiseWorkOrder('Block 12');
    const res = await patchStage(wo.id, residentToken, { stage: 'dispatched' });
    expect(res.status).toBe(403);
  });
});

describe('stage pipeline - honesty constraints', () => {
  test('scheduled is REFUSED without a real attendance date - never estimated', async () => {
    const wo = await raiseWorkOrder('Block 20');
    const res = await patchStage(wo.id, staffToken, { stage: 'scheduled' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scheduled_for is required/i);

    // and nothing was written: no event, no status change, no invented date
    const fresh = await WorkOrder.findByPk(wo.id);
    expect(fresh.status).toBe('raised');
    expect(fresh.scheduled_for).toBeNull();
    expect(await WorkOrderEvent.count({ where: { work_order_id: wo.id, stage: 'scheduled' } })).toBe(0);
  });

  test('scheduled with a supplied date records exactly that date', async () => {
    const wo = await raiseWorkOrder('Block 21');
    const when = '2026-08-14T02:00:00.000Z';
    const res = await patchStage(wo.id, staffToken, { stage: 'scheduled', scheduled_for: when });
    expect(res.status).toBe(200);
    expect(new Date(res.body.scheduled_for).toISOString()).toBe(when);
    expect(res.body.scheduled_by_name).toBe('Officer');
  });

  test('a skipped stage stays "not reached" - it is never back-filled by a later one', async () => {
    const wo = await raiseWorkOrder('Block 22');
    // jump straight to resolved without ever scheduling
    const res = await patchStage(wo.id, staffToken, { stage: 'resolved' });
    expect(res.status).toBe(200);

    const scheduled = res.body.pipeline.find(s => s.stage === 'scheduled');
    expect(scheduled.reached).toBe(false);
    expect(scheduled.at).toBeNull();

    const resolved = res.body.pipeline.find(s => s.stage === 'resolved');
    expect(resolved.reached).toBe(true);
    expect(resolved.at).toBeTruthy();

    const fresh = await WorkOrder.findByPk(wo.id);
    expect(fresh.scheduled_at).toBeNull();
    expect(fresh.scheduled_for).toBeNull();
  });

  test('backwards movement is refused', async () => {
    const wo = await raiseWorkOrder('Block 23');
    await patchStage(wo.id, staffToken, { stage: 'resolved' });
    const back = await patchStage(wo.id, staffToken, { stage: 'dispatched' });
    expect(back.status).toBe(400);
    expect(back.body.error).toMatch(/backwards/i);
  });

  test('re-entering the current stage is refused', async () => {
    const wo = await raiseWorkOrder('Block 24');
    await patchStage(wo.id, staffToken, { stage: 'dispatched' });
    const again = await patchStage(wo.id, staffToken, { stage: 'dispatched' });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already dispatched/i);
  });

  test('an unknown stage is refused', async () => {
    const wo = await raiseWorkOrder('Block 25');
    const res = await patchStage(wo.id, staffToken, { stage: 'on_its_way' });
    expect(res.status).toBe(400);
  });

  test('the pipeline reports every stage, reached or not', async () => {
    const wo = await raiseWorkOrder('Block 26');
    const res = await request(app).get(`/api/work-orders/${wo.id}`).set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pipeline.map(s => s.stage))
      .toEqual(['raised', 'dispatched', 'scheduled', 'in_progress', 'resolved', 'closed']);
    expect(res.body.pipeline.filter(s => s.reached).map(s => s.stage)).toEqual(['raised']);
  });
});

describe('closing', () => {
  test('closing is admin-only and logged as a stage event', async () => {
    const wo = await raiseWorkOrder('Block 30');
    const denied = await request(app)
      .patch(`/api/work-orders/${wo.id}/close`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(denied.status).toBe(403);

    const ok = await request(app)
      .patch(`/api/work-orders/${wo.id}/close`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('closed');
    expect(ok.body.closed_by_name).toBe('Admin');
    expect(await WorkOrderEvent.count({ where: { work_order_id: wo.id, stage: 'closed' } })).toBe(1);
  });
});

describe('resident notification reflects the real send outcome', () => {
  test('an unlinked work order notifies nobody and says so - not a failure', async () => {
    const wo = await raiseWorkOrder('Block 40');
    const res = await patchStage(wo.id, staffToken, { stage: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body.notified.attempted).toBe(0);
    expect(res.body.notified.skipped).toBe('no resident linked');
  });

  test('a linked resident is emailed and the send is logged with its true status', async () => {
    const report = await ResidentReport.create({
      category: 'pest', title: 'Rats near bin', description: 'Seen at night',
      reported_by: residentId,
    });
    const wo = await raiseWorkOrder('Block 41');
    await WorkOrder.update({ resident_report_ids: [report.id] }, { where: { id: wo.id } });

    const before = await NotificationLog.count();
    const res = await patchStage(wo.id, staffToken, { stage: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body.notified.attempted).toBe(1);
    expect(res.body.notified.sent).toBe(1);
    expect(res.body.notified.results[0].status).toBe('sent');
    expect(await NotificationLog.count()).toBe(before + 1);

    const log = await NotificationLog.findOne({ where: { source_type: 'work_order', source_id: String(wo.id) }, order: [['createdAt', 'DESC']] });
    expect(log.status).toBe('sent');
    expect(log.recipient).toBe('wos-res@test.com');
  });

  test('a failing send is recorded as failed, never as sent', async () => {
    const broken = await User.create({
      name: 'Broken Resident', email: 'broken@test.com', password_hash: 'x', role: 'resident',
    });
    const report = await ResidentReport.create({
      category: 'pest', title: 'Rats', description: 'Bin area', reported_by: broken.id,
    });
    const wo = await raiseWorkOrder('Block 42');
    await WorkOrder.update({ resident_report_ids: [report.id] }, { where: { id: wo.id } });

    const res = await patchStage(wo.id, staffToken, { stage: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body.notified.sent).toBe(0);
    expect(res.body.notified.failed).toBe(1);
    expect(res.body.notified.results[0].status).toBe('failed');
    expect(res.body.notified.results[0].error_reason).toMatch(/SMTP 550/);

    // the stage still moved: a mail problem must not roll back a real event
    const fresh = await WorkOrder.findByPk(wo.id);
    expect(fresh.status).toBe('resolved');
  });

  test('internal stages do not email residents', async () => {
    const report = await ResidentReport.create({
      category: 'pest', title: 'Rats', description: 'Void deck', reported_by: residentId,
    });
    const wo = await raiseWorkOrder('Block 43');
    await WorkOrder.update({ resident_report_ids: [report.id] }, { where: { id: wo.id } });

    const res = await patchStage(wo.id, staffToken, { stage: 'dispatched' });
    expect(res.body.notified.attempted).toBe(0);
    expect(res.body.notified.skipped).toMatch(/not resident-facing/);
  });
});

describe('queue payload for the UI columns', () => {
  test('list rows carry pipeline, council, reporter and last update', async () => {
    const officerAssessment = await makeAssessment({ block_number: 'Block 50' });
    await request(app).post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assessment_ids: [officerAssessment.id] });

    const res = await request(app).get('/api/work-orders').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find(w => w.block_number === 'Block 50');
    expect(row.town_council).toBeTruthy();
    expect(Array.isArray(row.pipeline)).toBe(true);
    expect(row.last_update).toBeTruthy();
    expect(row).toHaveProperty('reporter_name');
    expect(row).toHaveProperty('photo_count');
  });

  test("?status=open is a legacy alias for 'not closed'", async () => {
    const res = await request(app).get('/api/work-orders?status=open').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every(w => w.status !== 'closed')).toBe(true);
  });
});
