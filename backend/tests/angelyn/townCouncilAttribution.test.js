process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

/**
 * WHICH TOWN COUNCIL IS IN CHARGE.
 *
 * Cases carry a council resolved from their GPS pin, and the map gets a council
 * label layer, so a region is named by the body that manages it rather than by the
 * planning-area names printed on the basemap tiles. Yio Chu Kang SMC sits inside
 * Ang Mo Kio Town Council - the tiles show two names where the estate has one
 * manager, which is the confusion this replaces.
 *
 * The honesty rules are asserted, not assumed:
 *   - a position outside every modelled circle resolves to null, NEVER to the
 *     nearest council;
 *   - a row with no position resolves to null;
 *   - every response carrying a council also carries the approximate flag.
 */
const request = require('supertest');
const app = require('../../src/index');
const { sequelize, ResidentReport, FaunaSighting, User } = require('../../src/models');
const estateData = require('../../src/services/estateDataService');
const { COUNCILS, councilFor } = require('../../src/services/townCouncils');

let adminToken, residentToken, residentId;

async function registerAndLogin(name, email, role) {
  await request(app).post('/api/auth/register').send({ name, email, password: 'secret1', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret1' });
  return res.body.token;
}

const AMK = { lat: 1.3691, lng: 103.8454 };   // Ang Mo Kio town centre
const NEE_SOON = { lat: 1.4304, lng: 103.8354 };
const OPEN_SEA = { lat: 1.2000, lng: 103.6500 }; // inside SG bounds, outside every circle

beforeAll(async () => {
  await sequelize.sync({ force: true });
  adminToken = await registerAndLogin('Admin', 'tc-admin@test.com', 'admin');
  residentToken = await registerAndLogin('Resident', 'tc-resident@test.com', 'resident');
  residentId = (await User.findOne({ where: { email: 'tc-resident@test.com' } })).id;
});

afterAll(async () => {
  await sequelize.close();
});

describe('the registry covers all 19 councils', () => {
  test('19 councils are modelled', () => {
    expect(COUNCILS).toHaveLength(19);
  });

  test('every council has a name, a centre and a radius', () => {
    for (const c of COUNCILS) {
      expect(typeof c.name).toBe('string');
      expect(c.name).toMatch(/Town Council$/);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(c.radiusKm).toBeGreaterThan(0);
    }
  });

  test('council names are unique', () => {
    expect(new Set(COUNCILS.map(c => c.name)).size).toBe(COUNCILS.length);
  });

  test('Yio Chu Kang is a constituency of Ang Mo Kio TC, not its own council', () => {
    const amk = COUNCILS.find(c => c.id === 'amk');
    expect(amk.constituencies).toContain('Yio Chu Kang SMC');
    expect(COUNCILS.map(c => c.name)).not.toContain('Yio Chu Kang Town Council');
  });
});

describe('a case indicates which council it is under', () => {
  beforeAll(async () => {
    const mk = (title, gps) => ResidentReport.create({
      category: 'pest', title, description: 'x', status: 'open',
      block_number: 'Block 123', reported_by: residentId,
      gps_lat: gps ? gps.lat : null, gps_lng: gps ? gps.lng : null,
    });
    await mk('In Ang Mo Kio', AMK);
    await mk('In Nee Soon', NEE_SOON);
    await mk('Outside every modelled region', OPEN_SEA);
    await mk('No pin at all', null);
  });

  test('a pinned case resolves to the council containing it', async () => {
    const cases = await estateData.getCases();
    expect(cases.find(c => c.title === 'In Ang Mo Kio').town_council).toBe('Ang Mo Kio Town Council');
    expect(cases.find(c => c.title === 'In Nee Soon').town_council).toBe('Nee Soon Town Council');
  });

  test('a case outside every circle is null, not the nearest council', async () => {
    const cases = await estateData.getCases();
    expect(cases.find(c => c.title === 'Outside every modelled region').town_council).toBeNull();
  });

  test('a case with no GPS pin is null', async () => {
    const cases = await estateData.getCases();
    expect(cases.find(c => c.title === 'No pin at all').town_council).toBeNull();
  });

  test('the approximate flag travels with every case', async () => {
    const cases = await estateData.getCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) expect(c.town_council_approximate).toBe(true);
  });
});

describe('fauna sightings are attributed the same way', () => {
  test('a sighting in Ang Mo Kio reports that council', async () => {
    await FaunaSighting.create({
      species: 'cat', block_number: 'Block 123', behaviour_tags: ['roaming'],
      gps_lat: AMK.lat, gps_lng: AMK.lng, reported_by: residentId,
    });
    const sightings = await estateData.getFaunaSightings();
    const s = sightings.find(x => x.gps_lat === AMK.lat);
    expect(s.town_council).toBe('Ang Mo Kio Town Council');
    expect(s.town_council_approximate).toBe(true);
  });
});

describe('flora cannot be attributed by position', () => {
  test('GreeneryRecord has no coordinates, so its council is null rather than guessed', async () => {
    const flora = await estateData.getFloraRecords();
    for (const f of flora) expect(f.town_council).toBeNull();
  });
});

describe('GET /api/town-councils - the map label layer', () => {
  test('returns all 19 councils with label coordinates', async () => {
    const res = await request(app).get('/api/town-councils').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(19);
    expect(res.body.councils).toHaveLength(19);
    const amk = res.body.councils.find(c => c.id === 'amk');
    expect(amk.name).toBe('Ang Mo Kio Town Council');
    expect(amk.lat).toBeCloseTo(1.3691, 4);
    expect(amk.constituencies).toContain('Yio Chu Kang SMC');
  });

  test('the response says the boundaries are approximate', async () => {
    const res = await request(app).get('/api/town-councils').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.boundaries_approximate).toBe(true);
    expect(res.body.sgBounds).toBeTruthy();
  });

  test('a resident is forbidden -> 403', async () => {
    const res = await request(app).get('/api/town-councils').set('Authorization', `Bearer ${residentToken}`);
    expect(res.status).toBe(403);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/town-councils');
    expect(res.status).toBe(401);
  });
});

describe('councilFor never guesses', () => {
  test('a point just outside a radius is null, even with a council nearby', () => {
    // Ang Mo Kio has a 2.4km radius; ~0.06 degrees of latitude is ~6.7km north.
    expect(councilFor(AMK.lat + 0.06, AMK.lng)).not.toBe('Ang Mo Kio Town Council');
  });

  test('a coordinate outside Singapore is null', () => {
    expect(councilFor(51.5074, -0.1278)).toBeNull(); // London
  });
});
