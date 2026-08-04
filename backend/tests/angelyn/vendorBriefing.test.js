process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';
// The AI client is mocked, NOT disabled. Deleting GEMINI_API_KEY here does not
// work: requiring src/index loads dotenv, which repopulates it, and the suite
// would then make real >5s network calls to Gemini and time out.
const FAKE_DRAFT = 'Attend Block 128. Droppings and a live sighting were recorded at the refuse chute; severity is critical. Feeding activity at this block is co-occurrence worth investigating.';
jest.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() { this.models = { generateContent: async () => ({ text: FAKE_DRAFT }) }; }
  },
}));

jest.mock('../../src/services/emailService', () => ({
  sendEmail: jest.fn(async ({ to }) => {
    if (String(to).includes('broken')) throw new Error('SMTP 550 mailbox unavailable');
    return { ok: true, stubbed: true };
  }),
  hasMailer: () => false,
}));

const request = require('supertest');
const app = require('../../src/index');
const { sequelize, RodentAssessment, FaunaSighting, NotificationLog, User } = require('../../src/models');
const { draftBriefing, stubBriefing } = require('../../src/services/vendorBriefing');

let adminToken, staffToken, residentToken, adminId;
async function registerAndLogin(name, email, role) {
  await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}

let critIds = [];
let lowIds = [];

beforeAll(async () => {
  await sequelize.sync({ force: true });
  adminToken = await registerAndLogin('Admin', 'vb-admin@test.com', 'manager');
  staffToken = await registerAndLogin('Officer', 'vb-staff@test.com', 'field_officer');
  residentToken = await registerAndLogin('Res', 'vb-res@test.com', 'resident');
  adminId = (await User.findOne({ where: { email: 'vb-admin@test.com' } })).id;

  const crit = await RodentAssessment.bulkCreate([
    { block_number: 'Block 128', floor_level: 'L1', observations: 'Live sighting by the refuse chute', risk_level: 'critical', escalate_to_contractor: true, assessed_by: adminId },
    { block_number: 'Block 128', floor_level: 'L1', observations: 'Burrow opening beside the bin centre', risk_level: 'high', escalate_to_contractor: true, assessed_by: adminId },
  ]);
  critIds = crit.map(a => a.id);

  const low = await RodentAssessment.bulkCreate([
    { block_number: 'Block 500', observations: 'A few droppings on the corridor', risk_level: 'low', assessed_by: adminId },
  ]);
  lowIds = low.map(a => a.id);

  // feeding at the same block, so co-occurrence context is exercised
  await FaunaSighting.bulkCreate([
    { species: 'cat', block_number: '128', behaviour_tags: ['feeding'], status: 'open', notes: 'Food bowls at the void deck', reported_by: adminId },
    { species: 'pigeon', block_number: '128', behaviour_tags: ['feeding'], status: 'open', notes: 'Bread near the bin centre', reported_by: adminId },
  ]);
});
afterAll(async () => { await sequelize.close(); });

describe('draftBriefing - provenance is never ambiguous', () => {
  const ctx = { block_number: 'Block 128', risk_level: 'critical' };
  const items = [{ id: 1, createdAt: new Date(), risk_level: 'critical', observations: 'Live sighting', floor_level: 'L1' }];

  test('a real AI draft is not flagged as a template', async () => {
    const r = await draftBriefing(ctx, items);
    expect(r.stubbed).toBe(false);
    expect(r.text).toBeTruthy();
    expect(r.aiFailed).toBeUndefined();
  });

  test('the no-key template restates only recorded facts', () => {
    // stubBriefing is the no-API-key path, tested directly: it is a pure
    // function, so it needs no client and cannot make a network call.
    const text = stubBriefing(ctx, items);
    expect(text).toContain('Block 128');
    expect(text).toContain('Live sighting');
    expect(text).not.toMatch(/\bunit \d|access code|contact/i);
  });

  test('absent detail is written as "not recorded", never invented', () => {
    // same report with NO floor_level, which is the case that must not be filled in
    const noFloor = [{ ...items[0], floor_level: null }];
    const text = stubBriefing({ block_number: 'Block 128' }, noFloor);
    expect(text).toMatch(/Locations reported: not recorded/);
    expect(text).toMatch(/Severity: not recorded/);   // ctx carries no risk_level here
  });

  test('with no assessments it refuses rather than inventing a subject', async () => {
    const r = await draftBriefing(ctx, []);
    expect(r.error).toMatch(/no assessments/i);
    expect(r.text).toBeUndefined();
  });

  test('the template states feeding as co-occurrence, never as a cause', () => {
    const text = stubBriefing(ctx, items, { sightings: 2, species: 'cat' });
    expect(text).toMatch(/co-occurrence worth investigating/i);
    expect(text).not.toMatch(/caused by|because of|due to the feeding/i);
  });
});

