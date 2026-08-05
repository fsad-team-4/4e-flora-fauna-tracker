# Alert Engine + Dashboard + Rodent Assessment - Test Cases (Member 4 / Angelyn)

Tested with Jest + Supertest against the Express app, using an isolated
in-memory SQLite database (`sqlite::memory:`, `sync({ force: true })`) so the
dev database is never touched. Files: `estateStats.test.js`, `alertRules.test.js`,
`dashboard.test.js`, `rodentAssessments.test.js`. 58 tests total, all passing.

## Estate Statistics (`estateStats.test.js`)

Pure-function unit tests for the derived-metrics logic that powers the dashboard.
No database or HTTP - these exercise the calculation functions directly with
fixture data shaped like the real domain data (`block_number`, `at_risk`).

| # | Function | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 1 | computeHotspots | Block at/above threshold flagged | 3 sightings at Block 123 | Block 123 returned as a hotspot, count 3 |
| 2 | computeHotspots | Block below threshold ignored | 2 sightings at Block 456 | Block 456 not in hotspots |
| 3 | computeHotspots | Custom minCount | minCount 2, Block 456 has 2 | Block 456 now qualifies |
| 4 | computeHotspots | No sightings | empty array | empty array returned |
| 5 | computeHotspots | Field-name regression guard | valid sightings | hotspot object has defined `block_number` (not undefined) |
| 6 | computeHotspots | Animal types collected | cats at Block 123 | hotspot `animals` includes "cat" |
| 7 | computeHotspots | Sorted worst-first | Block B has more than Block A | Block B is first in results |
| 8 | computeEstateMetrics | Critical flora count | 2 critical plants | criticalFlora = 2 |
| 9 | computeEstateMetrics | At-risk flora count | 1 at_risk plant | atRiskFlora = 1 |
| 10 | computeEstateMetrics | Open cases count | 2 open cases | openCases = 2 |
| 11 | computeEstateMetrics | Total sightings | 5 sightings | totalSightings = 5 |
| 12 | computeEstateMetrics | Active hotspots | only Block 123 qualifies | activeHotspots = 1 |
| 13 | computeEstateMetrics | Cases by status | mixed statuses | { open: 2, in_progress: 1, resolved: 1 } |
| 14 | computeEstateMetrics | Cases by category | one community_cat case | community_cat count = 1 |
| 15 | computeEstateMetrics | Sightings ranked by block | Block 123 has the most | top entry has block_number "Block 123" |
| 16 | computeEstateMetrics | Risk score present | fixture data | numeric riskScore in 0-100 |
| 17 | computeEstateMetrics | Risk status present | fixture data | one of healthy/watch/critical |
| 18 | computeRiskScore | Troubled vs healthy | high vs zero inputs | troubled score > healthy score |
| 19 | computeRiskScore | Capped at 100 | extreme inputs | score = 100 (not higher) |
| 20 | computeRiskScore | Perfect estate | all zeros | score = 0 |
| 21 | computeRiskScore | Weighting | one critical vs one at-risk | critical weighs more |
| 22 | riskStatus | Critical band | score 60, 85 | "critical" |
| 23 | riskStatus | Watch band | score 25, 59 | "watch" |
| 24 | riskStatus | Healthy band | score 0, 24 | "healthy" |

## Alert Rules API (`alertRules.test.js`)

Setup: registers + logs in one admin, one staff, one resident in `beforeAll` to
get real JWTs. Access model: admin = full CRUD, staff = read only, resident = no
access.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 25 | POST /api/alert-rules | Admin creates valid rule | valid rule fields, admin token | 201; body has `id`, `name` |
| 26 | POST /api/alert-rules | Staff attempts create | valid rule, staff token | 403 (read-only) |
| 27 | POST /api/alert-rules | Resident attempts create | valid rule, resident token | 403 |
| 28 | POST /api/alert-rules | No auth token | valid rule, no token | 401 |
| 29 | POST /api/alert-rules | Missing required fields | only trigger_type | 400 (validation) |
| 30 | POST /api/alert-rules | Invalid trigger_type | trigger_type "made_up" | 400 (validation) |
| 31 | POST /api/alert-rules | Malformed recipient email | recipients "not-an-email" | 400 (validation) |
| 32 | GET /api/alert-rules | Admin lists rules | admin token | 200; array |
| 33 | GET /api/alert-rules | Staff lists rules | staff token | 200 (read access allowed) |
| 34 | GET /api/alert-rules | Resident lists rules | resident token | 403 |
| 35 | PATCH /api/alert-rules/:id | Admin toggles is_active | { is_active: false }, admin | 200; is_active = false |
| 36 | PATCH /api/alert-rules/:id | Staff attempts update | staff token | 403 |
| 37 | PATCH /api/alert-rules/:id | Update non-existent rule | id 999999, admin | 404 |
| 38 | DELETE /api/alert-rules/:id | Staff attempts delete | staff token | 403 |
| 39 | DELETE /api/alert-rules/:id | Admin soft-deletes | admin deletes, then lists | 200; rule no longer in the list |

## Dashboard API (`dashboard.test.js`)

