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
4. Gemini returns the recommendation broken down by plant life stage - three
   plain-text-headed sections in order (Seedling/Young, Establishing, Mature),
   each with 2-3 emoji-prefixed bullets (💧 watering, 🌤️ shade/light, 🐛 pest
   treatment, ✂️ pruning, ⚠️ escalation) covering only the topics most
   relevant to that stage, not all five forced into every section. After all
   three stage sections, exactly one final bullet estimates the species'
   typical lifespan in Singapore's climate, prefixed with a distinct emoji
   (⏳) - not repeated per stage. Plain text only, no markdown.
5. The backend stores the text in `care_recommendation`, saves, and returns
   `200` with the updated record. The detail page renders the bullets.

Staff can also manually edit an existing recommendation, so an AI mistake
does not have to be fixed by discarding and regenerating the whole thing.
An "Edit" button appears next to the "AI Care Recommendation" title, but
only once a recommendation already exists. Clicking it replaces the
read-only bullets with an editable, pre-filled text area and hides the
Regenerate button while editing is in progress. "Save" sends a
`PATCH /api/flora/:id` with the edited `care_recommendation` text; "Cancel"
discards the draft and returns to the read-only view without calling the
API. If the save request fails, the error is shown inline and the text
area stays open with the edited text intact, so the in-progress edit is
not lost. This serves the same client priority as the main flow: it lets
staff correct details the AI occasionally gets wrong, so the guidance
shown to maintenance staff stays accurate.

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

## UC-8: Staff selects a known species and gets botanical fields auto-filled

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin, on the Add
  Plant form or a plant's Edit form.

Main flow:

1. On opening the form, the frontend calls `GET /api/flora/species-catalog`.
2. The backend loads all active (non-deleted) records, groups them by
   `species`, and - ordering by `createdAt` descending first - keeps one
   representative entry per distinct species (`plant_family`,
   `site_suitability`, `color`, `max_height_at_maturity`), so the most
   recently created record for that species wins. It returns `200` with the
   array of distinct species entries.
3. The staff member starts typing in the Species field, a freeSolo
   Autocomplete whose options are the distinct species names from the
   catalog.
4. The staff member selects an existing species from the dropdown list.
5. The frontend sets the species field to the selected value, then looks up
   that species in the catalog and, for each of `plant_family`,
   `site_suitability`, `color`, and `max_height_at_maturity`, fills in the
   catalog's value only if the corresponding field on the form is currently
   empty - a field the staff member has already typed into is never
   overwritten.

Alternate / edge flows:

- Typing free text that does not match any catalog species -> no match is
  found, so no fields are auto-filled; the typed species is kept as-is
  (freeSolo).
- Clearing the Species field -> the field is set to empty and no auto-fill
  logic runs.
- This applies identically on both the Add Plant form (AddFlora.jsx) and the
  Edit Plant form (FloraDetail.jsx).
- If `GET /api/flora/species-catalog` fails (network error, non-2xx
  response), the frontend catches the error and falls back to an empty
  catalog rather than showing an error to the user; the Species field still
  works as a plain freeSolo text input, just without autocomplete options or
  auto-fill.
- A resident attempting to load either form -> `403` on the
  `species-catalog` call, consistent with the RBAC note at the top of this
  document (staff/admin only).

Postcondition: the species field reflects the staff member's selection or
free text; any previously-blank botanical fields (`plant_family`,
`site_suitability`, `color`, `max_height_at_maturity`) are pre-filled from
the most recent existing record of that species, while fields already
populated by the staff member are left untouched.

## UC-9: Staff captures GPS coordinates for a location entry

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

## UC-10: Staff gets AI-suggested species for a planting site condition

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Client priority served: helping horticulture officers choose what to plant
for a new or difficult site (e.g. shade, poor drainage, low-maintenance
requirement) by reasoning over the estate's own catalog instead of generic
gardening advice, so every suggestion is something staff can actually source
and has likely already grown successfully on this estate.

Main flow:

