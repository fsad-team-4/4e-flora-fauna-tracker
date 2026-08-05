// angelyn
// RESIDENT UPDATE STATUS - the assessment lifecycle's last step.
//
// The whole point of this service is that it never claims a resident was told unless a send
// is LOGGED, so these tests are mostly about the negative cases being distinguishable from
// each other. "sent" is the easy one; the value is in proving that a bounce does not read as
// a delivery, that an unreachable resident does not read as a pending one, and that a
// pre-close send is still reported after the order moves on.
//
// DATABASE_URL FIRST, BEFORE ANY require. This file omitted it and the omission was
// destructive: sync({ force: true }) then ran against the real dev database
// (backend/database.sqlite) and dropped every table in it. Every other test in this
// directory opens with this exact line for that reason.
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

const { sequelize, User, ResidentReport, WorkOrder, NotificationLog } = require('../../src/models');
const { residentUpdateStatus } = require('../../src/services/residentUpdateStatus');

const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

let resident;
let reportId;

beforeAll(async () => {
  await sequelize.sync({ force: true });
  resident = await User.create({
    name: 'Test Resident', email: 'resident@example.com', role: 'resident', password_hash: 'x',
  });
  const report = await ResidentReport.create({
    category: 'pest', title: 'Rats at the bin centre', description: 'seen at night',
    block_number: 'Block 123', status: 'open', reported_by: resident.id,
  });
  reportId = report.id;
});

afterAll(async () => { await sequelize.close(); });
afterEach(async () => { await NotificationLog.destroy({ where: {} }); });

const makeOrder = (over = {}) => WorkOrder.create({
  block_number: 'Block 123',
  animal_type: 'rodent',
  status: 'scheduled',
  resident_report_ids: [reportId],
  photo_urls: [],
  is_deleted: false,
  ...over,
});

const logSend = (workOrderId, over = {}) => NotificationLog.create({
  channel: 'email',
  recipient: 'resident@example.com',
  status: 'sent',
  subject: 'Pest control update',
  body: 'body',
  source_type: 'work_order',
  source_id: String(workOrderId),
  ...over,
});

describe('residentUpdateStatus', () => {
  test('no work order is not_applicable, and says why', async () => {
    const r = await residentUpdateStatus(null);
    expect(r.status).toBe('not_applicable');
    expect(r.reason).toMatch(/no work order/i);
  });

  test('a stage the resident is never told about is not_applicable, not pending', async () => {
    // `raised` and `dispatched` are outside RESIDENT_VISIBLE, so nothing is owed yet -
    // reporting them as "due" would put a false action on the officer.
    const wo = await makeOrder({ status: 'raised' });
    const r = await residentUpdateStatus(wo);
    expect(r.status).toBe('not_applicable');
    expect(r.reason).toMatch(/not reached a stage/i);
  });

  test('resident-facing stage with a reachable resident and no log is pending', async () => {
    const wo = await makeOrder({ status: 'scheduled' });
    const r = await residentUpdateStatus(wo);
    expect(r.status).toBe('pending');
    expect(r.recipients).toEqual(['resident@example.com']);
  });

  test('a logged send reports sent, with when and to whom', async () => {
    const wo = await makeOrder({ status: 'resolved' });
    await logSend(wo.id);
    const r = await residentUpdateStatus(wo);
    expect(r.status).toBe('sent');
    expect(r.count).toBe(1);
    expect(r.recipients).toEqual(['resident@example.com']);
    expect(r.at).toBeTruthy();
  });

  test('A FAILED SEND IS NOT "not sent" - it is its own outcome, and carries the reason', async () => {
    // The distinction an officer acts on: with `failed` the system believed it had informed
    // someone and had not, so the resident still needs contacting AND the bounce needs
    // fixing. Folding this into pending or not_applicable would hide both.
    const wo = await makeOrder({ status: 'resolved' });
    await logSend(wo.id, { status: 'failed', error_reason: 'SMTP 550 - mailbox unavailable' });
    const r = await residentUpdateStatus(wo);
    expect(r.status).toBe('failed');
    expect(r.reason).toMatch(/550/);
  });

  test('a send that succeeded beats a bounce to a second recipient, but the bounce is still counted', async () => {
    const wo = await makeOrder({ status: 'resolved' });
    await logSend(wo.id);
    await logSend(wo.id, { status: 'failed', recipient: 'other@example.com', error_reason: 'timeout' });
    const r = await residentUpdateStatus(wo);
    expect(r.status).toBe('sent');
    expect(r.failedCount).toBe(1);
  });

  test('a send logged before closure is still reported after the order closes', async () => {
    // The order's CURRENT stage does not decide whether the resident was told - the log
    // does. Gating on stage here would report a closed order as having told nobody.
    const wo = await makeOrder({ status: 'closed' });
    await logSend(wo.id, { createdAt: daysAgo(9) });
    const r = await residentUpdateStatus(wo);
    expect(r.status).toBe('sent');
  });

  test('no linked report is unreachable, and distinguishable from a linked-but-uncontactable one', async () => {
    const none = await makeOrder({ status: 'resolved', resident_report_ids: null });
    const r1 = await residentUpdateStatus(none);
    expect(r1.status).toBe('unreachable');
    expect(r1.reason).toMatch(/no resident report is linked/i);

    // a report id that does not resolve to a contactable resident
    const ghost = await makeOrder({ status: 'resolved', resident_report_ids: [999999] });
    const r2 = await residentUpdateStatus(ghost);
    expect(r2.status).toBe('unreachable');
    expect(r2.reason).toMatch(/no contactable resident/i);
  });

  test('another work order\'s notifications are never attributed to this one', async () => {
    const mine = await makeOrder({ status: 'resolved' });
    const theirs = await makeOrder({ status: 'resolved' });
    await logSend(theirs.id);
    const r = await residentUpdateStatus(mine);
    expect(r.status).toBe('pending');
    expect(r.messages).toEqual([]);
  });

  test('a notification from a different SOURCE is never mistaken for a resident update', async () => {
    // source_id is a shared string column - a case id and a work order id can collide as
    // numbers, so source_type has to be part of the match.
    const wo = await makeOrder({ status: 'resolved' });
    await logSend(wo.id, { source_type: 'case' });
    const r = await residentUpdateStatus(wo);
    expect(r.status).toBe('pending');
  });
});
