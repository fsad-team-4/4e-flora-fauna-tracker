process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/config/mailer', () => ({
  sendMail: jest.fn(),
  getTransporter: jest.fn(),
}));

// Never hit the real Gemini API or a real SMTP server in tests.
const mockGenerateContent = jest.fn();
jest.mock('../../src/config/gemini', () => ({
  getGeminiClient: () => ({ models: { generateContent: mockGenerateContent } }),
}));

jest.mock('../../src/services/emailService', () => ({
  sendEmail: jest.fn(async () => ({ ok: true })),
  hasMailer: jest.fn(() => false),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/index');
const { sequelize, User } = require('../../src/models');
const { sendEmail } = require('../../src/services/emailService');

let staffToken;

// Log `count` sightings into `block`, optionally tagging the first one.
async function seedBlock(block, count, tags = []) {
  for (let i = 0; i < count; i += 1) {
    const res = await request(app).post('/api/fauna')
      .set('Authorization', staffToken)
      .send({
        species: 'pigeon',
        block_number: block,
        behaviour_tags: i === 0 ? tags : [],
      });
    expect(res.status).toBe(201);
  }
}

function summaryOf(block) {
  return request(app)
    .get(`/api/fauna/hotspots/${encodeURIComponent(block)}/summary`)
    .set('Authorization', staffToken);
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await User.create({
    name: 'field_officer',
    email: 'field_officer@example.com',
    password_hash: await bcrypt.hash('secret1', 10),
    role: 'field_officer',
  });
  const res = await request(app).post('/api/auth/login')
    .send({ email: 'field_officer@example.com', password: 'secret1' });
  staffToken = `Bearer ${res.body.token}`;

  await seedBlock('Block High Volume', 8);
  await seedBlock('Block Aggressive', 2, ['aggressive']);
  await seedBlock('Block Nesting', 2, ['nesting']);
  await seedBlock('Block Medium Low', 4);
  await seedBlock('Block Medium High', 7);
  await seedBlock('Block Low', 3);
});

beforeEach(() => {
  mockGenerateContent.mockReset();
  mockGenerateContent.mockResolvedValue({ text: 'Subject: Fauna alert\n\nBody text here.' });
  sendEmail.mockClear();
});

afterAll(async () => { await sequelize.close(); });

describe('risk_level in GET /hotspots/:block/summary', () => {
  test('urgent when the block has 8 or more sightings', async () => {
    const res = await summaryOf('Block High Volume');
    expect(res.status).toBe(200);
    expect(res.body.sighting_count).toBe(8);
    expect(res.body.risk_level).toBe('urgent');
  });

  test('urgent when an aggressive tag is present despite low volume', async () => {
    const res = await summaryOf('Block Aggressive');
    expect(res.status).toBe(200);
    expect(res.body.sighting_count).toBe(2);
    expect(res.body.risk_level).toBe('urgent');
  });

  test('monitor when a nesting tag is present at low volume', async () => {
    const res = await summaryOf('Block Nesting');
    expect(res.status).toBe(200);
    expect(res.body.risk_level).toBe('monitor');
  });

  test('monitor at the lower boundary of 4 sightings', async () => {
    const res = await summaryOf('Block Medium Low');
    expect(res.body.risk_level).toBe('monitor');
  });

  test('monitor at the upper boundary of 7 sightings', async () => {
    const res = await summaryOf('Block Medium High');
    expect(res.body.risk_level).toBe('monitor');
  });

  test('routine below 4 sightings with no aggressive or nesting tag', async () => {
    const res = await summaryOf('Block Low');
    expect(res.body.risk_level).toBe('routine');
  });

  test('503 fallback is unchanged when Gemini fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('boom'));
    const res = await summaryOf('Block Low');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI summary unavailable. Please try again later.');
  });
});

describe('POST /hotspots/:block/alert-draft', () => {
  test('returns subject, body and risk_level', async () => {
    const res = await request(app)
      .post('/api/fauna/hotspots/Block%20High%20Volume/alert-draft')
      .set('Authorization', staffToken);
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Fauna alert');
    expect(res.body.body).toBe('Body text here.');
    expect(res.body.risk_level).toBe('urgent');
  });

  test('503 when Gemini fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .post('/api/fauna/hotspots/Block%20Low/alert-draft')
      .set('Authorization', staffToken);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI summary unavailable. Please try again later.');
  });
});

describe('POST /hotspots/:block/alert-send', () => {
  test('400 when to/subject/body are missing', async () => {
    const res = await request(app)
      .post('/api/fauna/hotspots/Block%20Low/alert-send')
      .set('Authorization', staffToken)
      .send({});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sends the edited draft via the shared email service', async () => {
    const payload = {
      to: 'ops@example.com',
      subject: 'Edited subject',
      body: 'Edited body\nsecond line',
    };
    const res = await request(app)
      .post('/api/fauna/hotspots/Block%20Low/alert-send')
      .set('Authorization', staffToken)
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledWith(payload);
  });
});
