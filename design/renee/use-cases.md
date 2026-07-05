# Use Cases - Member 2 (Renee)

Use cases for the Fauna Sightings module, based on the implemented features:
fauna sighting CRUD, Cloudinary photo upload, RBAC (cat GPS pins hidden from
residents), species and behaviour tag tracking, hotspot counter per block, and
AI-generated zone summary (Gemini API).

---

## UC-F1: Resident submits a fauna sighting

- Actor: resident (or volunteer)
- Precondition: the user is logged in.

Main flow:

1. The resident opens the Submit Sighting form and selects a species
   (`cat`, `pigeon`, `crow`, `mynah`, `other`), enters a block number,
   floor level, and optionally selects behaviour tags (e.g. `urinating`,
   `feeding`, `nesting`, `droppings`, `aggressive`).
2. (Optional) The resident clicks "Add Photo" and selects an image. The
   frontend uploads it via `POST /api/uploads` and shows a thumbnail preview;
   the returned Cloudinary URL is held for submission.
3. The resident submits the form to `POST /api/fauna`.
4. The backend sets `reported_by` from the JWT, creates the sighting with
   status `open`, and returns `201`.
5. The frontend redirects to My Sightings.

Alternate / exception flows:

- Missing required fields (species / block_number) -> `400`, validation errors
  shown; no sighting created.
- Photo upload fails -> `500`; the sighting can still be submitted without a
  photo.
- Invalid species value -> `400` validation failure.

Postcondition: a new fauna sighting exists, owned by the resident, status
`open`, with optional photo URL and behaviour tags.

---

## UC-F2: Resident views their own sightings

- Actor: resident
- Precondition: the user is logged in.

Main flow:

1. The resident opens My Sightings; the frontend calls `GET /api/fauna`.
2. The backend returns only the resident's own non-deleted sightings (newest
   first), each shown as a card with species, block number, status chip, and
   date.
3. The resident clicks a card to view the full sighting detail
   (`GET /api/fauna/:id`), which shows all fields including behaviour tags,
   floor level, photo, and status history.

Alternate / exception flows:

- The resident has no sightings -> an empty-state message with a link to
  submit one.
- List or detail request fails -> an error message is shown.

Postcondition: the resident has viewed their sightings; no data is changed.

---

## UC-F3: Resident is blocked from viewing cat GPS location (RBAC)

- Actor: resident
- Precondition: the user is logged in; a cat sighting with GPS coordinates
  exists.

Main flow:

1. The resident views their own cat sighting detail (`GET /api/fauna/:id`).
2. The backend detects the sighting species is `cat` and the requester is a
   `resident`.
3. The backend strips `gps_lat` and `gps_lng` from the response before
   returning it (fields are set to `null`).
4. The frontend shows the sighting without a map pin or GPS coordinates.

Alternate / exception flows:

- Staff or admin requesting the same sighting -> GPS coordinates are returned
  in full (no stripping).
- Non-cat species (pigeon, crow, etc.) -> GPS is returned to all roles without
  stripping.

Postcondition: the resident sees their cat sighting but cannot see the exact
GPS location; staff and admin see the full data.

---

## UC-F4: Resident is blocked from another resident's sighting (RBAC)

- Actor: resident
- Precondition: the user is logged in; a sighting owned by a different
  resident exists.

Main flow:

