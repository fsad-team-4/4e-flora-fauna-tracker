# Auth System - Test Cases (Member 3 / Klemens)

Tested with Jest + Supertest against the Express app, using an isolated
in-memory SQLite database (`sqlite::memory:`, `sync({ force: true })`) so the
dev database is never touched. File: `auth.test.js`.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 1 | POST /api/auth/register | Valid registration (happy path) | name "Klemens", valid email, password >= 6 chars | 201; body has `user_id`, `name`, `email`, `role: resident`; no `password_hash` returned |
| 2 | POST /api/auth/register | Duplicate email | Re-register the same email from test 1 | 400 (email already registered) |
| 3 | POST /api/auth/register | Invalid input | Bad email format + password too short ("12") | 400 (yup validation failure) |
| 4 | POST /api/auth/login | Correct credentials (happy path) | Email + password from test 1 | 200; body has a JWT `token` (string) |
| 5 | POST /api/auth/login | Wrong password | Valid email, wrong password | 401; generic message, does not reveal which field was wrong |

## Notes

- Tests 1, 2, and 4 share state intentionally: test 1 creates the user that
  tests 2 (duplicate) and 4 (login) depend on. They run in file order.
- Passwords are hashed with bcryptjs before storage; the hash is never returned
  by the API.
- Login does not distinguish "unknown email" from "wrong password" - both
  return the same 401 so the API does not leak which accounts exist.
