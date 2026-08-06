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
(`protect`). Residents have no access to the flora module at all - GET, POST,
PATCH, and DELETE on `/api/flora` are all restricted to `staff` or `admin`
only (`restrictTo('staff', 'admin')`); a resident attempting any of them
receives `403`.

Case-insensitivity note (applies to the `plant_family`, `site_suitability`,
and `location` filters, used in UC-6 and UC-7): these filters use a
dialect-aware operator - `Op.iLike` on Postgres, `Op.substring` on SQLite - so
searches match regardless of casing on both databases. This was fixed because
Postgres/Neon's `LIKE` is case-sensitive unlike SQLite's, which would have
silently broken these filters after deployment.

---

## UC-1: Staff records a plant observation across one or more locations

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Main flow:

1. The staff member opens the Add a Plant form and enters species (required,
   shared across every location in this submission), and optionally common
   name, plant family, site suitability, colour, and max height at maturity.
2. For each place the species was observed, the staff member fills in a
   location entry: location (broad area, e.g. "Bishan", picked from an
   Autocomplete of Singapore's 55 URA planning areas or typed freely),
   location zone (specific spot, e.g. a block or planter box), health status
   (defaults to `healthy`), health notes, and an optional photo (uploaded to
   Cloudinary via `POST /api/uploads`, returning an image URL). Clicking
   "Add Another Location" appends a further blank location card; any card can
   be removed once there is more than one.
3. The frontend validates the input (species required, health status required
   per location) and submits one `POST /api/flora` request per location, each
   carrying the shared species/botanical fields plus that location's own
   fields and photo URL.
4. The backend re-validates each request with yup, sets `recorded_by` from the
   JWT (`req.user.user_id`), and creates one `GreeneryRecord` per location with
   `is_deleted` defaulting to `false`, returning `201`.
5. Once every location has saved successfully, the frontend redirects to the
   Flora list, where the new plants appear at the top (newest first) with
   colour-coded health chips.

Alternate / edge flows:

- Missing species or an invalid `health_status` (not one of `healthy`,
  `at_risk`, `critical`) on any location -> `400` for that location's request,
  field-level validation errors; no record created for that location.
- A `recorded_by` value sent in the request body is ignored; the recorder is
  always taken from the token (verified by test).
- A resident attempting to submit -> `403`; the Add Plant control leads to a
  staff/admin-only action.
- Partial failure across locations: if some locations save and others fail,
  the locations that saved are dropped from the form and only the failed
  ones remain, each showing its error, so the staff member can fix and
  resubmit just those without accidentally re-creating the ones that already
  saved (preventing duplicate submissions).

Postcondition: 
One new greenery record exists per successfully-submitted location, each owned by the staff member who created it, and visible in the plant directory. 

If a record is created directly with health_status of at_risk or critical, an alert email is also dispatched to all staff/admin users. 

---

## UC-2: Staff bulk-imports greenery data from a CSV export

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; NParks (or
  another source) has provided plant data as a CSV export.

Main flow:

1. The staff member opens the Flora list and, in the CSV Upload card, selects a
   `.csv` file. The first row is treated as the header; recognised columns are
   `species`, `common_name`, `location`, `location_zone`, `health_status`,
   `health_notes`, `plant_family`, `site_suitability`, `color`,
   `max_height_at_maturity`, `last_inspected_at`.
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
2. They change the health status (e.g. `healthy` -> `at_risk`), health notes,
   location, or other editable fields, and/or upload a new photo, replace the
   existing one, or remove it (via Cloudinary), then submit
   `PATCH /api/flora/:id`.
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
   🌤️ shade/light, 🐛 pest treatment, ✂️ pruning, ⚠️ escalation), plus one
   additional bullet estimating the species' typical lifespan in Singapore's
   climate, prefixed with a distinct emoji (⏳) separate from the five care
   categories, plain text only.
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

---

## UC-6: Staff browses the Horticulture Handbook before planting

- Actor: staff (or admin)
- Precondition: the user is logged in.

Client priority served: giving horticulture officers a quick, searchable
botanical reference distinct from day-to-day health monitoring, so planting
decisions (family, site suitability, colour, expected mature height) can be
made without cross-referencing external sources.

