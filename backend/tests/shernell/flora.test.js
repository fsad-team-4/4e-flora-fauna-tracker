// Use an isolated in-memory SQLite DB so tests never touch the dev database.
// These must be set BEFORE requiring the app (config/database.js reads them at load).
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Mock the mailer so the health-alert email never makes a real SMTP/network
// call. jest.mock is hoisted above the requires below, so floraController
// receives this stub when it loads.
jest.mock('../../src/config/mailer', () => ({
  sendMail: jest.fn(),
  getTransporter: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/index');
const { sequelize, User } = require('../../src/models');
const { sendMail } = require('../../src/config/mailer');

// sendHealthAlert is fire-and-forget: the response returns before its DB query
// and sendMail call settle, so give pending microtasks a moment to flush.
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

const tokens = {};
let floraId;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  const accounts = [
    ['staff', 'field_officer'],
    ['res1', 'resident'],
  ];
  for (const [key, role] of accounts) {
    if (role === 'resident') {
      await request(app)
        .post('/api/auth/register')
        .send({ name: key, email: `${key}@example.com`, password: 'secret1', role });
    } else {
      // Public registration always creates residents - seed staff/admin directly.
      await User.create({
        name: key,
        email: `${key}@example.com`,
        password_hash: await bcrypt.hash('secret1', 10),
        role,
      });
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `${key}@example.com`, password: 'secret1' });
    tokens[key] = `Bearer ${res.body.token}`;
  }
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/flora', () => {
  test('staff creates plant -> 201, recorded_by from token (body spoof ignored)', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({
        species: 'Ficus benjamina',
        common_name: 'Weeping fig',
        location_zone: 'Block A',
        health_status: 'healthy',
        recorded_by: 999,
      });

    expect(res.status).toBe(201);
    expect(res.body.recorded_by).toBe(1);
    expect(res.body.recorded_by).not.toBe(999);
    floraId = res.body.id;
  });

  test('missing species -> 400', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ common_name: 'No species given' });

    expect(res.status).toBe(400);
  });

  test('invalid health_status -> 400', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Bougainvillea', health_status: 'dying' });

    expect(res.status).toBe(400);
  });

  test('resident attempts create -> 403', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.res1)
      .send({ species: 'Hibiscus' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/flora', () => {
  beforeAll(async () => {
    // A critical record so the health_status filter is observable.
    await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Palm', health_status: 'critical' });
  });

  test('returns created records', async () => {
    const res = await request(app).get('/api/flora').set('Authorization', tokens.staff);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r) => r.id === floraId)).toBe(true);
  });

  test('?health_status=critical returns only critical ones', async () => {
    const res = await request(app)
      .get('/api/flora?health_status=critical')
      .set('Authorization', tokens.staff);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((r) => r.health_status === 'critical')).toBe(true);
  });

  test('resident attempts list -> 403', async () => {
    const res = await request(app).get('/api/flora').set('Authorization', tokens.res1);

    expect(res.status).toBe(403);
  });
});

describe('Horticulture Handbook - botanical catalog fields', () => {
  let handbookId;
  let bougainvilleaId;

  test('create with botanical fields -> 201, fields saved as sent', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({
        species: 'Ixora chinensis',
        plant_family: 'Rubiaceae',
        site_suitability: 'Full sun, well-drained soil',
        color: 'red',
        max_height_at_maturity: 2.5,
      });

    expect(res.status).toBe(201);
    expect(res.body.plant_family).toBe('Rubiaceae');
    expect(res.body.site_suitability).toBe('Full sun, well-drained soil');
    expect(res.body.color).toBe('red');
    expect(res.body.max_height_at_maturity).toBe(2.5);
    handbookId = res.body.id;
  });

  test('negative max_height_at_maturity -> 400', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Bad Height Plant', max_height_at_maturity: -5 });

    expect(res.status).toBe(400);
  });

  test('clearing max_height_at_maturity on update -> null, not left unchanged', async () => {
    const res = await request(app)
      .patch(`/api/flora/${handbookId}`)
      .set('Authorization', tokens.staff)
      .send({ max_height_at_maturity: '' });

    expect(res.status).toBe(200);
    expect(res.body.max_height_at_maturity).toBeNull();
  });

  test('?plant_family= partial match returns only matching records', async () => {
    const other = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Bougainvillea glabra', plant_family: 'Nyctaginaceae', color: 'purple' });
    bougainvilleaId = other.body.id;

    const res = await request(app)
      .get('/api/flora?plant_family=Rubi')
      .set('Authorization', tokens.staff);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((r) => (r.plant_family || '').includes('Rubi'))).toBe(true);
  });

  test('?color= exact match returns only matching records', async () => {
    const res = await request(app)
      .get('/api/flora?color=red')
      .set('Authorization', tokens.staff);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((r) => r.color === 'red')).toBe(true);
    expect(res.body.some((r) => r.id === bougainvilleaId)).toBe(false);
  });

  test('create with location and location_zone set to different values -> both saved', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({
        species: 'Tembusu',
        location: 'Bishan Park',
        location_zone: 'Block A',
      });

    expect(res.status).toBe(201);
    expect(res.body.location).toBe('Bishan Park');
    expect(res.body.location_zone).toBe('Block A');
  });
});

