# API Documentation - Member 2 (Renee)

Endpoints owned by the Fauna Sightings module. Base URL is the backend server
(e.g. `http://localhost:3000`).

FaunaSighting records are created automatically by the system when a resident
submits a ResidentReport with category `community_cat` or `pigeon`. There is
no resident-facing POST endpoint. All fauna endpoints are staff/admin facing
except the RBAC-protected GET endpoints.

## Authentication

Protected endpoints expect a JWT in the Authorization header:

```
Authorization: Bearer <token>
```

The token is issued by `POST /api/auth/login`. Its payload is
`{ user_id, role, name }`.

- `protect` - rejects with 401 if the header is missing or token is invalid.
- `restrictTo(...roles)` - rejects with 403 if role is not in the allowed list.

Validation errors return `400` with `{ error: [...messages] }`.
Unexpected server errors return `500` with `{ error: "Internal server error" }`.

---

## Internal — Auto-creation from ResidentReport

This is not an HTTP endpoint. It is a function called inside
`reportController.js` after a ResidentReport is successfully created.

**Function:** `createFaunaSightingFromReport(report, reportedBy)`

- Called when `report.category` is `community_cat` or `pigeon`
- Maps fields:
  - `community_cat` → `species: 'cat'`
  - `pigeon` → `species: 'pigeon'`
  - `block_number`, `floor_level`, `gps_lat`, `gps_lng` carried across
  - `photo_url` taken from `report.photo_urls[0]` if present
  - `notes` taken from `report.description`
  - `reported_by` from the JWT user id
  - `behaviour_tags` defaults to `[]`
  - `status` defaults to `open`
- Fires and returns without blocking the ResidentReport response
- Failures are logged but do not affect the ResidentReport response

---

## Fauna Sightings

### GET /api/fauna

List fauna sightings. Soft-deleted sightings are always excluded.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Query filters (optional):
  - `?species=` — one of `cat`, `pigeon`, `crow`, `mynah`, `other`
  - `?status=` — one of `open`, `in_progress`, `resolved`
  - `?block_number=` — exact block string e.g. `Block 203`
- Success: `200` — array of sighting objects newest first, each including
  `reporter: { id, name }`

  ```json
  [
    {
      "id": 1,
      "species": "cat",
      "block_number": "Block 203",
      "floor_level": "2nd",
      "behaviour_tags": [],
      "gps_lat": 1.3521,
      "gps_lng": 103.8198,
      "photo_url": "https://res.cloudinary.com/...",
      "notes": "Cat seen near void deck",
      "status": "open",
      "reported_by": 3,
      "is_deleted": false,
      "createdAt": "2026-07-05T10:00:00.000Z",
      "updatedAt": "2026-07-05T10:00:00.000Z",
      "reporter": { "id": 3, "name": "Ahmad" }
    }
  ]
  ```

- Errors:
  - `401` — missing/invalid token
  - `403` — role not staff/admin

---

### GET /api/fauna/:id

Get a single sighting.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- RBAC note: cat `gps_lat` and `gps_lng` are stripped if requester is
  `resident` — but this endpoint is restricted to staff/admin so stripping
  only applies if the restriction is relaxed in future
- Success: `200` — the sighting object including `reporter: { id, name }`
- Errors:
  - `401` — missing/invalid token
  - `403` — role not staff/admin
  - `404` — `{ "error": "Sighting not found" }` (missing or soft-deleted)

---

### PATCH /api/fauna/:id/status

Update a sighting's case status.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | status | string | yes | one of `open`, `in_progress`, `resolved` |

- Success: `200` — the updated sighting object
- Errors:
  - `400` — invalid/missing status
  - `401` — missing/invalid token
  - `403` — role not staff/admin
  - `404` — sighting not found or soft-deleted

---

### DELETE /api/fauna/:id

Soft-delete a sighting (sets `is_deleted = true`; row is not removed).

- Auth: requires JWT (`protect`) + `restrictTo('admin')`
- Request body: none
- Success: `200` — `{ "message": "Sighting deleted" }`
- Errors:
  - `401` — missing/invalid token
  - `403` — role not admin
  - `404` — `{ "error": "Sighting not found" }` (missing or already deleted)

---

## Hotspots

### GET /api/fauna/hotspots

Get sighting counts grouped by block and species, sorted by total descending.
Used to identify high-activity zones for staff intervention decisions.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Query filters (optional):
  - `?days=` — number of days to look back (default `30`)
- Success: `200` — array of hotspot objects

  ```json
  [
    {
      "block_number": "Block 203",
      "total": 12,
      "breakdown": { "cat": 7, "pigeon": 4, "crow": 1 }
    },
    {
      "block_number": "Block 115",
      "total": 5,
      "breakdown": { "cat": 2, "mynah": 3 }
    }
  ]
  ```

- Errors:
  - `401` — missing/invalid token
  - `403` — role not staff/admin

---

### GET /api/fauna/hotspots/:block/summary

Generate an AI summary of recent fauna activity for a block using Gemini API.
Returns the summary, agency recommendation, sighting count, and period.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- URL param: `:block` — URL-encoded block string e.g. `Block%20203`
- Query filters (optional):
  - `?days=` — number of days to look back (default `30`)
- Success: `200`

  ```json
  {
    "block": "Block 203",
    "summary": "Block 203 has recorded 12 fauna sightings in the past 30 days,
      with community cats being the dominant concern (7 sightings). Four pigeon
      sightings were also reported near the playground area.",
    "agency_recommendation": {
      "cat": "Cat Welfare Society / SPCA",
      "pigeon": "ACRES"
    },
    "sighting_count": 12,
    "period_days": 30
  }
  ```

- Errors:
  - `401` — missing/invalid token
  - `403` — role not staff/admin
  - `404` — `{ "error": "No sightings found for this block" }`
  - `503` — `{ "error": "AI summary unavailable. Please try again later." }`
    (Gemini API failure; fallback message returned, app does not crash)