1. On the Horticulture Handbook page, in the Planting Suggestions card, the
   staff member describes the site in free text (e.g. "shaded car park, low
   maintenance, no fruiting trees").
2. Clicking "Suggest" calls `POST /api/flora/planting-suggestions` with
   `{ condition }`.
3. The backend loads every active (non-deleted) `GreeneryRecord`'s species,
   plant family, site suitability, colour, and max height at maturity, and
   builds a catalog listing from them.
4. The backend prompts Gemini (`gemini-3.5-flash`) to recommend species using
   ONLY that catalog - it is explicitly told not to invent species outside
   the list - and to weigh every entry comparatively against the stated
   condition, recommending the closest-fitting options with an honest
   tradeoff for each (e.g. "close fit but slightly more sun-tolerant than
   ideal") even when nothing matches perfectly. The prompt only allows "no
   suitable match" as an answer when literally nothing comes reasonably
   close, not merely because no entry satisfies every criterion exactly.
   These grounding and reasoning rules are unchanged from before - only the
   response format described in steps 5-7 below is new.
5. The backend asks Gemini to respond with ONLY a JSON object (no markdown,
   no code fences) shaped as `{ recommendations: [{ species, tradeoff }],
   notes }` - one array entry per recommended catalog species paired with
   its honest tradeoff, plus a closing `notes` field for general context
   (e.g. species to avoid and why, or the explanation when
   `recommendations` is empty). The backend strips any code-fence wrapper
   Gemini might still add, parses the result as JSON, and returns `200`
   with that parsed `{ recommendations, notes }` object.
6. The card renders each `recommendations` entry as a row showing the
   tradeoff text under the species name; the species name itself is a
   clickable element. The closing `notes` text is shown beneath the list.
7. Clicking a recommended species name opens a dialog showing that
   species' full botanical details - family, site suitability, colour, max
   height at maturity, and a photo if one is on record - looked up by
   species name from the plant catalog data this page has already loaded
   (`GET /api/flora?include_catalog=true`, deduplicated to one entry per
   species). No extra API call is made for this lookup.

Alternate / edge flows:

- Empty or whitespace-only condition -> `400` `{ "error": "condition is
  required" }`; the frontend also disables the Suggest button while the
  field is blank, so this mainly guards direct API calls.
- No API key configured (`GEMINI_API_KEY` unset) -> `503`
  `{ "error": "AI service not configured" }`; the frontend shows "AI
  querying is not configured (no API key set)".
- Gemini request fails (network, quota, upstream error) -> `502`
  `{ "error": "AI request failed: <message>" }`; the frontend shows the
  returned error message, or a generic fallback if none is present.
- Gemini's response cannot be parsed as JSON (e.g. it added stray
  commentary) -> the backend falls back to returning `200` with
  `{ raw: "<the unparsed response text>" }` instead of `{ recommendations,
  notes }` - the same fallback pattern used by `identifySpecies`. The
  frontend detects the `raw` field and renders it as a single plain-text
  block, with no clickable species and no details dialog.
- A recommended species is clicked but is not found in the already-loaded
  catalog data (shouldn't happen in practice, since Gemini is grounded to
  the same catalog, but is handled defensively) -> the dialog opens
  showing "Details not available." instead of erroring.
- A resident attempting the request -> `403` (same RBAC as every other
  flora route).
- No active greenery records exist -> the catalog sent to Gemini is empty,
  so the model has nothing grounded to recommend from.

Postcondition: the staff member sees a set of catalog-grounded planting
suggestions with tradeoffs for the described site, with each suggested
species clickable through to its full botanical details; no data is
persisted - each request is independent and nothing is saved to any record.

## UC-11: Staff picks a location from an interactive map

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin, and is on the
  Add Plant form with at least one location entry.

Main flow:

1. On a location card in the Add Plant form, next to "Capture GPS Location",
   the staff member clicks "Pick from Map".
2. A dialog opens showing a Leaflet/OpenStreetMap map (the same mapping
   library and pattern used by the Fauna Sightings module, per team
   convention - no external Google Maps dependency, no API key required).
3. The staff member clicks anywhere on the map to drop a pin; the Confirm
   button stays disabled until a point has been picked.
4. Clicking Confirm stores the picked point's coordinates into that
   location's `gps_lat`/`gps_lng` fields, then reverse-geocodes the
   coordinates via OpenStreetMap's free Nominatim API
   (`GET https://nominatim.openstreetmap.org/reverse`) to derive a
   descriptive place name for `location_zone`.
5. Separately, the geocoded result's address fields are checked against the
   existing `SINGAPORE_LOCATIONS` list (the same 55 URA planning areas used
   by the Location Autocomplete in UC-1). If a match is found, `location` is
   auto-filled with the matched canonical value; if no match is found,
   `location_zone` still fills but `location` is left for the staff member
   to pick or type manually.
6. The dialog closes.

Alternate / edge flows:

- Clicking Cancel discards the pick entirely - no coordinates, location
  zone, or location are changed on that location's card.
- The reverse-geocoding request fails (network error) or returns no usable
  place name (no `suburb`, `neighbourhood`, `city_district`, or
  `display_name` in the response) -> `gps_lat`/`gps_lng` are still saved
  from the picked point, and a note, "Couldn't auto-fill location name from
  the map pin - please type it manually.", is shown on the location card so
  the staff member knows to fill `location_zone` and `location` themselves.
- The reverse-geocoding request succeeds and fills `location_zone`, but no
  entry in `SINGAPORE_LOCATIONS` matches the geocoded address -> a lighter
  note, "Location zone filled from map pin - please select the Location
  area manually.", is shown, since only `location` needs manual entry in
  this case.
- While the reverse-geocode lookup is in progress, both Cancel and Confirm
  are disabled and the dialog shows "Looking up location name...".
- This feature is scoped to the Add Plant form only, same as GPS capture
  (UC-9). The Edit Plant form (`FloraDetail.jsx`) has no "Pick from Map"
  button.

Postcondition: the location's `gps_lat`/`gps_lng` reflect the picked map
point. `location_zone` is filled with a geocoded place name whenever
Nominatim returns one; `location` is additionally auto-filled only when
that place name matches an entry in `SINGAPORE_LOCATIONS`, otherwise it is
left for the staff member to complete manually.

---

## UC-12: Staff identifies a plant species from a photo

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin, is on the Add
  Plant form, and has already uploaded a photo for that location entry.

Client priority served: speeding up data entry for field officers who can
photograph a plant on-site but may not know its species offhand, while
keeping a human in the loop so a wrong AI guess never silently corrupts the
record.

Main flow:

1. After a photo is uploaded for a location entry, an "Identify Species"
   button appears next to the photo preview (it is not rendered at all until
   `loc.imageUrl` is set - there is no location entry without a photo to
   disable it against).
2. Clicking the button calls `POST /api/flora/identify-species` with
   `{ image_url }`, the Cloudinary URL of the already-uploaded photo.
3. The backend fetches the image server-side, converts it to base64, and
   sends it to Gemini (`gemini-3.5-flash`) as inline image data alongside a
   text prompt - a vision call, unlike the text-only prompts used by the
   other AI features (UC-4, UC-10).
4. The prompt instructs Gemini to return only a JSON object shaped
   `{"species": "...", "confidence": "high|medium|low", "notes": "..."}`,
   and to honestly set `species` to "Unknown" and explain why in `notes`
   rather than guess, if the photo does not clearly show a plant.
5. The backend strips any markdown code fences from the response and parses
   it as JSON, returning `200` with the parsed `{ species, confidence,
   notes }`.
6. The frontend shows the suggestion in an info alert with two actions:
   "Use this species" and "Dismiss". The suggestion is never auto-applied.
7. Clicking "Use this species" calls the same species-selection/autofill
   handler used by the Species Autocomplete (UC-8) with the suggested
   species name, so plant_family/site_suitability/color/max_height_at_maturity
   are filled in from the catalog only where still blank; clicking "Dismiss"
   discards the suggestion without changing the form.

Alternate / edge flows:

- Missing or blank `image_url` -> `400` `{ "error": "image_url is
  required" }`.
- No API key configured (`GEMINI_API_KEY` unset) -> `503`
  `{ "error": "AI service not configured" }`.
- The image fetch or the Gemini request fails (network error, bad status,
  quota, upstream error) -> `502` with an error message describing which
  step failed.
- Gemini's response is not valid JSON -> the backend falls back to `200`
  `{ "raw": "<the raw text>" }`; the frontend renders this as plain text
  under a "Could not be structured into a clean suggestion:" heading with
  only a "Dismiss" action - "Use this species" is not offered since there is
  no parsed species to apply.
- A resident attempting the request -> `403` (same RBAC as every other
  flora route).

Postcondition: on "Use this species", the form's species field (and any
still-blank botanical fields) reflect the suggestion, identical to a manual
Species Autocomplete selection; on "Dismiss" or any error, the form is
unchanged and nothing is persisted - identification is stateless and does
not save to the record until the staff member submits the form.
