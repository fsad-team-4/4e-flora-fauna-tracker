process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/config/mailer', () => ({
  sendMail: jest.fn(),
  getTransporter: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/index');
const { sequelize, User } = require('../../src/models');

let officerToken;

function listBlock(block) {
  return request(app)
    .get(`/api/fauna/hotspots/${encodeURIComponent(block)}/sightings`)
    .set('Authorization', officerToken);
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await User.create({
    name: 'Officer Tan',
    email: 'field_officer@example.com',
    password_hash: await bcrypt.hash('secret1', 10),
    role: 'field_officer',
  });
  const res = await request(app).post('/api/auth/login')
    .send({ email: 'field_officer@example.com', password: 'secret1' });
  officerToken = `Bearer ${res.body.token}`;

  // Notes mention nesting but only 'feeding' is tagged - the mismatch the hint exists to surface.
  await request(app).post('/api/fauna').set('Authorization', officerToken).send({
    species: 'crow',
    block_number: 'Block 203',
    behaviour_tags: ['feeding'],
    notes: 'Crows NESTING on the rooftop, residents also feeding them',
  });
  // Notes mention a tag it already carries - not a mention worth flagging.
  await request(app).post('/api/fauna').set('Authorization', officerToken).send({
    species: 'cat',
    block_number: 'Block 203',
    behaviour_tags: ['aggressive'],
    notes: 'Cat was aggressive towards a resident',
  });
  // No notes at all.
  await request(app).post('/api/fauna').set('Authorization', officerToken).send({
    species: 'pigeon',
    block_number: 'Block 203',
  });
  // Different block - must not appear in the Block 203 list.
  await request(app).post('/api/fauna').set('Authorization', officerToken).send({
    species: 'mynah',
    block_number: 'Block 115',
  });
});

afterAll(async () => { await sequelize.close(); });

test('returns the sightings for the block, newest first, with reporter name', async () => {
  const res = await listBlock('Block 203');
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(3);
  expect(res.body.map((s) => s.species)).toEqual(['pigeon', 'cat', 'crow']);
  expect(res.body.every((s) => s.block_number === 'Block 203')).toBe(true);
  expect(res.body[0].reporter.name).toBe('Officer Tan');
  expect(res.body[0].createdAt).toBeDefined();
});

test('untagged_mentions flags a keyword in notes that is not in behaviour_tags', async () => {
  const res = await listBlock('Block 203');
  const crow = res.body.find((s) => s.species === 'crow');
  expect(crow.untagged_mentions).toEqual(['nesting']);
  // 'feeding' is mentioned in the notes but already tagged, so it is not flagged.
  expect(crow.behaviour_tags).toEqual(['feeding']);
});

test('a keyword already in behaviour_tags is not flagged', async () => {
  const res = await listBlock('Block 203');
  const cat = res.body.find((s) => s.species === 'cat');
  expect(cat.untagged_mentions).toEqual([]);
});

test('empty notes give an empty untagged_mentions array', async () => {
  const res = await listBlock('Block 203');
  const pigeon = res.body.find((s) => s.species === 'pigeon');
  expect(pigeon.untagged_mentions).toEqual([]);
});
