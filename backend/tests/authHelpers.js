// angelyn
// TEST LOGIN HELPERS.
//
// WHY THESE EXIST. `POST /api/auth/register` used to accept a `role`, so every test made its
// privileged users through the public endpoint. Main closed that - public registration now
// always creates a `resident`, and the submitted role is ignored - which is the right call
// (self-assigning admin at a public endpoint is a real hole). But it silently demoted every
// test's admin and staff to resident, so 11 suites started failing on 403s that looked like
// route bugs rather than fixture bugs.
//
// `createAndLogin` seeds the row directly, which is the only honest way to get a privileged
// user now: the role is set by the system, not by a request. `registerAndLogin` stays for
// residents, because that IS the real signup path and a resident test should exercise it.
//
// SHARED RATHER THAN COPIED. Main's fix added a local copy of this helper to each file it
// touched, which is fine for three files and not for fourteen - the next auth change would
// have to be made in every one of them. Importing it means there is one place to change.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/index');
const { User } = require('../src/models');

const PASSWORD = 'secret1';

/** Seed a user at a given role and return their token. Use for staff and admin. */
async function createAndLogin(name, email, role) {
  await User.create({ name, email, password_hash: await bcrypt.hash(PASSWORD, 10), role });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.token;
}

/**
 * Register through the public endpoint and return the token.
 *
 * The `role` argument is accepted and deliberately ignored - the endpoint forces `resident`.
 * It is kept in the signature so existing call sites read unchanged, and so a test that
 * passes 'staff' here fails loudly on a 403 rather than quietly appearing to work.
 */
async function registerAndLogin(name, email, _role) {
  await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.token;
}

module.exports = { createAndLogin, registerAndLogin, TEST_PASSWORD: PASSWORD };
