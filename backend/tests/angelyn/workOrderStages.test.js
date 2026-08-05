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
// Privileged users must be seeded, not registered - see tests/authHelpers.js
const { createAndLogin, registerAndLogin } = require('../authHelpers');
const { STAGE_LABEL } = require('../../src/services/workOrderStages');
const { buildMessage } = require('../../src/services/workOrderNotify');

let adminToken, staffToken, residentToken, residentId;


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
  adminToken = await createAndLogin('Admin', 'wos-admin@test.com', 'admin');
  staffToken = await createAndLogin('Officer', 'wos-staff@test.com', 'staff');
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

/**
 * THE WIRING THAT MAKES THE RESIDENT EMAIL REACHABLE.
 *
 * Every test below this point used to link a report with a direct
 * WorkOrder.update(), because the approval route had no way to express the link.
 * That is why the "your case is being handled" email could never fire in the real
 * app: notifyStageChange worked perfectly and always reported 'no resident linked'.
 *
 * The link is stated by the approving officer, NOT inferred from block+category.
 * WorkOrder.js:66-68 rules inference out ("rather than inventing a recipient") and
 * matching on block would email whoever else lives at the same block.
 */
describe('POST / accepts the resident reports a call-out answers', () => {
  const raiseLinked = async (block, ids) => {
    const a = await makeAssessment({ block_number: block });
    return request(app)
      .post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assessment_ids: [a.id], resident_report_ids: ids });
  };

  test('linked ids are persisted on the work order', async () => {
    const report = await ResidentReport.create({
      category: 'pest', title: 'Rats at the chute', description: 'Nightly', reported_by: residentId,
    });
    const res = await raiseLinked('Block 60', [report.id]);
    expect(res.status).toBe(201);
    const row = await WorkOrder.findByPk(res.body.id);
    expect(row.resident_report_ids).toEqual([report.id]);
  });

  test('the resident is told when work STARTS, not only when it finishes', async () => {
    const report = await ResidentReport.create({
      category: 'pest', title: 'Rats at the void deck', description: 'Every evening', reported_by: residentId,
    });
    const raised = await raiseLinked('Block 61', [report.id]);
    expect(raised.status).toBe(201);

    const res = await patchStage(raised.body.id, staffToken, { stage: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.notified.attempted).toBe(1);
    expect(res.body.notified.sent).toBe(1);
    expect(res.body.notified.skipped).toBeNull();

    // Asserted through STAGE_LABEL rather than a hardcoded string, so the wording
    // cannot drift out from under the test.
    const log = await NotificationLog.findOne({
      where: { source_type: 'work_order', source_id: String(raised.body.id) },
      order: [['createdAt', 'DESC']],
    });
    expect(log.status).toBe('sent');
    expect(log.recipient).toBe('wos-res@test.com');
    expect(log.subject).toContain(STAGE_LABEL.in_progress);
  });

  test('omitted resident_report_ids stays null and notifies nobody', async () => {
    const res = await raiseLinked('Block 62', undefined);
    expect(res.status).toBe(201);
    expect((await WorkOrder.findByPk(res.body.id)).resident_report_ids).toBeNull();
    const moved = await patchStage(res.body.id, staffToken, { stage: 'in_progress' });
    expect(moved.body.notified.skipped).toBe('no resident linked');
  });

  test('an empty array is normalised to null, not stored as []', async () => {
    const res = await raiseLinked('Block 63', []);
    expect(res.status).toBe(201);
    expect((await WorkOrder.findByPk(res.body.id)).resident_report_ids).toBeNull();
  });

  test('a non-numeric id is rejected -> 400', async () => {
    const a = await makeAssessment({ block_number: 'Block 64' });
    const res = await request(app)
      .post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assessment_ids: [a.id], resident_report_ids: ['not-an-id'] });
    expect(res.status).toBe(400);
  });

  /**
   * NO DOUBLE-NOTIFYING ONE COMPLAINT.
   *
   * recordStage refuses a repeated stage within one work order, but it cannot see
   * across work orders. Linking the same report to a second open call-out would
   * email that resident "contractor on site" twice for one complaint.
   */
  test('a report already on an open work order cannot be linked to a second -> 400', async () => {
    const report = await ResidentReport.create({
      category: 'pest', title: 'Rats by the drain', description: 'Recurring', reported_by: residentId,
    });
    const first = await raiseLinked('Block 65', [report.id]);
    expect(first.status).toBe(201);

    const second = await raiseLinked('Block 65', [report.id]);
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(new RegExp(`already linked to open work order #${first.body.id}`));

    // and the resident is emailed exactly once for the in_progress stage
    const moved = await patchStage(first.body.id, staffToken, { stage: 'in_progress' });
    expect(moved.body.notified.sent).toBe(1);
    const logs = await NotificationLog.findAll({
      where: { source_type: 'work_order', source_id: String(first.body.id) },
    });
    expect(logs.filter(l => l.subject.includes(STAGE_LABEL.in_progress))).toHaveLength(1);
  });

  test('once the first order is CLOSED the report can be linked again - a recurrence is new work', async () => {
    const report = await ResidentReport.create({
      category: 'pest', title: 'Rats returned', description: 'Months later', reported_by: residentId,
    });
    const first = await raiseLinked('Block 66', [report.id]);
    await request(app)
      .patch(`/api/work-orders/${first.body.id}/close`)
      .set('Authorization', `Bearer ${adminToken}`);

    const second = await raiseLinked('Block 66', [report.id]);
    expect(second.status).toBe(201);
  });

  test('the guard names every clashing report, not just the first', async () => {
    const mk = t => ResidentReport.create({
      category: 'pest', title: t, description: 'x', reported_by: residentId,
    });
    const r1 = await mk('Clash one');
    const r2 = await mk('Clash two');
    const first = await raiseLinked('Block 67', [r1.id, r2.id]);
    expect(first.status).toBe(201);

    const second = await raiseLinked('Block 67', [r1.id, r2.id]);
    expect(second.status).toBe(400);
    expect(second.body.error).toContain(String(r1.id));
    expect(second.body.error).toContain(String(r2.id));
  });
});

describe('the resident email does not claim their case status changed', () => {
  test('it is framed as the work order stage, and says the report is tracked separately', async () => {
    const wo = await WorkOrder.create({
      block_number: 'Block 70', animal_type: 'rodent', assessment_ids: [], consolidated_count: 1,
      risk_level: 'high', status: 'raised',
    });
    const { subject, body } = buildMessage(wo, 'in_progress', 'Aisha');

    // Not "Update on your report" - that implied a change to their own case.
    expect(subject).not.toMatch(/your report/i);
    expect(subject).toBe(`Pest control update - Block 70: ${STAGE_LABEL.in_progress}`);
    expect(body).toContain(`Work status: ${STAGE_LABEL.in_progress}`);
    expect(body).not.toMatch(/^Status:/m);
    expect(body).toMatch(/status of your own\s*\n?\s*report is tracked separately/);
  });

  test('a work order with no block still addresses the resident sensibly', async () => {
    const wo = await WorkOrder.create({
      animal_type: 'rodent', assessment_ids: [], consolidated_count: 1,
      risk_level: 'low', status: 'raised',
    });
    const { subject } = buildMessage(wo, 'resolved', null);
    expect(subject).toBe(`Pest control update - your block: ${STAGE_LABEL.resolved}`);
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
