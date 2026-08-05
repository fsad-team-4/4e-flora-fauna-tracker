# API Documentation - Member 1 (Shernell)

Endpoints owned by the Flora Management module. All routes are mounted under
`/api/flora` (see `backend/src/routes/floraRoutes.js`). Base URL is the backend
server (e.g. `http://localhost:3000`).

## Authentication

Every flora endpoint requires a JWT in the Authorization header:

```
Authorization: Bearer <token>
```

The token is issued by `POST /api/auth/login` (Member 3's auth module); its
payload is `{ user_id, role, name }`.

- `protect` - rejects with `401` if the header is missing/malformed or the token
  is invalid; otherwise attaches the decoded payload to `req.user`. All six
  flora routes use it.
- `restrictTo('staff', 'admin')` - runs after `protect`; rejects with `403` if
  `req.user.role` is not staff or admin. Residents have no access to the flora
  module at all - GET, POST, PATCH, and DELETE on `/api/flora` are all
  restricted to `staff` or `admin` only; a resident attempting any of them
  receives `403`.

Field validation errors return `400` with `{ error: [ ...messages ] }` (an
array of yup messages). Unexpected server errors return `500` with
`{ error: "Internal server error" }`.

Health status is one of `healthy`, `at_risk`, `critical` throughout.

---

## GET /api/flora

List active greenery records (the plant directory). Soft-deleted records
(`is_deleted = true`) are always excluded.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Request body: none
- Query filters (optional):
  - `?health_status=` - one of `healthy`, `at_risk`, `critical`
  - `?plant_family=` - partial match, case-insensitive
  - `?site_suitability=` - partial match, case-insensitive
  - `?location=` - partial match, case-insensitive
  - `?color=` - exact match
- Success: `200` - array of records, each including the `recorder` association
  (`{ id, name }`), ordered by `createdAt` DESC
- Errors:
  - `401` - missing/invalid token

Example request:

```
GET /api/flora?health_status=critical
Authorization: Bearer <token>
```

Example response (`200`):

```json
[
  {
    "id": 3,
    "species": "Palm",
    "common_name": null,
    "location_zone": null,
    "location": null,
    "health_status": "critical",
    "health_notes": null,
    "care_recommendation": null,
    "last_inspected_at": null,
    "recorded_by": 1,
    "is_deleted": false,
    "image_url": null,
    "createdAt": "2026-07-03T02:10:00.000Z",
    "updatedAt": "2026-07-03T02:10:00.000Z",
    "recorder": { "id": 1, "name": "staff" }
  }
]
```

---

## POST /api/flora

Create a single greenery record.

If the record is created with health_status of at_risk or critical, an alert email is sent to all staff/admin users (fire-and-forget; does not affect the response).

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | species | string | yes | trimmed |
  | common_name | string | no | trimmed |
  | location_zone | string | no | trimmed |
  | location | string | no | trimmed |
  | health_status | string | no | one of `healthy`, `at_risk`, `critical`; defaults to `healthy` |
  | health_notes | string | no | trimmed |
  | plant_family | string | no | trimmed |
  | site_suitability | string | no | trimmed |
  | color | string | no | trimmed |
  | max_height_at_maturity | number | no | must be positive; omit or leave blank for none |
  | last_inspected_at | date | no | ISO date |
  | image_url | string | no | trimmed URL; nullable |

  `recorded_by` is taken from the JWT (`req.user.user_id`); any value sent in the
  body is ignored.

- Success: `201` - the created record object (includes `id`, `recorded_by`,
  `is_deleted: false`, `care_recommendation: null`, timestamps)
- Errors:
  - `400` - validation failure (missing species, invalid `health_status`)
  - `401` - missing/invalid token
  - `403` - role not staff/admin

Example request:

```
POST /api/flora
Authorization: Bearer <token>
Content-Type: application/json

{
  "species": "Ficus benjamina",
  "common_name": "Weeping fig",
  "location_zone": "Block A",
  "health_status": "healthy"
}
```

Example response (`201`):

```json
{
  "id": 1,
  "species": "Ficus benjamina",
  "common_name": "Weeping fig",
  "location_zone": "Block A",
  "location": "Near Block A playground",
  "health_status": "healthy",
  "health_notes": null,
  "last_inspected_at": null,
  "recorded_by": 1,
  "is_deleted": false,
  "care_recommendation": null,
  "image_url": "https://res.cloudinary.com/example/image/upload/v1/flora/ficus-benjamina.jpg",
  "updatedAt": "2026-07-03T02:00:00.000Z",
  "createdAt": "2026-07-03T02:00:00.000Z"
}
```

---

## PATCH /api/flora/:id

Update an existing (non-deleted) greenery record. Only the fields supplied in the body are changed.

If this update causes a fresh transition to at_risk or critical (the status changed from something else), an alert email is sent to all staff/admin users (fire-and-forget; does not affect the response). No email is sent if the record was already at that status.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Path params: `id` - the record id
- Request body (all optional; same fields and rules as create, none required):

  | Field | Type | Notes |
  |-------|------|-------|
  | species | string | trimmed |
  | common_name | string | trimmed |
  | location_zone | string | trimmed |
  | location | string | trimmed |
  | health_status | string | one of `healthy`, `at_risk`, `critical` |
  | health_notes | string | trimmed |
  | plant_family | string | trimmed |
  | site_suitability | string | trimmed |
  | color | string | trimmed |
  | max_height_at_maturity | number | must be positive; send `null` or omit to clear |
  | last_inspected_at | date | ISO date |
  | image_url | string | trimmed URL; nullable |

- Success: `200` - the updated record object
- Errors:
  - `400` - validation failure (e.g. invalid `health_status`)
  - `401` - missing/invalid token
  - `403` - role not staff/admin
  - `404` - `{ "error": "Greenery record not found" }` (missing or soft-deleted)

Example request:

```
PATCH /api/flora/1
Authorization: Bearer <token>
Content-Type: application/json

{ "health_status": "at_risk", "health_notes": "Leaf drop on north side" }
```

Example response (`200`):

```json
{
  "id": 1,
  "species": "Ficus benjamina",
  "common_name": "Weeping fig",
  "location_zone": "Block A",
  "location": "Near Block A playground",
  "health_status": "at_risk",
  "health_notes": "Leaf drop on north side",
  "last_inspected_at": null,
  "recorded_by": 1,
  "is_deleted": false,
  "care_recommendation": null,
  "image_url": "https://res.cloudinary.com/example/image/upload/v1/flora/ficus-benjamina.jpg",
  "createdAt": "2026-07-03T02:00:00.000Z",
  "updatedAt": "2026-07-03T02:30:00.000Z"
}
```

---

## DELETE /api/flora/:id

Soft-delete a greenery record (sets `is_deleted = true`; the row is not
removed).

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Path params: `id` - the record id
- Request body: none
- Success: `200` - `{ "message": "Greenery record deleted" }`
- Errors:
  - `401` - missing/invalid token
  - `403` - role not staff/admin
  - `404` - `{ "error": "Greenery record not found" }` (missing or already deleted)

Example request:

```
DELETE /api/flora/1
Authorization: Bearer <token>
```

Example response (`200`):

```json
{ "message": "Greenery record deleted" }
```

---

## POST /api/flora/bulk

Bulk-import greenery records from a CSV file (e.g. an NParks tree-data export).
Rows are validated and inserted independently, so valid rows import even when
others fail.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Request: `multipart/form-data` with a single CSV file in the field named
  `file`. The first row is the header; recognised columns are `species`,
  `common_name`, `location_zone`, `location`, `health_status`, `health_notes`,
  `plant_family`, `site_suitability`, `color`, `max_height_at_maturity`,
  `last_inspected_at`. Each row is validated with the same schema as create
  (species required, valid `health_status`); `recorded_by` is set from the JWT.
- Success: `201` - `{ "created": <count>, "errors": [ { "row", "error" } ] }`,
  where `row` is the 1-based line number in the file (header is row 1, so the
  first data row is row 2) and `error` is the yup message array (or an error
  string).
- Errors:
  - `400` - `{ "error": "CSV file is required" }` (no file attached)
  - `401` - missing/invalid token
  - `403` - role not staff/admin

Example request:

```
POST /api/flora/bulk
Authorization: Bearer <token>
Content-Type: multipart/form-data; field "file" = flora.csv
```

`flora.csv`:

```
species,common_name,location_zone,health_status
Rain tree,Samanea saman,Block B,healthy
Frangipani,Plumeria,Block C,at_risk
Broken plant,Bad row,Block D,dying
```

Example response (`201`):

```json
{
  "created": 2,
  "errors": [
    { "row": 4, "error": ["health_status must be one of the following values: healthy, at_risk, critical"] }
  ]
}
```

---

## POST /api/flora/:id/care-recommendation

Generate an AI care recommendation for a plant using Gemini and store it on the
record. The recommendation is 3-5 short, emoji-prefixed actionable bullets,
plus one additional final bullet estimating the species' typical lifespan in
Singapore's climate (prefixed with ⏳).

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Path params: `id` - the record id
- Request body: none
- Behavior: the record is loaded first (404 if missing/deleted), then the
  `GEMINI_API_KEY` is checked (503 if unset), then `gemini-3.5-flash` is called.
  On success the text is saved to the record's `care_recommendation` field.
- Success: `200` - the updated record object, with `care_recommendation`
  populated
- Errors:
  - `401` - missing/invalid token
  - `403` - role not staff/admin
  - `404` - `{ "error": "Greenery record not found" }` (missing or soft-deleted)
  - `503` - `{ "error": "AI service not configured" }` (`GEMINI_API_KEY` unset)
  - `502` - `{ "error": "AI request failed: <message>" }` (Gemini call failed)

Example request:

```
POST /api/flora/1/care-recommendation
Authorization: Bearer <token>
```

Example response (`200`):

```json
{
  "id": 1,
  "species": "Ficus benjamina",
  "common_name": "Weeping fig",
  "location_zone": "Block A",
  "location": "Near Block A playground",
  "health_status": "at_risk",
  "health_notes": "Leaf drop on north side",
  "last_inspected_at": null,
  "recorded_by": 1,
  "is_deleted": false,
  "care_recommendation": "💧 Water deeply twice a week; let the topsoil dry between.\n🌤️ Keep in bright, indirect light - avoid harsh afternoon sun.\n🐛 Inspect leaves for scale and spray neem if pests appear.\n✂️ Prune the affected north-side branches to redirect growth.\n⚠️ Escalate to an arborist if leaf drop continues past two weeks.\n⏳ In Singapore's climate, this species typically lives 20-30 years with proper care.",
  "image_url": "https://res.cloudinary.com/example/image/upload/v1/flora/ficus-benjamina.jpg",
  "createdAt": "2026-07-03T02:00:00.000Z",
  "updatedAt": "2026-07-03T02:45:00.000Z"
}
```