describe('GET /api/flora?location=', () => {
  let bishanId;

  test('partial match returns only matching records', async () => {
    const bishan = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Rain tree', location: 'Bishan Park' });
    bishanId = bishan.body.id;

    const other = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Angsana', location: 'Toa Payoh Central' });

    const res = await request(app)
      .get('/api/flora?location=Bishan')
      .set('Authorization', tokens.staff);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((r) => (r.location || '').includes('Bishan'))).toBe(true);
    expect(res.body.some((r) => r.id === other.body.id)).toBe(false);
  });

  test('case-insensitive match: location "Bishan" found by ?location=bishan', async () => {
    const res = await request(app)
      .get('/api/flora?location=bishan')
      .set('Authorization', tokens.staff);

    expect(res.status).toBe(200);
    expect(res.body.some((r) => r.id === bishanId)).toBe(true);
  });
});

describe('PATCH /api/flora/:id', () => {
  test('staff updates health_status -> 200 with updated value', async () => {
    const res = await request(app)
      .patch(`/api/flora/${floraId}`)
      .set('Authorization', tokens.staff)
      .send({ health_status: 'at_risk' });

    expect(res.status).toBe(200);
    expect(res.body.health_status).toBe('at_risk');
  });

  test('non-existent id -> 404', async () => {
    const res = await request(app)
      .patch('/api/flora/999')
      .set('Authorization', tokens.staff)
      .send({ health_status: 'healthy' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/flora/:id', () => {
  test('staff soft-deletes -> 200, record no longer appears in GET', async () => {
    const created = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Fern to delete' });
    const deleteId = created.body.id;

    const del = await request(app)
      .delete(`/api/flora/${deleteId}`)
      .set('Authorization', tokens.staff);
    expect(del.status).toBe(200);

    const list = await request(app).get('/api/flora').set('Authorization', tokens.staff);
    expect(list.body.some((r) => r.id === deleteId)).toBe(false);
  });
});

describe('POST /api/flora/bulk', () => {
  test('CSV with 2 valid rows and 1 invalid row -> 201, created: 2 and 1 row error', async () => {
    const csv = [
      'species,common_name,location_zone,health_status',
      'Rain tree,Samanea saman,Block B,healthy',
      'Frangipani,Plumeria,Block C,at_risk',
      'Broken plant,Bad row,Block D,dying',
    ].join('\n');

    const res = await request(app)
      .post('/api/flora/bulk')
      .set('Authorization', tokens.staff)
      .attach('file', Buffer.from(csv), 'flora.csv');

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.errors).toHaveLength(1);
  });

  test('CSV with location column -> created record has location saved', async () => {
    const csv = [
      'species,common_name,location,health_status',
      'Angsana,Pterocarpus indicus,Bishan Park,healthy',
    ].join('\n');

    const res = await request(app)
      .post('/api/flora/bulk')
      .set('Authorization', tokens.staff)
      .attach('file', Buffer.from(csv), 'flora-location.csv');

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);

    const list = await request(app)
      .get('/api/flora?location=Bishan')
      .set('Authorization', tokens.staff);
    expect(list.body.some((r) => r.species === 'Angsana' && r.location === 'Bishan Park')).toBe(true);
  });
});

describe('POST /api/flora/:id/care-recommendation', () => {
  test('with GEMINI_API_KEY unset -> 503 AI service not configured', async () => {
    delete process.env.GEMINI_API_KEY;

    const res = await request(app)
      .post(`/api/flora/${floraId}/care-recommendation`)
      .set('Authorization', tokens.staff);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI service not configured');
  });
});

describe('Health-alert email', () => {
  beforeEach(() => {
    sendMail.mockClear();
  });

  test('create with health_status critical -> sendMail called', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Sick Palm', health_status: 'critical' });
    await flush();

    expect(res.status).toBe(201);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test('create with health_status healthy -> sendMail NOT called', async () => {
    const res = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Happy Fern', health_status: 'healthy' });
    await flush();

    expect(res.status).toBe(201);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('update healthy -> at_risk (fresh transition) -> sendMail called', async () => {
    const created = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Fig', health_status: 'healthy' });
    await flush();
    sendMail.mockClear();

    const res = await request(app)
      .patch(`/api/flora/${created.body.id}`)
      .set('Authorization', tokens.staff)
      .send({ health_status: 'at_risk' });
    await flush();

    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test('update at_risk -> at_risk (no change) -> sendMail NOT called', async () => {
    const created = await request(app)
      .post('/api/flora')
      .set('Authorization', tokens.staff)
      .send({ species: 'Shrub', health_status: 'at_risk' });
    await flush();
    sendMail.mockClear();

    const res = await request(app)
      .patch(`/api/flora/${created.body.id}`)
      .set('Authorization', tokens.staff)
      .send({ health_status: 'at_risk' });
    await flush();

    expect(res.status).toBe(200);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
