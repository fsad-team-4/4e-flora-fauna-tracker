# Use Cases - Member 1 (Shernell)

Use cases for the Flora Management module, based on the implemented features:
GreeneryRecord CRUD, role-based access control (resident / staff / admin),
health status tracking (healthy / at_risk / critical), CSV bulk import,
soft delete, and the Gemini AI care recommendation.

Client context: EM Services manages Town Council estates and needs to keep an
inventory of estate greenery (trees, shrubs, planting-bed stock), catch plant
deterioration early enough to remediate it, and retain records over a 3-5 year
horizon. NParks provides tree data as CSV exports, so bulk import is a core need.

RBAC note (applies to all use cases): every flora route requires a valid JWT
(`protect`). Read access (`GET /api/flora`) is open to any logged-in user
(resident, staff, or admin). All mutations - create, update, delete, bulk
upload, and AI recommendation - are restricted to `staff` or `admin`
(`restrictTo('staff', 'admin')`); a resident attempting them receives `403`.

---

## UC-1: Staff records a single plant observation

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Main flow:

1. The staff member opens the Add a Plant form and enters species (required),
   and optionally common name, location zone, health status (defaults to
   `healthy`), and health notes.
2. The frontend validates the input (species required, health status required)
   and submits to `POST /api/flora`.
3. The backend re-validates with yup, sets `recorded_by` from the JWT
   (`req.user.user_id`), and creates the `GreeneryRecord` with `is_deleted`
   defaulting to `false`, returning `201`.
4. The frontend redirects to the Flora list, where the new plant appears at the
   top (newest first) with a colour-coded health chip.

Alternate / edge flows:

- Missing species or an invalid `health_status` (not one of `healthy`,
  `at_risk`, `critical`) -> `400`, field-level validation errors; no record
  created.
- A `recorded_by` value sent in the request body is ignored; the recorder is
  always taken from the token (verified by test).
- A resident attempting to submit -> `403`; the Add Plant control leads to a
  staff/admin-only action.

Postcondition: 
A new greenery record exists, owned by the staff member who created it, and is visible in the plant directory. 

If the record is created directly with health_status of at_risk or critical, an alert email is also dispatched to all staff/admin users. 

---

## UC-2: Staff bulk-imports greenery data from a CSV export

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; NParks (or
  another source) has provided plant data as a CSV export.

Main flow:

1. The staff member opens the Flora list and, in the CSV Upload card, selects a
   `.csv` file. The first row is treated as the header; recognised columns are
   `species`, `common_name`, `location_zone`, `health_status`, `health_notes`,
   `last_inspected_at`.
2. The frontend submits the file as `multipart/form-data` (field `file`) to
   `POST /api/flora/bulk`.
3. The backend parses the CSV, then validates and inserts each data row
   independently, setting `recorded_by` from the JWT on every row.
4. The backend returns `201` with `{ created: <count>, errors: [...] }`. The
   frontend shows how many records were created and lists any row errors, then
   refreshes the list.

Alternate / edge flows (partial-failure behavior):

- Valid rows are imported even when other rows fail - the import is row-by-row,
  not all-or-nothing.
- Each invalid row is reported as `{ row, error }`, where `row` is the line
  number in the file (header is row 1, so the first data row is row 2). Example:
  a row with `health_status = dying` is rejected and reported against its row
  number while the surrounding valid rows still import.
- No file attached -> `400` `{ "error": "CSV file is required" }`.
- A resident attempting the upload -> `403`.

Postcondition: all valid rows exist as greenery records; the caller has a
per-row report of which rows failed and why.

---

## UC-3: Staff updates a plant's health status after inspection

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; the target
  record exists and is not soft-deleted.

Main flow:

1. The staff member opens a plant's detail page and clicks Edit.
2. They change the health status (e.g. `healthy` -> `at_risk`) and/or health
   notes and submit `PATCH /api/flora/:id`.
3. The backend validates the fields, looks up the record with
   `is_deleted = false`, applies only the supplied fields, saves, and returns
   `200` with the updated record.
4. The detail page exits edit mode and shows the new health chip and notes.

Alternate / edge flows:

- Record not found (bad id) -> `404` `{ "error": "Greenery record not found" }`.
- A soft-deleted record cannot be updated: the lookup filters on
  `is_deleted = false`, so a deleted record also returns `404`.
- Invalid `health_status` -> `400`.
- A resident attempting the update -> `403`.

Postcondition: 
The record reflects the latest inspection; updatedAt advances. 

If this update causes a fresh transition into at_risk or critical (the status actually changed from something else), an alert email is also dispatched to all staff/admin users; no duplicate alert is sent if the record was already at that status.

---

## UC-4: Staff requests an AI care recommendation

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; the target
  record exists and is not soft-deleted.

Client priority served: catching plant deterioration early enough to remediate.
The recommendation gives maintenance staff concrete, actionable next steps
(watering, shade, pest treatment, pruning, when to escalate) so an at-risk or
critical plant can be treated before it is lost.

Main flow:

1. On a plant's detail page, the staff member clicks "Get AI Recommendation"
   (or "Regenerate" if one already exists).
2. The frontend calls `POST /api/flora/:id/care-recommendation`.
3. The backend loads the record, builds a prompt from the plant's species,
   common name, location zone, health status, and notes, and calls Gemini
   (`gemini-3.5-flash`).
4. Gemini returns 3-5 short, emoji-prefixed actionable bullets (💧 watering,
   🌤️ shade/light, 🐛 pest treatment, ✂️ pruning, ⚠️ escalation), plain text
   only.
5. The backend stores the text in `care_recommendation`, saves, and returns
   `200` with the updated record. The detail page renders the bullets.

Alternate / edge flows:

- Non-existent (or soft-deleted) plant -> `404`. The record lookup happens
  before the AI key check.
- No API key configured (`GEMINI_API_KEY` unset) -> `503`
  `{ "error": "AI service not configured" }` - a graceful message, not a crash
  (verified by test).
- Gemini request fails (network, quota, upstream error) -> `502`
  `{ "error": "AI request failed: <message>" }`; no recommendation is saved.
- A resident attempting the request -> `403`.

Postcondition: on success, the plant's `care_recommendation` field holds the
latest AI guidance and is shown on the detail page; regenerating overwrites it.

---

## UC-5: Staff soft-deletes an obsolete record

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; the record
  exists and is not already deleted.

Main flow:

1. On a plant's detail page, the staff member clicks Delete and confirms in the
   dialog.
2. The frontend calls `DELETE /api/flora/:id`.
3. The backend sets `is_deleted = true` on the record (the row is not physically
   removed) and returns `200` `{ "message": "Greenery record deleted" }`.
4. The frontend navigates back to the list, where the record no longer appears.

Alternate / edge flows:

- Record not found or already deleted -> `404`
  `{ "error": "Greenery record not found" }`.
- A resident attempting the delete -> `403`.

Postcondition: the record is hidden from all list and detail responses (every
read query filters on `is_deleted = false`) but is retained in the database,
supporting the client's 3-5 year data retention preference.
