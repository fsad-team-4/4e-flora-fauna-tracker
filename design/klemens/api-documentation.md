# API Documentation - Member 3 (Klemens)

Endpoints owned by the Resident Reports & Authentication module. Base URL is the
backend server (e.g. `http://localhost:3000`).

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

## Health

### GET /api/health

Public health check.

- Auth: public
- Request body: none
- Success: `200` `{ "status": "ok" }`

---

## Auth

### POST /api/auth/register

Create a new user account.

- Auth: public
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | name | string | yes | min 2 characters |
  | email | string | yes | valid email format |
  | password | string | yes | min 6 characters |
  | role | string | no | one of `resident`, `staff`, `admin`; defaults to `resident` |

- Success: `201`

  ```json
  { "user_id": 1, "name": "Klemens", "email": "k@example.com", "role": "resident" }
  ```

  The password hash is never returned.

- Errors:
  - `400` - validation failure (`{ error: [ ...messages ] }`)
  - `400` - `{ "error": "Email already registered" }` (duplicate email)

### POST /api/auth/login

Authenticate and receive a JWT.

- Auth: public
- Request body:

  | Field | Type | Required |
  |-------|------|----------|
  | email | string | yes |
  | password | string | yes |

- Success: `200` `{ "token": "<jwt>" }` (expires in 7 days)
- Errors:
  - `400` - validation failure
  - `401` - `{ "error": "Invalid email or password" }` (unknown email or wrong
    password; the same message is used for both so the API does not reveal which
    accounts exist)

---

## Reports

### POST /api/reports

Create a resident report.

- Auth: requires JWT (`protect`); any logged-in user
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | category | string | yes | one of `flora_health`, `community_cat`, `pigeon`, `pest`, `other` |
  | title | string | yes | trimmed, max 200 characters |
  | description | string | yes | trimmed |
  | photo_urls | string[] | no | array of URL strings, max 5 |
  | gps_lat | number | no | |
  | gps_lng | number | no | |
  | block_number | string | no | |
  | floor_level | string | no | |

  `reported_by` is taken from the JWT (`req.user.user_id`); any value sent in the
  body is ignored.

- Success: `201` - the created report object (includes `id`, `status` defaulting
  to `open`, `is_deleted: false`, `reported_by`, timestamps)
- Errors:
  - `400` - validation failure
  - `401` - missing/invalid token

### GET /api/reports

List reports. Soft-deleted reports (`is_deleted = true`) are always excluded.

- Auth: requires JWT (`protect`)
- Role-based scoping:
  - `resident` - only their own reports (`reported_by = req.user.user_id`)
  - `staff` / `admin` - all reports
- Query filters (optional):
  - `?status=` - one of `open`, `in_progress`, `resolved`
  - `?category=` - one of the 5 category values
  - filters combine, e.g. `/api/reports?status=open&category=pest`
- Success: `200` - array of reports, each including the `reporter` association
  (`{ id, name }`), ordered by `createdAt` DESC
- Errors:
  - `401` - missing/invalid token

### GET /api/reports/:id

Get a single report with its status history.

- Auth: requires JWT (`protect`); residents may only view their own report
- Request body: none
- Success: `200` - the report object including:
  - `reporter` association (`{ id, name }`)
  - `CaseStatusLogs` array, each with `old_status`, `new_status`, `createdAt`,
    and a `changer` association (`{ id, name }`)
- Errors:
  - `401` - missing/invalid token
  - `403` - `{ "error": "Forbidden" }` (resident requesting another user's report)
  - `404` - `{ "error": "Report not found" }` (missing or soft-deleted)

### PATCH /api/reports/:id/status

Update a report's case status.

- Auth: requires JWT (`protect`) + `restrictTo('staff', 'admin')`
- Request body:

  | Field | Type | Required | Notes |
  |-------|------|----------|-------|
  | status | string | yes | one of `open`, `in_progress`, `resolved` |

- Behavior: if the status actually changes, a `CaseStatusLog` entry is created
  (`old_status`, `new_status`, `changed_by = req.user.user_id`). When the new
  status is `resolved`, a notification email is sent to the reporter
  (fire-and-forget; failure does not affect the response).
- Success: `200` - the updated report object
- Errors:
  - `400` - validation failure (invalid/missing status)
  - `401` - missing/invalid token
  - `403` - role not staff/admin
  - `404` - `{ "error": "Report not found" }` (missing or soft-deleted)

### DELETE /api/reports/:id

Soft-delete a report (sets `is_deleted = true`; the row is not removed).

- Auth: requires JWT (`protect`) + `restrictTo('admin')`
- Request body: none
- Success: `200` - `{ "message": "Report deleted" }`
- Errors:
  - `401` - missing/invalid token
  - `403` - role not admin
  - `404` - `{ "error": "Report not found" }` (missing or already deleted)

---

## Uploads

### POST /api/uploads

Upload a single image to Cloudinary and get back its URL.

- Auth: requires JWT (`protect`)
- Request: `multipart/form-data` with a single file in the field named `image`
  (allowed types: JPEG, PNG, WebP; max size 5MB)
- Success: `200` - `{ "url": "<cloudinary-secure-url>" }`
- Errors:
  - `400` - `{ "error": "No image file provided" }` (no file attached)
  - `400` - `{ "error": "Image must be sent in a field named 'image'" }` (wrong field name)
  - `400` - `{ "error": "Only JPEG, PNG, and WebP images are allowed" }` (bad file type)
  - `400` - `{ "error": "Image must be 5MB or smaller" }` (file too large)
  - `400` - `{ "error": "Image upload failed" }` (other multer error)
  - `401` - missing/invalid token
  - `500` - Cloudinary upload failure (passed to the global error handler)
