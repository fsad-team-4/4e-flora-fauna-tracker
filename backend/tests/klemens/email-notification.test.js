// Mock the mailer so no real SMTP/Ethereal call happens - we only assert the
// controller's notification rule (email on 'resolved', not on other statuses).
jest.mock('../../src/config/mailer', () => ({
  sendMail: jest.fn(),
  getTransporter: jest.fn(),
}));

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/index');
const { sequelize, User } = require('../../src/models');
const { sendMail } = require('../../src/config/mailer');

let staffToken;
let reportId;
const RESIDENT_EMAIL = 'resident@example.com';

beforeAll(async () => {
  await sequelize.sync({ force: true });

  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Resident', email: RESIDENT_EMAIL, password: 'secret1' });
  // Public registration always creates residents - seed the staff account directly.
  await User.create({
    name: 'Staff',
    email: 'staff@example.com',
    password_hash: await bcrypt.hash('secret1', 10),
    role: 'staff',
  });

  const residentLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: RESIDENT_EMAIL, password: 'secret1' });
  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'staff@example.com', password: 'secret1' });
  staffToken = `Bearer ${staffLogin.body.token}`;

  const created = await request(app)
    .post('/api/reports')
    .set('Authorization', `Bearer ${residentLogin.body.token}`)
    .send({ category: 'pest', title: 'Ant infestation', description: 'Kitchen area' });
  reportId = created.body.id;
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(() => {
  sendMail.mockClear();
});

describe('Resolved-email notification', () => {
  test('status -> in_progress does NOT send an email', async () => {
    const res = await request(app)
      .patch(`/api/reports/${reportId}/status`)
      .set('Authorization', staffToken)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("status -> resolved sends an email to the reporter's address", async () => {
    const res = await request(app)
      .patch(`/api/reports/${reportId}/status`)
      .set('Authorization', staffToken)
      .send({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: RESIDENT_EMAIL })
    );
  });
});