Same auth setup (admin/staff/resident). Access model: admin + staff can view
metrics; residents forbidden; manual summary trigger is admin-only.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 40 | GET /api/dashboard/metrics | Admin views metrics | admin token | 200; has openCases, criticalFlora, activeHotspots (numbers) |
| 41 | GET /api/dashboard/metrics | Data structures present | admin token | hotspots, casesByCategory, recentCases are arrays |
| 42 | GET /api/dashboard/metrics | Hotspot field-name guard | admin token | if any hotspot, it has defined `block_number` |
| 43 | GET /api/dashboard/metrics | Staff views metrics | staff token | 200 |
| 44 | GET /api/dashboard/metrics | Resident forbidden | resident token | 403 |
| 45 | GET /api/dashboard/metrics | No auth token | no token | 401 |
| 46 | POST /api/dashboard/trigger-summary | Staff attempts trigger | staff token | 403 (admin only) |
| 47 | POST /api/dashboard/trigger-summary | Resident attempts trigger | resident token | 403 |

## Rodent Assessment API (`rodentAssessments.test.js`)

Same auth setup. The Gemini AI service is mocked with `jest.mock` so tests never
call the real API - the create path is deterministic, fast and offline. Access
model: admin + staff can create/view; resident forbidden; delete is admin-only.

| # | Endpoint | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 48 | POST /api/rodent-assessments | Staff creates assessment | valid observation, staff | 201; risk_level in low/medium/high/critical |
| 49 | POST /api/rodent-assessments | block_number saved | observation with Block 234 | body block_number = "Block 234" |
| 50 | POST /api/rodent-assessments | Stub flag when mocked | valid observation | body `stubbed` = true (no real AI call) |
| 51 | POST /api/rodent-assessments | Immediate actions returned | valid observation | immediate_actions is a non-empty array |
| 52 | POST /api/rodent-assessments | Missing observations | block_number only | 400 (validation) |
| 53 | POST /api/rodent-assessments | Resident forbidden | valid observation, resident | 403 |
| 54 | POST /api/rodent-assessments | No auth token | valid observation, no token | 401 |
| 55 | GET /api/rodent-assessments | Staff lists history | staff token | 200; array |
| 56 | GET /api/rodent-assessments | Resident forbidden | resident token | 403 |
| 57 | DELETE /api/rodent-assessments/:id | Staff attempts delete | staff token | 403 |
| 58 | DELETE /api/rodent-assessments/:id | Admin deletes | admin token | 200 |

## Notes

- All suites use an isolated in-memory SQLite database and `sync({ force: true })`
  so the dev database is never touched, following the same pattern as the Member 3
  test suites.
- Auth tokens are obtained by registering and logging in real users through the
  API in `beforeAll` (not hand-signed), so the tests exercise the real auth flow.
- The rodent AI service is mocked via `jest.mock` because the real service calls
  the Gemini API at load time; mocking keeps the tests fast, offline and
  deterministic, the same way Member 3 mocks the mailer. The real AI path is
  exercised manually during development.
- The estate-statistics functions are the single source of truth for the
  dashboard KPIs, the weekly summary and the daily metric snapshot, so they are
  unit-tested directly (tests 1-24) in addition to the API-level tests.
- Tests 5 and 42 are regression guards for a field-name bug where the hotspot
  block was read from the wrong field and rendered as "undefined"; they assert
  `block_number` is always defined.
## Test Data in the Database (`dashboardRealData.test.js`)

Test data is defined once in `src/testData.js` and used two ways: written into the
real database by `npm run test-data`, and imported by this suite so the expected
values and the inserted rows can never drift apart. The dataset is 3 accounts
(admin / staff / resident), 7 greenery records, 7 fauna sightings and 7 resident
reports, inserted into `GreeneryRecord`, `FaunaSighting` and `ResidentReport`.

Every row carries `[test-data]` in a free-text field, so the script deletes only
its own rows before re-inserting - re-running never duplicates and never touches
records created by hand or by `seed.js`.

**Why this suite exists.** The dashboard previously computed its KPIs from
`mockDataService`, three hardcoded arrays, so every number was a constant that no
amount of real data could move. `dashboard.test.js` only asserted the fields exist
and are numeric, which passed either way. These cases assert the KPIs equal what
the seeded rows imply, so wiring a KPI back to a constant now fails a test.

| # | Function | Scenario | Input | Expected |
|---|----------|----------|-------|----------|
| 1 | writeTestData | Rows reach the real tables | run the script | 7 greenery, 7 fauna, 7 reports present |
| 2 | writeTestData | Idempotent on re-run | run it twice | counts unchanged, no duplicates |
| 3 | writeTestData | Accounts usable | admin account | logs in through the real auth flow |
| 4 | GET /dashboard/metrics | Critical flora from DB | 2 critical plants seeded | `criticalFlora` = 2 |
| 5 | GET /dashboard/metrics | At-risk flora from DB | 2 at_risk plants seeded | `atRiskFlora` = 2 |
| 6 | GET /dashboard/metrics | Open cases from DB | 4 open reports seeded | `openCases` = 4 |
| 7 | GET /dashboard/metrics | Case breakdown from DB | 4 open, 2 in_progress, 1 resolved | `casesByStatus` matches |
| 8 | GET /dashboard/metrics | Sighting total from DB | 7 sightings seeded | `totalSightings` = 7 |
| 9 | GET /dashboard/metrics | Top hotspot from DB | Block 123 has the most | first block is "Block 123" |
| 10 | GET /dashboard/metrics | KPI is a live count, not a constant | soft-delete a critical plant | `criticalFlora` drops by 1 |
| 11 | GET /dashboard/metrics | KPI is a live count, not a constant | insert an open case | `openCases` rises by 1 |

Cases 10 and 11 are the important ones: they mutate the database and require the
KPI to move, which a hardcoded source cannot do.