1. The resident attempts to open a sighting they do not own (e.g. by
   navigating directly to `/fauna/:id` for someone else's sighting).
2. The backend sees the requester is a resident who is not the owner and
   responds `403` "Forbidden".
3. The detail page shows "You do not have access to this sighting."

Alternate / exception flows:

- The sighting id does not exist or is soft-deleted -> `404` "Sighting not
  found".
- A resident's `GET /api/fauna` list never includes other residents' sightings
  (server-side scoping).

Postcondition: the resident cannot see another resident's sighting; no data is
exposed or changed.

---

## UC-F5: Staff views all sightings and filters them

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Main flow:

1. The staff member opens All Sightings (a nav link visible only to
   staff/admin); the frontend calls `GET /api/fauna`.
2. The backend returns all non-deleted sightings (not scoped to the user),
   each card also showing the reporter's name and full GPS coordinates
   (including cat sightings).
3. The staff member applies species and/or status filters; the frontend
   re-fetches with `?species=` and/or `?status=` query params.
4. The staff member opens a sighting's detail page which shows the full record
   including behaviour tags, GPS pin, photo, and agency recommendation.

Alternate / exception flows:

- No sightings match the filter -> an empty-state message is shown.
- Request fails -> an error alert is displayed.

Postcondition: the staff member has viewed all relevant sightings with full
location data; no data is changed.

---

## UC-F6: Staff updates a sighting status

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; a sighting
  exists.

Main flow:

1. The staff member opens a sighting's detail page and sees the status update
   control (not visible to residents).
2. The staff member selects a new status (`open`, `in_progress`, `resolved`)
   and submits `PATCH /api/fauna/:id/status`.
3. The backend updates the status and returns the updated sighting.
4. The detail page refreshes to show the new status.

Alternate / exception flows:

- Invalid status value -> `400`.
- A resident attempting to update status -> `403` (route restricted to
  staff/admin).
- Sighting not found or soft-deleted -> `404`.

Postcondition: the sighting status is updated.

---

## UC-F7: Staff views hotspot counter per block

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; at least one
  sighting exists.

Main flow:

1. The staff member opens the Hotspots page; the frontend calls
   `GET /api/fauna/hotspots`.
2. The backend counts non-deleted sightings grouped by `block_number` and
   `species`, returning an array sorted by count descending.
3. The frontend displays each block as a card showing the block number, total
   sighting count, and a breakdown by species.
4. The staff member clicks a block card to trigger the AI summary.

Alternate / exception flows:

- No sightings exist -> an empty-state message is shown.
- Request fails -> an error alert is displayed.

Postcondition: the staff member has a clear view of which blocks have the most
fauna activity; no data is changed.

---

## UC-F8: Staff triggers AI zone summary for a hotspot block

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; at least one
  sighting exists for the selected block.

Main flow:

1. The staff member clicks a block card on the Hotspots page.
2. The frontend calls `GET /api/fauna/hotspots/:block/summary`.
3. The backend fetches the last 30 days of sightings for that block and sends
   a prompt to the Gemini API asking for a one-paragraph plain-English summary
   of recent activity.
4. The backend returns the AI-generated summary text.
5. The frontend displays the summary in a modal or expanded panel below the
   block card. The agency recommendation (Cat Welfare Society / SPCA / ACRES)
   is also shown based on the dominant species in that block.

Alternate / exception flows:

- Gemini API is unavailable or returns an error -> the backend returns a
  fallback message: "AI summary unavailable. Please try again later."
- No sightings in the last 30 days for that block -> the backend returns
  "No recent sightings recorded for this block."
- A resident attempts to access this endpoint -> `403` (route restricted to
  staff/admin).

Postcondition: the staff member has an AI-generated summary of fauna activity
for the selected block and knows which agency to contact.

---

## UC-F9: Admin soft-deletes a sighting

- Actor: admin
- Precondition: the user is logged in with role admin; the target sighting
  exists and is not already deleted.

Main flow:

1. The admin issues `DELETE /api/fauna/:id`.
2. The backend sets `is_deleted = true` on the sighting (the row is not
   physically removed) and returns `200` "Sighting deleted".
3. The sighting no longer appears in any list or detail responses.

Alternate / exception flows:

- A staff member or resident attempts the delete -> `403` (route restricted to
  admin).
- The sighting does not exist or is already deleted -> `404` "Sighting not
  found".

Postcondition: the sighting is hidden from the API but retained in the
database for audit.