describe('POST /api/work-orders/briefing/draft', () => {
  test('drafts from assessment ids with no work order in existence', async () => {
    const res = await request(app).post('/api/work-orders/briefing/draft')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: critIds });

    expect(res.status).toBe(200);
    expect(res.body.draft).toBeTruthy();
    expect(res.body.block).toBe('Block 128');
    expect(res.body.risk_level).toBe('critical');   // highest of the set
    expect(res.body.assessment_ids.sort()).toEqual([...critIds].sort());
    // nothing was created or sent
    expect(res.body.draft_only).toBe(true);
  });

  test('surfaces co-occurring feeding as context, labelled as co-occurrence', async () => {
    const res = await request(app).post('/api/work-orders/briefing/draft')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: critIds });
    expect(res.body.feeding.sightings).toBe(2);
    expect(res.body.feeding.species).toMatch(/cat|pigeon/);
    // the prompt carries the co-occurrence constraint; the template path is
    // asserted directly above, and the wording is checked in stubBriefing
  });

  test('drafting creates no work order - the financial act stays separate', async () => {
    const { WorkOrder } = require('../../src/models');
    const before = await WorkOrder.count();
    await request(app).post('/api/work-orders/briefing/draft')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: critIds });
    expect(await WorkOrder.count()).toBe(before);
  });

  test('drafting sends nothing - no notification row is written', async () => {
    const before = await NotificationLog.count();
    await request(app).post('/api/work-orders/briefing/draft')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: critIds });
    expect(await NotificationLog.count()).toBe(before);
  });

  test('unknown ids -> 404 rather than an empty briefing', async () => {
    const res = await request(app).post('/api/work-orders/briefing/draft')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: [999999] });
    expect(res.status).toBe(404);
  });

  test('the high/critical gate is a UI affordance, not a server rule', async () => {
    // The popup hides the action for low/medium clusters to avoid nudging
    // officers into needless escalations. The endpoint itself still serves an
    // explicit request - the gate is about noise, not authorisation, and
    // pretending otherwise would be a security boundary that is not one.
    const res = await request(app).post('/api/work-orders/briefing/draft')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: lowIds });
    expect(res.status).toBe(200);
    expect(res.body.risk_level).toBe('low');
  });

  test('the council comes from a reported coordinate, never a default', async () => {
    // these fixtures carry no gps, so no council may be asserted
    const res = await request(app).post('/api/work-orders/briefing/draft')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: critIds });
    expect(res.status).toBe(200);
    expect(res.body.draft).not.toMatch(/Ang Mo Kio Town Council/);
  });

  test('a resident cannot draft', async () => {
    const res = await request(app).post('/api/work-orders/briefing/draft')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ assessment_ids: critIds });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/work-orders/briefing/send - real status only', () => {
  test('sends the officer-edited body and logs it as sent', async () => {
    const edited = 'OFFICER EDITED: attend Block 128 refuse chute, critical rodent activity confirmed.';
    const before = await NotificationLog.count();

    const res = await request(app).post('/api/work-orders/briefing/send')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ body: edited, block: 'Block 128', risk_level: 'critical', assessment_ids: critIds });

    expect(res.status).toBe(200);
    expect(res.body.delivered).toBe(true);
    expect(res.body.sent_at).toBeTruthy();
    expect(await NotificationLog.count()).toBe(before + 1);

    // the EDITED text is what was logged, not a server-regenerated draft
    const log = await NotificationLog.findOne({ where: { source_type: 'vendor_briefing' }, order: [['createdAt', 'DESC']] });
    expect(log.body).toBe(edited);
    expect(log.status).toBe('sent');
  });

  test('a failed send reports failed and carries no sent_at', async () => {
    const res = await request(app).post('/api/work-orders/briefing/send')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ body: 'Attend the site as described in this briefing.', recipient: 'broken@test.com', block: 'Block 128' });

    expect(res.status).toBe(200);          // the attempt is a real logged event
    expect(res.body.delivered).toBe(false);
    expect(res.body.status).toBe('failed');
    expect(res.body.sent_at).toBeNull();   // never a timestamp for a send that failed
    expect(res.body.error_reason).toMatch(/SMTP 550/);

    const log = await NotificationLog.findOne({ where: { recipient: 'broken@test.com' }, order: [['createdAt', 'DESC']] });
    expect(log.status).toBe('failed');
  });

  test('an empty or trivial body is refused', async () => {
    const res = await request(app).post('/api/work-orders/briefing/send')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ body: 'too short' });
    expect(res.status).toBe(400);
  });

  test('a resident cannot send', async () => {
    const res = await request(app).post('/api/work-orders/briefing/send')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ body: 'Attend the site as described in this briefing.' });
    expect(res.status).toBe(403);
  });
});

describe('raising the work order stays the admin-only financial gate', () => {
  test('staff who drafted a briefing still cannot raise the order', async () => {
    const res = await request(app).post('/api/work-orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ assessment_ids: critIds });
    expect(res.status).toBe(403);
  });

  test('admin can raise it from the same assessment ids', async () => {
    const res = await request(app).post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assessment_ids: critIds });
    expect(res.status).toBe(201);
    expect(res.body.consolidated_count).toBe(2);
    expect(res.body.risk_level).toBe('critical');
  });
});
