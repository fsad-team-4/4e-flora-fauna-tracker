process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

/**
 * THE PROOF THAT THE DASHBOARD READS THE DATABASE.
 *
 * The dashboard used to compute its KPIs from mockDataService - three hardcoded
 * arrays - so every number was a constant and no amount of real data could change
 * it. dashboard.test.js only ever asserted that the fields exist and are numbers,
 * which passed either way and so could not catch that.
 *
 * This suite closes that hole. It writes the documented test dataset from
 * src/testData.js into the real GreeneryRecord / FaunaSighting / ResidentReport
 * tables and asserts the exact KPI values that dataset implies. If anyone wires a
 * KPI back to a constant, the numbers stop matching the rows and this fails.
 */
const request = require('supertest');
const app = require('../../src/index');
const { sequelize, GreeneryRecord, FaunaSighting, ResidentReport } = require('../../src/models');
const { writeTestData, EXPECTED, ACCOUNTS } = require('../../src/testData');

let adminToken;

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await writeTestData();

  // testData.js creates the accounts, so log in as the one it made rather than
  // registering another.
  const admin = ACCOUNTS.find(a => a.role === 'admin');
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: 'local-demo-only' });
  adminToken = res.body.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('test data lands in the real tables', () => {
  test('the three tables are populated, not empty', async () => {
    expect(await GreeneryRecord.count()).toBe(EXPECTED.totalFlora);
    expect(await FaunaSighting.count()).toBe(EXPECTED.totalSightings);
    expect(await ResidentReport.count()).toBe(EXPECTED.totalCases);
  });

  test('re-running is idempotent - no duplicate rows', async () => {
    await writeTestData();
    expect(await GreeneryRecord.count()).toBe(EXPECTED.totalFlora);
    expect(await FaunaSighting.count()).toBe(EXPECTED.totalSightings);
    expect(await ResidentReport.count()).toBe(EXPECTED.totalCases);
  });

  test('an admin account was created and can authenticate', () => {
    expect(adminToken).toBeTruthy();
  });
});

describe('GET /api/dashboard/metrics reflects the rows in the database', () => {
  let body;
  beforeAll(async () => {
    const res = await request(app)
      .get('/api/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    body = res.body;
  });

  test('flora health counts come from GreeneryRecord', () => {
    expect(body.criticalFlora).toBe(EXPECTED.criticalFlora);
    expect(body.atRiskFlora).toBe(EXPECTED.atRiskFlora);
  });

  test('case counts come from ResidentReport', () => {
    expect(body.openCases).toBe(EXPECTED.openCases);
    expect(body.casesByStatus).toMatchObject(EXPECTED.casesByStatus);
  });

  test('sighting total comes from FaunaSighting', () => {
    expect(body.totalSightings).toBe(EXPECTED.totalSightings);
  });

  test('Block 123 is the top hotspot - it carries the most sightings', () => {
    const top = body.sightingsByBlock?.[0] || body.hotspots?.[0];
    expect(top.block_number).toBe('Block 123');
  });
});

describe('the KPIs are not constants - they move with the data', () => {
  test('soft-deleting a critical plant lowers criticalFlora', async () => {
    const before = EXPECTED.criticalFlora;

    const critical = await GreeneryRecord.findOne({ where: { health_status: 'critical' } });
    await critical.update({ is_deleted: true });

    const res = await request(app)
      .get('/api/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.criticalFlora).toBe(before - 1);

    await critical.update({ is_deleted: false }); // restore for any later suite
  });

  test('adding an open case raises openCases', async () => {
    const before = EXPECTED.openCases;
    const resident = await ResidentReport.findOne();

    await ResidentReport.create({
      category: 'other',
      title: 'Extra open case for the KPI check',
      description: 'proves openCases is a live count',
      block_number: 'Block 999',
      status: 'open',
      reported_by: resident.reported_by,
    });

    const res = await request(app)
      .get('/api/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.openCases).toBe(before + 1);
  });
});