Main flow:

1. The staff member opens the Horticulture Handbook page and optionally
   enters a plant family, site suitability, or colour to narrow the results.
2. The frontend debounces the input and calls `GET /api/flora` with the
   corresponding query parameters (`plant_family`, `site_suitability`, `color`).
3. The backend filters active (non-deleted) records - partial match on
   `plant_family`/`site_suitability`, exact match on `color` - and returns
   the matching records.
4. The frontend renders each match as a card showing species, common name,
   family, site suitability, colour, max height at maturity, and a small
   health-status badge for context; a photo is also shown on the card when
   one has been recorded for the plant.
5. Clicking a card navigates to that plant's detail page (`/flora/:id`),
   where the same botanical fields can be viewed in full or edited.

Alternate / edge flows:

- No filters entered -> all active records are shown.
- No records match the given filters -> the page shows "No plants match
  these filters" instead of an empty list with no explanation.
- A plant with no botanical fields recorded (e.g. added before this feature,
  or left blank) -> only its known fields are shown; blank fields are omitted
  rather than displayed as empty labels.

Postcondition: the staff member has identified a plant matching their
criteria and can navigate to its full detail page for further action.

---

## UC-7: Staff filters flora records by location

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Main flow:

1. On the Flora Management page's Search & Filter toolbar, the staff member
   types into the Location field, alongside the existing species search and
   health status filter.
2. The frontend calls `GET /api/flora` with a `location` query parameter set
   to the typed text.
3. The backend filters active (non-deleted) records where `location` matches
   the given text (case-insensitively - see the case-insensitivity note near
   the top of this document), combined with any other active filters.
4. The frontend re-renders the list with only the matching records.

Alternate / edge flows:

- The Location filter is a plain free-text field, not restricted to a fixed
  list, so it matches any partial or custom text. Location entry on the Add
  Plant and Edit Plant forms is separately assisted by an Autocomplete of
  Singapore's 55 URA planning areas (freeSolo, so custom text is still
  accepted there too) - but that Autocomplete is not used on this filter
  toolbar.
- No location text entered -> the filter has no effect; other active filters
  still apply.
- No records match -> the list shows empty, consistent with the other
  filters.

Postcondition: the staff member sees only records whose location matches the
filter text, narrowing the plant directory for their current task.

---

## UC-8: Staff captures GPS coordinates for a location entry

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin, and is on the
  Add Plant form with at least one location entry.

Main flow:

1. On a location card in the Add Plant form, the staff member clicks "Capture
   GPS Location".
2. The frontend calls the browser's built-in Geolocation API
   (`navigator.geolocation.getCurrentPosition`) - no external mapping or
   geolocation service is involved. While the request is in flight, the
   button is disabled and reads "Capturing...".
3. On success, the returned latitude and longitude are stored in that
   location's `gps_lat`/`gps_lng` fields, and a confirmation
   ("Location captured (lat, lng)") is shown on the card.
4. When the location is submitted, `gps_lat`/`gps_lng` are included in that
   location's `POST /api/flora` payload alongside its other fields.

Alternate / edge flows:

- The browser does not support the Geolocation API
  (`navigator.geolocation` is undefined) -> an inline error, "Geolocation is
  not supported by this browser", is shown on that location's card; the
  button is not clicked-through, nothing is submitted.
- The user denies the browser's location permission prompt -> an inline
  error, "Location permission denied", is shown.
- The request times out -> an inline error, "Location request timed out", is
  shown.
- Any other geolocation failure -> a generic inline error, "Unable to
  retrieve location", is shown.
- In every failure case, `gps_lat`/`gps_lng` for that location remain `null`
  and form submission is not blocked - GPS capture is optional/supplementary,
  never required. A location can be submitted with `gps_lat`/`gps_lng` left
  null.
- This feature is scoped to the Add Plant form only. The Edit Plant form
  (`FloraDetail.jsx`) has no "Capture GPS Location" button or geolocation
  logic - a plant's GPS coordinates cannot currently be added or changed
  after initial creation.

Postcondition: the location's greenery record is created with `gps_lat` and
`gps_lng` set to the captured coordinates if capture succeeded, or `null` if
it was skipped or failed.