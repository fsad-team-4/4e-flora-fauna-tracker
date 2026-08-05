// Tests for the assessment lifecycle lookup (Member 4 / Angelyn):
// GET /api/rodent-assessments/:id must return the assessment PLUS the work order
// it was consolidated into (resolved via the work_order_id FK), and must leave the
// three "no work order" outcomes distinguishable - not recommended, pending, and
// dismissed are different states, not one blank.

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../../src/index');
const { sequelize, RodentAssessment } = require('../../src/models');
// Privileged users must be seeded, not registered - see tests/authHelpers.js
const { createAndLogin, registerAndLogin } = require('../authHelpers');

let staffToken, residentToken, adminToken;


function makeAssessment(over = {}) {
  return RodentAssessment.create({
    block_number: 'Block 100',
    observations: 'Droppings and gnaw marks near the bin centre.',
    risk_level: 'high',
    escalate_to_contractor: true,
    ...over,
  });
}

const detail = (id, token) => request(app).get(`/api/rodent-assessments/${id}`).set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  await sequelize.sync({ force: true });
  staffToken = await createAndLogin('Staff', 'ad-staff@test.com', 'staff');
  // raising a work order commits money, so it is admin-only
  adminToken = await createAndLogin('Admin', 'ad-admin@test.com', 'admin');
  residentToken = await registerAndLogin('Resident', 'ad-res@test.com', 'resident');
});
afterAll(async () => { await sequelize.close(); });

describe('GET /:id resolves the work order via work_order_id', () => {
  test('a consolidated assessment returns its work order with the lifecycle fields', async () => {
    const a1 = await makeAssessment({ block_number: 'Block 210', risk_level: 'high' });
    const a2 = await makeAssessment({ block_number: 'Block 210', risk_level: 'medium' });

    const raised = await request(app).post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assessment_ids: [a1.id, a2.id], target_agency: 'Pest Control Contractor' });
    expect(raised.status).toBe(201);

    const res = await detail(a1.id, staffToken);
    expect(res.status).toBe(200);
    // the assessment now points at the work order...
    expect(res.body.work_order_id).toBe(raised.body.id);
    // ...and the detail embeds that work order with the fields the timeline needs
    expect(res.body.work_order).toMatchObject({
      id: raised.body.id,
      target_agency: 'Pest Control Contractor',
      approved_by_name: 'Admin',
      consolidated_count: 2,
      risk_level: 'high',
      status: 'raised', // first pipeline stage; replaces the old 'open'
    });
    expect(res.body.work_order.createdAt).toBeTruthy(); // approval time
  });

  test('both consolidated reports resolve to the SAME work order (merged with N others)', async () => {
    const a1 = await makeAssessment({ block_number: 'Block 220' });
    const a2 = await makeAssessment({ block_number: 'Block 220' });
    const raised = await request(app).post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`).send({ assessment_ids: [a1.id, a2.id] });

    const [d1, d2] = await Promise.all([detail(a1.id, staffToken), detail(a2.id, staffToken)]);
    expect(d1.body.work_order.id).toBe(raised.body.id);
    expect(d2.body.work_order.id).toBe(raised.body.id);
    expect(d1.body.work_order.consolidated_count).toBe(2);
  });

  test('dispatch surfaces dispatched_at + email_status on the detail', async () => {
    const a = await makeAssessment({ block_number: 'Block 230', risk_level: 'critical' });
    await request(app).post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assessment_ids: [a.id], dispatch: true });
    const res = await detail(a.id, staffToken);
    expect(res.body.work_order.email_status).toBe('sent');
    expect(res.body.work_order.dispatched_at).toBeTruthy();
  });
});

describe('the three "no work order" states stay distinguishable', () => {
  test('AI did not recommend escalation -> no work order, not flagged', async () => {
    const a = await makeAssessment({ block_number: 'Block 300', escalate_to_contractor: false });
    const res = await detail(a.id, staffToken);
    expect(res.body.work_order).toBeNull();
    expect(res.body.escalate_to_contractor).toBe(false);
    expect(res.body.escalation_status).toBeNull();
  });

  test('recommended but awaiting approval -> no work order, flagged, not dismissed', async () => {
    const a = await makeAssessment({ block_number: 'Block 310', escalate_to_contractor: true });
    const res = await detail(a.id, staffToken);
    expect(res.body.work_order).toBeNull();
    expect(res.body.escalate_to_contractor).toBe(true);
    expect(res.body.escalation_status).toBeNull();
    expect(res.body.work_order_id).toBeNull();
  });

  test('dismissed by an officer -> no work order, but marked dismissed (not pending)', async () => {
    const a = await makeAssessment({ block_number: 'Block 320', escalation_status: 'dismissed', escalation_note: 'Bins secured' });
    const res = await detail(a.id, staffToken);
    expect(res.body.work_order).toBeNull();
    expect(res.body.escalation_status).toBe('dismissed');
  });
});

describe('contract + RBAC', () => {
  test('unknown id -> 404', async () => {
    const res = await detail(999999, staffToken);
    expect(res.status).toBe(404);
  });
  test('resident is forbidden -> 403', async () => {
    const a = await makeAssessment({ block_number: 'Block 400' });
    const res = await detail(a.id, residentToken);
    expect(res.status).toBe(403);
  });
  test('no token -> 401', async () => {
    const a = await makeAssessment({ block_number: 'Block 401' });
    const res = await request(app).get(`/api/rodent-assessments/${a.id}`);
    expect(res.status).toBe(401);
  });
});
