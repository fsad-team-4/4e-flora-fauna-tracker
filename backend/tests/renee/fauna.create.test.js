process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/config/mailer', () => ({
  sendMail: jest.fn(),
  getTransporter: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/index');
const { sequelize, FaunaSighting, User } = require('../../src/models');

const tokens = {};

beforeAll(async () => {
  await sequelize.sync({ force: true });
  for (const [key, role] of [['staff', 'field_officer'], ['res1', 'resident']]) {
    if (role === 'resident') {
      await request(app).post('/api/auth/register')
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
    const res = await request(app).post('/api/auth/login')
      .send({ email: `${key}@example.com`, password: 'secret1' });
    tokens[key] = `Bearer ${res.body.token}`;
  }
});

afterAll(async () => { await sequelize.close(); });

test('staff can POST a sighting with behaviour_tags', async () => {
  const res = await request(app).post('/api/fauna')
    .set('Authorization', tokens.staff)
    .send({
      species: 'crow',
      block_number: 'Block 203',
      floor_level: 'roof',
      behaviour_tags: ['nesting', 'aggressive'],
      gps_lat: 1.3521,
      gps_lng: 103.8198,
      notes: 'Crows nesting on rooftop',
    });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
  expect(res.body.species).toBe('crow');
  expect(res.body.behaviour_tags).toEqual(['nesting', 'aggressive']);
  expect(res.body.status).toBe('open');
  expect(res.body.reported_by).toBeDefined();

  const row = await FaunaSighting.findByPk(res.body.id);
  expect(row.behaviour_tags).toEqual(['nesting', 'aggressive']);
});

test('resident is forbidden', async () => {
  const res = await request(app).post('/api/fauna')
    .set('Authorization', tokens.res1)
    .send({ species: 'cat', block_number: 'Block 1' });
  expect(res.status).toBe(403);
});

test('invalid behaviour tag rejected 400', async () => {
  const res = await request(app).post('/api/fauna')
    .set('Authorization', tokens.staff)
    .send({ species: 'cat', block_number: 'Block 1', behaviour_tags: ['flying'] });
  expect(res.status).toBe(400);
});
