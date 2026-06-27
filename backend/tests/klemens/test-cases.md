# Auth + Resident Reports - Test Cases (Member 3 / Klemens)

Tested with Jest + Supertest against the Express app, using an isolated
in-memory SQLite database (`sqlite::memory:`, `sync({ force: true })`) so the
dev database is never touched. Files: `auth.test.js`, `reports.test.js`,
`email-notification.test.js`.

## Auth (`auth.test.js`)

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 1 | POST /api/auth/register | Valid registration (happy path) | name "Klemens", valid email, password >= 6 chars | 201; body has `user_id`, `name`, `email`, `role: resident`; no `password_hash` returned |
| 2 | POST /api/auth/register | Duplicate email | Re-register the same email from test 1 | 400 (email already registered) |
| 3 | POST /api/auth/register | Invalid input | Bad email format + password too short ("12") | 400 (yup validation failure) |
| 4 | POST /api/auth/login | Correct credentials (happy path) | Email + password from test 1 | 200; body has a JWT `token` (string) |
| 5 | POST /api/auth/login | Wrong password | Valid email, wrong password | 401; generic message, does not reveal which field was wrong |

## Resident Reports (`reports.test.js`)

Setup: registers and logs in two residents (res1, res2), one staff, and one
admin in `beforeAll`; res1 and res2 each create a report.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 6 | POST /api/reports | Resident creates report (happy path) | Valid category/title/description with `reported_by: 999` spoofed in body | 201; `reported_by` taken from the JWT (res1's id), body value ignored |
| 7 | POST /api/reports | Invalid category | `category: "bogus"` | 400 (yup validation failure) |
| 8 | GET /api/reports | Resident list scoping | res1 lists reports | 200; only res1's own report returned |
| 9 | GET /api/reports | Staff list scoping | staff lists reports | 200; all reports returned |
| 10 | GET /api/reports/:id | Resident views another resident's report | res2 requests res1's report | 403 |
| 11 | PATCH /api/reports/:id/status | Resident attempts status change | res1 patches status | 403 (restrictTo staff/admin) |
| 12 | PATCH /api/reports/:id/status | Staff changes status | staff sets `in_progress` | 200; exactly one CaseStatusLog created (open -> in_progress) |
| 13 | DELETE /api/reports/:id | Staff attempts delete | staff deletes report | 403 (restrictTo admin) |
| 14 | DELETE /api/reports/:id | Admin soft-deletes | admin deletes, then GET same id | DELETE 200; subsequent GET 404 |

## Resolved-Email Notification (`email-notification.test.js`)

`config/mailer` is mocked with `jest.fn()` so no real SMTP/Ethereal call is
made; the tests assert only the controller's notification rule. The actual email
delivery (Ethereal preview URL) is verified manually - see the Notes section.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 15 | PATCH /api/reports/:id/status | Non-resolved status change | staff sets `in_progress` | 200; `sendMail` is NOT called |
| 16 | PATCH /api/reports/:id/status | Resolved status change | staff sets `resolved` | 200; `sendMail` called once with `to` = the reporter's email |

## Image Upload (manual testing via Postman)

The `POST /api/uploads` endpoint streams the uploaded image to Cloudinary, an
external service. It has no automated jest tests because that would require
mocking the Cloudinary SDK; instead the cases below were verified manually with
Postman against a running server.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 17 | POST /api/uploads | Valid image upload (happy path) | Auth token + image file in field `image` | 200; body `{ url }` containing a Cloudinary `secure_url` |
| 18 | POST /api/uploads | No auth token | Image file, no Authorization header | 401 |
| 19 | POST /api/uploads | Wrong field name | Image file sent under a field other than `image` | 400 "Image must be sent in a field named 'image'" |
| 20 | POST /api/uploads | Non-image file | A `.txt` file in field `image` | 400 "Only JPEG, PNG, and WebP images are allowed" |
| 21 | POST /api/uploads | File over size limit | An image larger than 5MB in field `image` | 400 "Image must be 5MB or smaller" |
| 22 | POST /api/uploads | No file | Auth token, no file attached | 400 "No image file provided" |

## Notes

- Tests 1, 2, and 4 share state intentionally: test 1 creates the user that
  tests 2 (duplicate) and 4 (login) depend on. They run in file order.
- Passwords are hashed with bcryptjs before storage; the hash is never returned
  by the API.
- Login does not distinguish "unknown email" from "wrong password" - both
  return the same 401 so the API does not leak which accounts exist.
- The resolved-email is sent fire-and-forget (not awaited), so the status
  response returns without waiting on SMTP, and a mail failure cannot break the
  status update. The jest tests mock the mailer; actual delivery is verified
  manually by triggering a resolve and opening the logged Ethereal preview URL.
