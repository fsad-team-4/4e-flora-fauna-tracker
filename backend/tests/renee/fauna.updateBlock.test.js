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

// A blockless sighting, as auto-created from a GPS-only resident report.
async function blocklessSighting(reportedBy, block = null) {
  return FaunaSighting.create({
    species: 'cat',
    block_number: block,
    gps_lat: 1.38872,
    gps_lng: 103.90379,
    notes: 'Cat at the void deck, no block recorded',
    reported_by: reportedBy,
  });
}

let officerId;

beforeAll(async () => {
  await sequelize.sync({ force: true });
  for (const [key, role] of [['officer', 'field_officer'], ['partner', 'welfare_partner']]) {
    const user = await User.create({
      name: key,
      email: `${key}@example.com`,
      password_hash: await bcrypt.hash('secret1', 10),
      role,
    });
    if (role === 'field_officer') officerId = user.id;
    const res = await request(app).post('/api/auth/login')
      .send({ email: `${key}@example.com`, password: 'secret1' });
    tokens[key] = `Bearer ${res.body.token}`;
  }
});

afterAll(async () => { await sequelize.close(); });

test('field officer sets a block on a blockless sighting', async () => {
  const sighting = await blocklessSighting(officerId);

  const res = await request(app).patch(`/api/fauna/${sighting.id}/block`)
    .set('Authorization', tokens.officer)
    .send({ block_number: 'Block 305' });

  expect(res.status).toBe(200);
  expect(res.body.block_number).toBe('Block 305');

  await sighting.reload();
  expect(sighting.block_number).toBe('Block 305');
});

test('value is trimmed before it is stored', async () => {
  const sighting = await blocklessSighting(officerId);

  const res = await request(app).patch(`/api/fauna/${sighting.id}/block`)
    .set('Authorization', tokens.officer)
    .send({ block_number: '  Block 306  ' });

  expect(res.status).toBe(200);
  expect(res.body.block_number).toBe('Block 306');
});

test('a sighting stored with an empty-string block is still eligible', async () => {
  // Rows written before block normalisation carry '' rather than null.
  const sighting = await blocklessSighting(officerId, '');

  const res = await request(app).patch(`/api/fauna/${sighting.id}/block`)
    .set('Authorization', tokens.officer)
    .send({ block_number: 'Block 307' });

  expect(res.status).toBe(200);
  expect(res.body.block_number).toBe('Block 307');
});

test('welfare partner is forbidden, including on a sighting that has a block', async () => {
  const sighting = await blocklessSighting(officerId);

  const res = await request(app).patch(`/api/fauna/${sighting.id}/block`)
    .set('Authorization', tokens.partner)
    .send({ block_number: 'Block 305' });

  expect(res.status).toBe(403);

  await sighting.reload();
  expect(sighting.block_number).toBeNull();
});

test('an already-set block number can be changed to a new value', async () => {
  const sighting = await blocklessSighting(officerId, 'Block 101');

  const res = await request(app).patch(`/api/fauna/${sighting.id}/block`)
    .set('Authorization', tokens.officer)
    .send({ block_number: 'Block 999' });

  expect(res.status).toBe(200);
  expect(res.body.block_number).toBe('Block 999');

  await sighting.reload();
  expect(sighting.block_number).toBe('Block 999');
});

test('changing a block moves the sighting between hotspot buckets', async () => {
  const sighting = await blocklessSighting(officerId, 'Block 201');

  await request(app).patch(`/api/fauna/${sighting.id}/block`)
    .set('Authorization', tokens.officer)
    .send({ block_number: 'Block 202' });

  const res = await request(app).get('/api/fauna/hotspots')
    .set('Authorization', tokens.officer);

  const from = res.body.find((h) => h.block_number === 'Block 201');
  const to = res.body.find((h) => h.block_number === 'Block 202');
  expect(from).toBeUndefined();
  expect(to.total).toBe(1);
});

test('whitespace-only block_number rejected 400', async () => {
  const sighting = await blocklessSighting(officerId);

  const res = await request(app).patch(`/api/fauna/${sighting.id}/block`)
    .set('Authorization', tokens.officer)
    .send({ block_number: '   ' });

  expect(res.status).toBe(400);

  await sighting.reload();
  expect(sighting.block_number).toBeNull();
});

test('missing block_number rejected 400', async () => {
  const sighting = await blocklessSighting(officerId);

  const res = await request(app).patch(`/api/fauna/${sighting.id}/block`)
    .set('Authorization', tokens.officer)
    .send({});

  expect(res.status).toBe(400);
});

test('unknown sighting id returns 404', async () => {
  const res = await request(app).patch('/api/fauna/99999/block')
    .set('Authorization', tokens.officer)
    .send({ block_number: 'Block 305' });

  expect(res.status).toBe(404);
  expect(res.body.error).toBe('Sighting not found');
});
