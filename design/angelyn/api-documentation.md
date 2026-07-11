# API Documentation - Member 4 (Angelyn)

Endpoints owned by the Alert Engine, Dashboard & Rodent Assessment module. Base
URL is the backend server (e.g. `http://localhost:3000`).

## Authentication

All endpoints in this module require a JWT in the Authorization header:

```
Authorization: Bearer <token>
```

The token is issued by `POST /api/auth/login` (Member 3). Its payload is
`{ user_id, role, name }`.

- `protect` - rejects with 401 if the header is missing/malformed or the token
  is invalid; otherwise attaches the decoded payload to `req.user`. Every router
  in this module applies `protect` to all its routes.
- `restrictTo(...roles)` - runs after `protect`; rejects with 403 if
  `req.user.role` is not in the allowed roles.

Role model for this module:

| Area | admin | staff | resident |
|------|-------|-------|----------|
| Alert rules - read | yes | yes | no (403) |
| Alert rules - create/update/delete | yes | no (403) | no (403) |
| Dashboard metrics | yes | yes | no (403) |
| Trigger weekly summary | yes | no (403) | no (403) |
| Notification log | yes | yes | no (403) |
| Rodent assessments - read/create | yes | yes | no (403) |
| Rodent assessments - delete | yes | no (403) | no (403) |

---

## Alert Rules

Configurable rules for when the system notifies staff. Base path `/api/alert-rules`.

### GET /api/alert-rules

List all active (non-deleted) alert rules.

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Request body: none
- Success: `200` - array of rule objects, ordered by `createdAt` DESC
- Errors:
  - `401` - missing/invalid token
  - `403` - role is resident
  - `500` - `{ "error": "failed to fetch rules" }`

### GET /api/alert-rules/:id

Get a single alert rule.

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Success: `200` - the rule object
- Errors:
  - `401` / `403` - as above
  - `404` - `{ "error": "not found" }` (missing or soft-deleted)

### POST /api/alert-rules

Create an alert rule.

- Auth: `protect` + `restrictTo('admin')`
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | name | string | yes | trimmed |
  | trigger_type | string | yes | one of `flora_critical`, `fauna_hotspot`, `new_case_urgent`, `weekly_summary` |
  | threshold | number | no | e.g. sightings-per-block for a fauna hotspot |
  | recipients | string | yes | comma-separated email addresses |
  | channel | string | no | one of `email`, `sms`, `both`; defaults to `email` |

  `created_by` is taken from the JWT (`req.user.user_id`).

- Success: `201` - the created rule object
- Errors:
  - `400` - `{ "error": "<message>" }` (validation failure from `validateRuleInput`)
  - `401` - missing/invalid token, or a stale JWT whose user no longer exists
    (`{ "error": "your session is stale - please log out and log in again" }`)
  - `403` - role not admin

### PATCH /api/alert-rules/:id

Update an alert rule (also used to toggle `is_active`). The body is merged onto
the existing rule and re-validated.

- Auth: `protect` + `restrictTo('admin')`
- Request body: any subset of the create fields, plus `is_active` (boolean)
- Success: `200` - the updated rule object
- Errors:
  - `400` - validation failure
  - `401` / `403` - as above
  - `404` - `{ "error": "not found" }`

### DELETE /api/alert-rules/:id

Soft-delete a rule (sets `is_deleted = true`; the row is not removed).

- Auth: `protect` + `restrictTo('admin')`
- Success: `200` - `{ "deleted": true, "id": <id> }`
- Errors:
  - `401` / `403` - as above
  - `404` - `{ "error": "not found" }`

---

## Dashboard

Estate command-centre metrics. Base path `/api/dashboard`.

### GET /api/dashboard/metrics

