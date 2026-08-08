# Use Cases - Member 3 (Klemens)

Use cases for the Resident Reports & Authentication module, based on the
implemented features: JWT auth, role-based access control (resident /
welfare_partner / field_officer / manager), report CRUD, Cloudinary photo
upload, the either/or location rule (block number or GPS), the case status
workflow (open / in_progress / resolved), the resolve-notification email, and
AI catalog querying.

---

## UC-1: Resident registers and logs in

- Actor: resident
- Precondition: the user does not yet have an account (or has one and wants to
  log in).

Main flow:

1. The user opens the Register page and enters name, email, and password.
2. The frontend validates the input (name >= 2 chars, valid email, password
   >= 6 chars) and submits to `POST /api/auth/register`.
3. The backend hashes the password (bcrypt) and creates a `User` with role
   `resident`, returning `{ user_id, name, email, role }` (no password hash).
4. The user is redirected to the Login page and submits email + password to
   `POST /api/auth/login`.
5. The backend verifies the credentials and returns a JWT (`{ user_id, role,
   name }`, 7-day expiry).
6. The frontend stores the token in localStorage and the user lands logged in.

Alternate / exception flows:

- Invalid registration input -> `400`, field-level errors shown; no account
  created.
- Email already registered -> `400` "Email already registered".
- Wrong email or password at login -> `401` "Invalid email or password" (the
  same message for both, so existing accounts are not revealed).
- A caller sends a `role` field in the registration body -> it is ignored. The
  register schema does not define `role` at all and `authController` hardcodes
  `role: 'resident'` on create, so public registration can never produce a
  privileged account. Welfare partner, field officer and manager accounts are
  created by the seed script instead.

Postcondition: the user has an account with role `resident` and a valid JWT;
protected pages and endpoints are accessible.

---

## UC-2: Resident submits a report (with optional photo and GPS pin)

- Actor: resident
- Precondition: the user is logged in.

Main flow:

1. The resident opens the Submit Report form and selects a category, enters a
   title and description, and optionally block number / floor level. The form
   states the location rule up front: fill in either a block number or a GPS
   location.
2. (Optional) The resident clicks "Add Photo" and selects an image. The frontend
   uploads it via `POST /api/uploads` (multipart field `image`) and shows a
   thumbnail preview; the returned URL is held for submission.
3. (Optional) The resident clicks "Use My Location". The frontend calls the
   browser's `navigator.geolocation.getCurrentPosition`, and on success shows the
   captured coordinates with a Clear button next to them.
4. The resident submits the form. The frontend first applies the location rule
   itself: if there is neither a block number nor captured coordinates, it shows
   an inline error and does not call the API.
5. Otherwise the frontend submits to `POST /api/reports`, including `photo_urls`
   (0 or 1 URL) and `gps_lat` / `gps_lng` only when coordinates were captured.
6. The backend validates the body, re-checks the location rule, sets
   `reported_by` from the JWT, creates the report with status `open`, and
   returns `201`.
7. The frontend redirects to My Reports.

Alternate / exception flows:

- Missing required fields (category / title / description) or title > 200 chars
  -> `400`, field-level validation errors; no report created.
- Neither a block number nor GPS coordinates -> the client blocks the submit
  first; a request that reaches the API anyway gets `400` "A block number or a
  GPS location is required". Neither field is required on its own - only the
  pair being empty is rejected, and both `gps_lat` and `gps_lng` must be present
  to count as a location.
- The browser does not support geolocation, or the resident denies the location
  permission -> an inline message is shown ("You can still submit without GPS")
  and the submit is never blocked by it; the resident can still submit with a
  block number.
- Photo is not an image, is over 5MB, or is sent under the wrong field name ->
  `400` with a clear message; the upload is rejected and can be retried.
- Cloudinary upload failure -> `500`; the report can still be submitted without
  a photo.

Postcondition: a new report exists, owned by the resident, status `open`, with
at least one of block number / GPS coordinates, optionally with one photo URL.
If the category is `community_cat` or `pigeon`, the backend also mirrors the
report into a `FaunaSighting` (fire-and-forget) so the fauna module sees
resident complaints; a failure there is logged and never affects the report.

---

## UC-3: Resident views their own reports and a report's details

- Actor: resident
- Precondition: the user is logged in.

Main flow:

1. The resident opens My Reports; the frontend calls `GET /api/reports`.
2. The backend returns only the resident's own non-deleted reports (newest
   first), each shown as a card with title, category, status chip, block, and
   date.
3. The resident clicks a card, navigating to the report detail page
   (`GET /api/reports/:id`).
4. The detail page shows full report fields, any photos, the reporter name, and
   the status history (each `old -> new` change with changer name and date).

Alternate / exception flows:

- The resident has no reports -> an empty-state message with a link to submit
  one.
- List or detail request fails -> an error message is shown.

Postcondition: the resident has viewed their reports; no data is changed.

---

## UC-4: Resident is blocked from another resident's report (RBAC)

