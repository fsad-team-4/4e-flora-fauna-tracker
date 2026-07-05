# API Documentation - Member 2 (Renee)

Endpoints owned by the Fauna Sightings module. Base URL is the backend server
(e.g. `http://localhost:3000`).

## Authentication

Protected endpoints expect a JWT in the Authorization header:

```
Authorization: Bearer <token>
```

The token is issued by `POST /api/auth/login`. Its payload is
`{ user_id, role, name }`.

- `protect` - rejects with 401 if the header is missing/malformed or the token
  is invalid; otherwise attaches the decoded payload to `req.user`.
- `restrictTo(...roles)` - runs after `protect`; rejects with 403 if
  `req.user.role` is not in the allowed roles.

Validation errors return `400` with `{ error: [ ...messages ] }` (an array of
yup messages). Unexpected server errors return `500` with
`{ error: "Internal server error" }`.

---

## Fauna Sightings

### POST /api/fauna

Submit a new fauna sighting.

- Auth: requires JWT (`protect`); any logged-in user
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | species | string | yes | one of `cat`, `pigeon`, `crow`, `mynah`, `other` |
  | block_number | string | yes | e.g. `"Block 203"` |
  | floor_level | string | no | e.g. `"Ground"`, `"2nd"`, `"5th+"` |
  | behaviour_tags | string[] | no | any of `urinating`, `feeding`, `nesting`, `droppings`, `aggressive` |
  | gps_lat | number | no | latitude coordinate |
  | gps_lng | number | no | longitude coordinate |
  | photo_url | string | no | Cloudinary URL from `POST /api/uploads` |
  | notes | string | no | optional free-text description, max 500 chars |

  `reported_by` is taken from the JWT (`req.user.user_id`); any value sent in
  the body is ignored.

- Success: `201` - the created sighting object

  ```json
  {
    "id": 1,
    "species": "cat",
    "block_number": "Block 203",
    "floor_level": "2nd",
    "behaviour_tags": ["urinating", "feeding"],
    "gps_lat": 1.3521,
    "gps_lng": 103.8198,
    "photo_url": "https://res.cloudinary.com/...",
    "notes": "Cat seen near void deck",
    "status": "open",
    "reported_by": 3,
    "is_deleted": false,
    "createdAt": "2026-07-04T10:00:00.000Z",
    "updatedAt": "2026-07-04T10:00:00.000Z"
  }
  ```

- Errors:
  - `400` - validation failure (`{ error: [ ...messages ] }`)
  - `401` - missing/invalid token

---

### GET /api/fauna

List fauna sightings. Soft-deleted sightings (`is_deleted = true`) are always
excluded.

- Auth: requires JWT (`protect`)
- Role-based scoping:
  - `resident` - only their own sightings (`reported_by = req.user.user_id`);
    cat `gps_lat` and `gps_lng` are stripped from all results
  - `staff` / `admin` - all sightings; full GPS data included
- Query filters (optional):
  - `?species=` - one of `cat`, `pigeon`, `crow`, `mynah`, `other`
  - `?status=` - one of `open`, `in_progress`, `resolved`
  - `?block_number=` - exact block string, e.g. `Block 203`
  - filters combine, e.g. `/api/fauna?species=cat&status=open`
- Success: `200` - array of sighting objects, each including the `reporter`
  association (`{ id, name }`), ordered by `createdAt` DESC
- Errors:
  - `401` - missing/invalid token

---

### GET /api/fauna/:id

Get a single sighting.

- Auth: requires JWT (`protect`); residents may only view their own sighting
- Request body: none
- Role-based data:
  - `resident` - if the sighting species is `cat`, `gps_lat` and `gps_lng`
    are returned as `null`
  - `staff` / `admin` - full GPS data always returned
- Success: `200` - the sighting object including the `reporter` association
  (`{ id, name }`)
- Errors:
  - `401` - missing/invalid token
  - `403` - `{ "error": "Forbidden" }` (resident requesting another user's
    sighting)
  - `404` - `{ "error": "Sighting not found" }` (missing or soft-deleted)

---

### PATCH /api/fauna/:id

Update a sighting's details (reporter editing their own submission).

- Auth: requires JWT (`protect`); resident may only update their own sighting;
  staff/admin may update any sighting
- Request body (all fields optional):

  | Field | Type | Notes |
  |-------|------|-------|
  | floor_level | string | |
  | behaviour_tags | string[] | replaces the existing array |
  | notes | string | max 500 chars |
  | photo_url | string | Cloudinary URL |

  `species`, `block_number`, `reported_by`, and `status` cannot be changed via
  this endpoint.

- Success: `200` - the updated sighting object
- Errors:
  - `400` - validation failure
  - `401` - missing/invalid token
  - `403` - resident trying to update another user's sighting
  - `404` - sighting not found or soft-deleted

---

### PATCH /api/fauna/:id/status

Update a sighting's case status.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | status | string | yes | one of `open`, `in_progress`, `resolved` |

- Success: `200` - the updated sighting object
- Errors:
  - `400` - validation failure (invalid/missing status)
  - `401` - missing/invalid token
  - `403` - role not staff/admin
  - `404` - sighting not found or soft-deleted

---

### DELETE /api/fauna/:id

Soft-delete a sighting (sets `is_deleted = true`; the row is not removed).

- Auth: requires JWT (`protect`) + `restrictTo('admin')`
- Request body: none
- Success: `200` - `{ "message": "Sighting deleted" }`
- Errors:
  - `401` - missing/invalid token
  - `403` - role not admin
  - `404` - `{ "error": "Sighting not found" }` (missing or already deleted)

---

## Hotspots

### GET /api/fauna/hotspots

Get a count of sightings grouped by block and species, sorted by total count
descending. Used to identify high-activity zones.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Query filters (optional):
  - `?days=` - number of days to look back (default `30`)
- Success: `200` - array of hotspot objects

  ```json
  [
    {
      "block_number": "Block 203",
      "total": 12,
      "breakdown": {
        "cat": 7,
        "pigeon": 4,
        "crow": 1
      }
    },
    {
      "block_number": "Block 115",
      "total": 5,
      "breakdown": {
        "cat": 2,
        "mynah": 3
      }
    }
  ]
  ```

- Errors:
  - `401` - missing/invalid token
  - `403` - role not staff/admin

---

### GET /api/fauna/hotspots/:block/summary

Generate an AI summary of recent fauna activity for a specific block using
the Gemini API.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- URL param: `:block` - block number string (URL-encoded), e.g. `Block%20203`
- Query filters (optional):
  - `?days=` - number of days to look back (default `30`)
- Success: `200`

  ```json
  {
    "block": "Block 203",
    "summary": "Block 203 has recorded 12 fauna sightings in the past 30 days,
      with community cats being the dominant concern (7 sightings), primarily
      exhibiting urinating and feeding behaviours near the void deck on floors
      1-3. Four pigeon sightings were also reported, mainly involving droppings
      near the playground area. Recommended agency contact: Cat Welfare Society
      or SPCA for cat cases; ACRES for pigeon cases.",
    "agency_recommendation": {
      "cat": "Cat Welfare Society / SPCA",
      "pigeon": "ACRES"
    },
    "sighting_count": 12,
    "period_days": 30
  }
  ```

- Errors:
  - `401` - missing/invalid token
  - `403` - role not staff/admin
  - `404` - `{ "error": "No sightings found for this block" }`
  - `503` - `{ "error": "AI summary unavailable. Please try again later." }`
    (Gemini API failure; fallback message returned)