Return the full set of computed estate metrics for the dashboard.

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Request body: none
- Success: `200` - a metrics object including:
  - `openCases`, `criticalFlora`, `atRiskFlora`, `activeHotspots`,
    `totalSightings` (numbers)
  - `hotspots` - array of `{ block_number, count, animals, lastSeen }`
  - `casesByStatus`, `casesByCategory`, `sightingsByBlock`
  - `riskScore` (0-100) and `riskStatus` (`healthy` / `watch` / `critical`)
  - `estateHealth` - hero-card summary `{ status, score, scoreTrend, highestRiskBlock, lastIncident }`
  - `trends` - week-over-week / day-over-day deltas from stored snapshots (null until history exists)
  - `history` - time series for the activity chart (stored snapshots + today's live point)
  - `criticalFloraSpecies` - array of species names currently critical
  - `notificationsLast7Days`, `notificationsPrev7Days` (for the alerts KPI + its trend)
  - `recentCases` - the 6 most recent cases
- Errors:
  - `401` - missing/invalid token
  - `403` - role is resident
  - `500` - `{ "error": "failed to compute metrics" }`

### POST /api/dashboard/trigger-summary

Manually send the weekly estate summary now (the live-demo button). Generates the
summary (AI or fallback), dispatches it, and logs the dispatch.

- Auth: `protect` + `restrictTo('admin')`
- Request body: none
- Success: `200` - a result object from the weekly-summary service (recipients,
  generated-by, preview, etc.)
- Errors:
  - `401` / `403` - as above
  - `500` - `{ "error": "<message>" }`

---

## Notifications

Audit log of dispatched notifications. Base path `/api/notifications`.

### GET /api/notifications

List notification log entries, newest first, with optional status filter and
pagination.

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Query filters (optional):
  - `?status=` - one of `sent`, `failed`
  - `?limit=` - page size (default 50, max 2000)
  - `?offset=` - pagination offset (default 0)
- Success: `200` - `{ logs, total, limit, offset }`, where each log includes the
  joined `rule_name` and `trigger_type` flattened from its parent rule
- Errors:
  - `401` / `403` - as above
  - `500` - `{ "error": "failed to fetch logs" }`

### GET /api/notifications/recent-count

Count of notifications dispatched in the last 7 days (for the dashboard KPI).

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Success: `200` - `{ "count": <n> }`
- Errors:
  - `401` / `403` - as above
  - `500` - `{ "error": "failed to count" }`

---

## Rodent Assessments

AI-assisted rodent risk assessment. Base path `/api/rodent-assessments`.

When a `GEMINI_API_KEY` is configured the create endpoint calls the Gemini
service; otherwise it falls back to a deterministic stub assessment and flags the
response with `stubbed: true`.

### GET /api/rodent-assessments

List past assessments, newest first.

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Query filters (optional):
  - `?limit=` - page size (default 20, max 100)
  - `?risk_level=` - one of `low`, `medium`, `high`, `critical`
- Success: `200` - array of assessment objects
- Errors:
  - `401` / `403` - as above
  - `500` - `{ "error": "failed to fetch assessments" }`

### GET /api/rodent-assessments/:id

Get a single assessment.

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Success: `200` - the assessment object
- Errors:
  - `401` / `403` - as above
  - `404` - `{ "error": "not found" }`

### POST /api/rodent-assessments

Run an AI risk assessment on field observations and save it.

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | observations | string | yes | the officer's field notes (the AI input) |
  | block_number | string | no | |
  | floor_level | string | no | |

- Behavior: generates an assessment (Gemini if a key is set, otherwise the stub),
  then saves it with `risk_level`, `likely_cause`, `signs_identified`,
  `immediate_actions`, `escalate_to_contractor`, and `escalation_reason`.
  `assessed_by` is taken from the JWT.
- Success: `201` - the saved assessment object, plus a `stubbed` boolean
  indicating whether the stub path was used
- Errors:
  - `400` - `{ "error": "observations are required" }`
  - `401` / `403` - as above
  - `500` - `{ "error": "<message>" }` (AI failure) or
    `{ "error": "assessment generated but failed to save" }`

### PATCH /api/rodent-assessments/:id

Update the follow-up notes on an assessment. Only `follow_up_notes` may change.

- Auth: `protect` + `restrictTo('admin', 'staff')`
- Request body:

  | Field | Type | Required |
  |-------|------|----------|
  | follow_up_notes | string | yes |

- Success: `200` - the updated assessment object
- Errors:
  - `400` - `{ "error": "only follow_up_notes can be updated" }`
  - `401` / `403` - as above
  - `404` - `{ "error": "not found" }`

### DELETE /api/rodent-assessments/:id

Soft-delete an assessment (sets `is_deleted = true`).

- Auth: `protect` + `restrictTo('admin')`
- Success: `200` - `{ "deleted": true, "id": <id> }`
- Errors:
  - `401` / `403` - as above (delete is admin-only)
  - `404` - `{ "error": "not found" }`