- Actor: resident
- Precondition: the user is logged in; a report owned by a different resident
  exists.

Main flow:

1. The resident attempts to open a report they do not own (e.g. by navigating
   directly to `/reports/:id` for someone else's report).
2. The frontend calls `GET /api/reports/:id`.
3. The backend sees the requester's role is not in `INTERNAL_ROLES`
   (`field_officer`, `manager`) and that they are not the owner, and responds
   `403` "Forbidden".
4. The detail page shows "You do not have access to this report."

Alternate / exception flows:

- The report id does not exist or is soft-deleted -> `404` "Report not found".
- A resident's `GET /api/reports` list never includes other residents' reports
  in the first place (server-side scoping on the same `INTERNAL_ROLES` check).
- The scoping tests membership of `INTERNAL_ROLES` rather than testing for
  `resident`, so a `welfare_partner` is also limited to their own reports here -
  their broader access is zone-based and applies to fauna sightings (UC-10),
  not to resident reports.

Postcondition: the resident cannot see another resident's report; no data is
exposed or changed.

---

## UC-5: Field officer views all reports, filters them, and updates a status

- Actor: field_officer (or manager)
- Precondition: the user is logged in with role field_officer or manager.

Main flow:

1. The user opens All Reports (a nav link visible only to field officers and
   managers); the frontend calls `GET /api/reports`.
2. The backend returns all non-deleted reports (not scoped to the user), each
   card also showing the reporter's name.
3. The user applies status and/or category filters; the frontend re-fetches with
   `?status=` and/or `?category=` query params.
4. The user opens a report's detail page, which shows a status update control
   (dropdown + button) not visible to residents.
5. The user selects a new status and submits
   `PATCH /api/reports/:id/status`.
6. The backend records a `CaseStatusLog` entry (old -> new, changed_by) and
   returns the updated report; the detail page refreshes to show the new status
   and a new history entry.

Alternate / exception flows:

- Invalid status value -> `400`.
- A resident or welfare partner attempting `PATCH /api/reports/:id/status` ->
  `403` (the route is wrapped in `restrictTo('field_officer', 'manager')`);
  residents never see the control.
- Status set to the same value -> the response succeeds but no log entry is
  created (no actual change).
- Report not found or soft-deleted -> `404`.

Postcondition: the report's status is updated and the change is recorded in its
status history.

---

## UC-6: Resolving a report notifies the resident by email

- Actor: field_officer (or manager); the resident is the recipient.
- Precondition: a report exists with a status other than `resolved`; the
  reporter has an email on file.

Main flow:

1. A field officer or manager updates the report's status to `resolved` via
   `PATCH /api/reports/:id/status`.
2. The backend records the status change (`CaseStatusLog`) and, because the new
   status is specifically `resolved`, looks up the report's reporter.
3. The backend sends an email to the reporter ("Your report has been resolved",
   referencing the report title). `config/mailer.js` uses real SMTP when
   `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are all set; with any of them unset
   it falls back to an Ethereal test account, which logs a preview URL instead of
   delivering real mail.
4. The status update response returns immediately; the email is sent
   fire-and-forget.

Alternate / exception flows:

- Email sending fails (e.g. mail service down) -> the failure is logged but the
  status update still succeeds; the response is unaffected.
- Status changes to `open` or `in_progress` -> no email is sent (only `resolved`
  triggers it).

Postcondition: the report is `resolved` and the reporter has been notified (or a
preview URL is logged); a failed email never blocks the status change.

---

## UC-7: Manager soft-deletes a report

- Actor: manager
- Precondition: the user is logged in with role manager; the target report
  exists and is not already deleted.

Main flow:

1. The manager issues `DELETE /api/reports/:id`.
2. The backend sets `is_deleted = true` on the report (the row is not physically
   removed) and returns `200` "Report deleted".
3. The report no longer appears in any list or detail responses, since all read
   queries filter on `is_deleted = false`.

Alternate / exception flows:

- A field officer, welfare partner or resident attempts the delete -> `403` (the
  route is restricted to `manager` only).
- The report does not exist or is already deleted -> `404` "Report not found".

Postcondition: the report is hidden from the API but retained in the database
for audit; its status history remains intact.

---

## UC-8: Field officer queries the plant catalog in natural language (AI)

- Actor: field_officer (or manager)
- Precondition: the user is logged in with role field_officer or manager; the
  greenery catalog has seeded `GreeneryRecord` data; `GEMINI_API_KEY` is
  configured.

Main flow:

1. The user opens the Handbook page (`/handbook`, a nav link visible only to
   field officers and managers) and types a question in plain English, e.g.
   "Which plants in Zone B are at risk?".
2. The frontend submits the question to `POST /api/flora/query`.
3. The backend validates the question (non-empty, max 500 characters), loads
   all non-deleted greenery records, and sends the question plus the formatted
   catalog to Gemini. The prompt restricts the model to the catalog data only.
4. The backend scans the answer for the species and common names of those same
   records and returns the matches as `referencedPlants` (id, species,
   common_name), ordered by where each plant first appears in the answer.
5. The backend returns `200` with `{ question, answer, plantCount,
   referencedPlants }`; the page shows the plain-text answer, how many plants it
   was grounded in, and a "Plants mentioned" row of chips.
6. The user clicks a chip and lands on that plant's detail page (`/flora/:id`).

Alternate / exception flows:

- The catalog does not contain the information needed (e.g. a question about a
  plant that is not in the catalog) -> the model is instructed to say so
  clearly rather than inventing an answer; the response is still `200` with
  that "cannot answer from the catalog" text as the answer.
- The model names a plant that is not in the catalog -> it cannot become a chip.
  Matching runs only over the records fetched from the database, so an invented
  name matches nothing and `referencedPlants` simply does not include it. Every
  chip therefore links to a real record.
- Empty/missing question or over 500 characters -> `400`; nothing is sent to
  the AI.
- A resident or welfare partner attempting the request -> `403` (the route is
  restricted to field officers and managers).
- `GEMINI_API_KEY` not configured -> `503` "AI service not configured".
- Gemini is rate-limited or out of quota -> `429` "The AI service is busy right
  now. Please try again in a moment."
- Gemini is overloaded or unavailable -> `503` "The AI service is temporarily
  overloaded. Please try again in a moment."
- Any other Gemini failure -> `502` "Could not get an answer from the AI
  service. Please try again." The raw SDK error is logged server-side rather
  than shown to the user.

Postcondition: the user has an answer grounded only in the actual catalog data,
with links to the records it referenced; no data is changed.

---

## UC-9: A logged-in user is blocked from a page their role cannot use (defense in depth)

- Actor: resident (the same applies to any role outside a route's list)
- Precondition: the user is logged in with a role that is not permitted for the
  target page.

Main flow:

1. The resident types a URL their role cannot use directly into the browser,
   e.g. `/handbook` or `/dashboard`. The nav drawer only renders the groups
   their role can use, so these links are never shown to them and direct URL
   entry is the only way to reach them.
2. The route is wrapped in `ProtectedRoute` with
   `roles={['field_officer', 'manager']}`; since the resident's role is not in
   the list, `ProtectedRoute` redirects to the home page (`/`) instead of
   rendering the page.
3. Even if the frontend gate were bypassed (e.g. calling the API directly with
   a resident token), the backend routes are protected by
   `restrictTo('field_officer', 'manager')` and respond `403` - the server never
   trusts the client.

Alternate / exception flows:

- A user who is not logged in at all visits any protected URL ->
  `ProtectedRoute` redirects to `/login` instead (the `roles` prop is optional;
  without it the guard checks authentication only).
- A logged-out or expired-token API request -> `401` from `protect`.
- A route open to more roles than the nav suggests, e.g. `/fauna`, lists all of
  them in its `roles` prop (`field_officer`, `manager`, `welfare_partner`) and
  the matching `restrictTo` call - the two lists are kept in step deliberately.

Postcondition: pages and data a role cannot use are unreachable at three layers -
the nav hides the links, `ProtectedRoute` blocks the route by role, and
`restrictTo` blocks the API; no data is exposed.

---

## UC-10: Welfare partner sees only fauna sightings in their assigned zone

- Actor: welfare_partner
- Precondition: the user is logged in with role welfare_partner and has one or
  more `ZoneAssignment` rows naming the blocks they cover.

Main flow:

1. The welfare partner opens Fauna Sightings; the frontend calls
   `GET /api/fauna`.
2. The backend calls `getAssignedBlocks(req.user)`, which returns the partner's
   block numbers (it returns `null` for every other role, meaning no zone
   restriction).
3. The list query is constrained to those blocks, so the partner sees sightings
   in their zone regardless of who reported them - the zone is their access
   boundary, not ownership.
4. The partner opens a sighting inside their zone and it loads normally
   (`GET /api/fauna/:id`).
5. The partner logs a new sighting for a block they cover
   (`POST /api/fauna`) and it is created.

Alternate / exception flows:

- The partner requests a sighting in a block outside their zone -> `403`
  "Forbidden", because the assigned blocks do not include that sighting's block.
- The partner filters the list by a block outside their zone
  (`?block_number=`) -> an empty array. The zone filter is applied after the
  query filters, so a block parameter can never widen the zone.
- The partner has no `ZoneAssignment` rows at all -> `getAssignedBlocks` returns
  an empty array, which is meaningful and distinct from `null`: the list returns
  empty and every single sighting is `403`. No assignments means no access, not
  unrestricted access.
- The partner tries to log a sighting for a block outside their zone -> `403`
  "Forbidden".
- The partner attempts a field-officer-only fauna action, e.g. the hotspot map
  or a status update -> `403` from `restrictTo`, and the nav does not show
  Fauna Hotspots to them.

Postcondition: the welfare partner has seen and logged only sightings within
their assigned blocks; nothing outside their zone is exposed.
