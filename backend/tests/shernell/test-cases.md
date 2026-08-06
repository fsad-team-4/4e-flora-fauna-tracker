# Flora Management - Test Cases (Member 1 / Shernell)

Tested with Jest + Supertest against the Express app, using an isolated
in-memory SQLite database (`sqlite::memory:`, `sync({ force: true })`) so the
dev database is never touched. File: `flora.test.js`.

## Flora CRUD + Bulk Upload + AI fallback (`flora.test.js`)

Setup: registers and logs in one staff and one resident in `beforeAll` (staff
first, so its user id is a deterministic `1`); the staff account creates the
plant records the later tests act on.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 1 | POST /api/flora | Staff creates plant (happy path) | Valid species/common_name/location_zone/health_status with `recorded_by: 999` spoofed in body | 201; `recorded_by` taken from the JWT (staff's id, 1), body value ignored |
| 2 | POST /api/flora | Missing required species | Body with `common_name` but no `species` | 400 (yup validation failure) |
| 3 | POST /api/flora | Invalid health_status | `species` valid, `health_status: "dying"` | 400 (not in healthy/at_risk/critical) |
| 4 | POST /api/flora | Resident attempts create | res1 posts a valid plant | 403 (restrictTo staff/admin) |
| 5 | GET /api/flora | List returns created records | res1 lists flora | 200; array includes the record created in test 1 |
| 6 | GET /api/flora | Health-status filter | `?health_status=critical` (after a critical record is seeded) | 200; every returned record has `health_status: critical` |
| 7 | PATCH /api/flora/:id | Staff updates health_status | staff sets `health_status: at_risk` on the test-1 record | 200; body `health_status` is `at_risk` |
| 8 | PATCH /api/flora/:id | Non-existent id | staff patches id `999` | 404 (Greenery record not found) |
| 9 | DELETE /api/flora/:id | Staff soft-deletes | staff creates a throwaway record, deletes it, then lists | DELETE 200; subsequent GET list does not contain that id |
| 10 | POST /api/flora/bulk | CSV bulk import (mixed validity) | Multipart `file` = CSV buffer with 2 valid rows + 1 invalid (`health_status: dying`) | 201; `created: 2`, `errors` length 1 (with row number) |
| 11 | POST /api/flora/:id/care-recommendation | AI key not configured | `GEMINI_API_KEY` deleted from env; staff requests recommendation for a real record | 503 "AI service not configured" (no live API call) |

## Health-alert Email (`flora.test.js`)

The mailer (`config/mailer.js`) is mocked with `jest.mock` so no real SMTP /
network call happens; the stubbed `sendMail` is asserted on. The alert email
notifies all staff/admin when a plant's health becomes `at_risk` or `critical`,
and is fire-and-forget (the request does not await it), so each test flushes
pending microtasks (~50ms) before asserting.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 16 | POST /api/flora | Create at alerting status | staff creates a plant with `health_status: critical` | 201; `sendMail` called once |
| 17 | POST /api/flora | Create at healthy status | staff creates a plant with `health_status: healthy` | 201; `sendMail` not called |
| 18 | PATCH /api/flora/:id | Fresh transition into alerting status | staff patches a healthy record to `health_status: at_risk` | 200; `sendMail` called once (status just transitioned) |
| 19 | PATCH /api/flora/:id | No real status change | staff patches an `at_risk` record to `health_status: at_risk` | 200; `sendMail` not called (already at that status) |

## Horticulture Handbook - Botanical Catalog Fields (`flora.test.js`)

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 20 | POST /api/flora | Create with botanical fields | Valid species + `plant_family`, `site_suitability`, `color`, `max_height_at_maturity` | 201; all 4 fields saved and returned as sent |
| 21 | POST /api/flora | Reject non-positive height | `max_height_at_maturity: -5` | 400; "Max height must be a positive number" |
| 22 | PATCH /api/flora/:id | Clear an existing height | Patch a record that has `max_height_at_maturity` set, with the field sent as an empty value | 200; `max_height_at_maturity` becomes `null`, not left unchanged |
| 23 | GET /api/flora | Filter by plant_family (partial match) | `?plant_family=Rubi` against seeded records including one `Rubiaceae` and one `Nyctaginaceae` | 200; only the `Rubiaceae` record is returned |
| 24 | GET /api/flora | Filter by color (exact match) | `?color=red` against seeded records of different colors | 200; only the exact-match record is returned |

## Location Field & Case-Insensitive Filtering (`flora.test.js`)

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 25 | POST /api/flora | Create with location and location_zone set to different values | `location: "Bishan Park"`, `location_zone: "Block A"` | 201; `location` is `Bishan Park` and `location_zone` is `Block A` - both saved independently |
| 26 | GET /api/flora | Filter by location (partial match) | `?location=Bishan` against seeded records including one `location: "Bishan Park"` and one `location: "Toa Payoh Central"` | 200; only the record containing `Bishan` in its location is returned |
| 27 | GET /api/flora | Case-insensitive location match (regression) | Record with `location: "Bishan Park"` seeded; request `?location=bishan` (lowercase) | 200; the "Bishan Park" record is found despite the case mismatch |
| 28 | POST /api/flora/bulk | CSV bulk import saves location column (regression) | CSV with `species,common_name,location,health_status` header and a row with `location: Bishan Park` | 201; `created: 1`; subsequent `GET /api/flora?location=Bishan` returns the record with `location: "Bishan Park"` persisted |

## AI Care Recommendation - live Gemini (manual testing via Postman/browser)

The `POST /api/flora/:id/care-recommendation` endpoint calls Google Gemini, an
external service. The automated suite (test 11) only covers the not-configured
fallback; the cases below exercise the live model and were verified manually
against a running server with a real `GEMINI_API_KEY`, because automated tests
must not call the live API.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 12 | POST /api/flora/:id/care-recommendation | Valid key (happy path) | Auth token + real `GEMINI_API_KEY`, existing plant id | 200; `care_recommendation` generated and saved on the record (verified in Postman) |
| 13 | POST /api/flora/:id/care-recommendation | Output truncation iteration | Same request while tuning `maxOutputTokens` / `thinkingConfig` | Initial `maxOutputTokens: 300` truncated mid-sentence (thinking tokens consumed the budget); raising to 1024 still truncated; fixed with `thinkingConfig: { thinkingBudget: 0 }` - documented as known Gemini 2.5 flash behavior |
| 14 | POST /api/flora/:id/care-recommendation | Regenerate on existing record | Trigger recommendation again on a record that already has one | 200; new recommendation overwrites the previous value (verified in browser via FloraDetail page) |
| 15 | POST /api/flora/:id/care-recommendation | Non-existent plant id | Real key, id that does not exist | 404 (Greenery record not found), verified in Postman |

## Notes

- Test 1 creates the record that tests 5, 6, 7, and 11 depend on; test 9 uses
  its own throwaway record so soft-delete cannot disturb shared state. Tests run
  in file order.
- Staff is registered before the resident so its user id is a deterministic `1`,
  making the `recorded_by` spoof assertion in test 1 exact.
- `recorded_by` is always taken from the JWT, never from the request body, so a
  client cannot attribute a record to another user.
- Deletes are soft (`is_deleted: true`); the list endpoint filters deleted rows,
  so a soft-deleted record is absent from GET without being physically removed.
- The care-recommendation existence check runs before the API-key check, so a
  request for a missing record returns 404 even when the key is absent.
- Tests 27 and 28 are regression tests, not routine feature coverage: each
  guards against a specific defect that was actually found and fixed - test 27
  against a case-sensitive filter query before it was made dialect-aware via
  `Op.iLike`, and test 28 against the CSV bulk importer silently dropping the
  `location` column instead of persisting it.
- Prompt formatting is a deliberate readability decision for maintenance staff:
  the model is instructed to return 3-5 short plain-text bullets (no markdown /
  asterisks / bold), each prefixed with a topic emoji - 💧 watering, 🌤️ shade/light,
  🐛 pest treatment, ✂️ pruning, ⚠️ when to escalate - so recommendations are
  scannable on the FloraDetail page.
