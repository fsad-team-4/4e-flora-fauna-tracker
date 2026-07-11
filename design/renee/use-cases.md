# Use Cases - Member 2 (Renee)

Use cases for the Fauna Sightings module. FaunaSighting records are created
automatically when a resident submits a ResidentReport with category
`community_cat` or `pigeon` — there is no separate resident-facing submission
form. The module is staff-facing: it aggregates sighting data from resident
complaints into a hotspot dashboard, AI-generated zone summaries, and agency
recommendations, giving staff the trend visibility needed to make proactive
intervention decisions (human in the loop).

---

## UC-F1: System auto-creates a FaunaSighting from a ResidentReport

- Actor: system (triggered by Klemens's reportController after ResidentReport
  is created)
- Precondition: a resident has submitted a ResidentReport with category
  `community_cat` or `pigeon`.

Main flow:

1. Resident submits a ResidentReport via `POST /api/reports` with category
   `community_cat` or `pigeon`, including block number, floor level, GPS
   coordinates, photo, and description.
2. Klemens's `reportController` creates the ResidentReport successfully.
3. Immediately after, the controller calls `createFaunaSightingFromReport()`
   which maps the report fields to a FaunaSighting record:
   - `community_cat` → species `cat`
   - `pigeon` → species `pigeon`
   - `block_number`, `floor_level`, `gps_lat`, `gps_lng`, `photo_urls[0]`
     and `description` are carried across
   - `reported_by` is taken from the JWT (same reporter)
   - `behaviour_tags` defaults to `[]` (not captured at complaint stage)
   - `status` defaults to `open`
4. The FaunaSighting is created silently — the resident sees only the normal
   ResidentReport confirmation. No second form or extra step required.

Alternate / exception flows:

- ResidentReport category is not `community_cat` or `pigeon` (e.g.
  `flora_health`, `pest`, `other`) → no FaunaSighting is created.
- FaunaSighting creation fails (e.g. database error) → the failure is logged
  but does not affect the ResidentReport response (fire-and-forget, same
  pattern as the resolve email in UC-6 of reportController).
- `block_number` is null on the ResidentReport → FaunaSighting is still
  created with `block_number` null; hotspot grouping will place it under
  `Unknown` block.

Postcondition: a FaunaSighting record exists, linked to the same reporter and
carrying the complaint's location and photo data, ready to feed the hotspot
dashboard.

---

## UC-F2: Staff views all fauna sightings and filters them

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; at least one
  FaunaSighting exists.

Main flow:

1. The staff member opens the Fauna Sightings page (nav link visible only to
   staff/admin); the frontend calls `GET /api/fauna`.
2. The backend returns all non-deleted sightings (not scoped to any user),
   newest first, each card showing species chip, block number, status, reporter
   name, and date. Full GPS coordinates are included for all species.
3. The staff member applies filters: `?species=`, `?status=`, or
   `?block_number=`. The frontend re-fetches with the selected params.
4. The staff member opens a sighting detail (`GET /api/fauna/:id`) to see the
   full record: species, behaviour tags, floor level, GPS, photo, reporter
   name, and the linked ResidentReport id.

Alternate / exception flows:

- No sightings match the filter → empty-state message shown.
- Request fails → error alert displayed.

Postcondition: the staff member has viewed the relevant sightings; no data is
changed.

---

## UC-F3: Staff updates a sighting status

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; a sighting
  exists.

Main flow:

1. The staff member opens a sighting detail page and sees the status update
   control (dropdown + button), not visible to residents.
2. The staff member selects a new status (`open`, `in_progress`, `resolved`)
   and submits `PATCH /api/fauna/:id/status`.
3. The backend updates the status and returns the updated sighting.
4. The detail page refreshes to show the new status chip.

Alternate / exception flows:

- Invalid status value → `400`.
- Sighting not found or soft-deleted → `404`.

Postcondition: the sighting status is updated; the change reflects the staff
member's decision on the case (human in the loop).

---

## UC-F4: Cat GPS coordinates are hidden from residents (RBAC)

- Actor: resident (viewing their own ResidentReport detail)
- Precondition: the ResidentReport was auto-linked to a cat FaunaSighting;
  the resident tries to access the sighting directly.

Main flow:

1. A resident attempts `GET /api/fauna/:id` for any sighting.
2. The backend checks `req.user.role`.
3. If the role is `resident` and the species is `cat`, `gps_lat` and `gps_lng`
   are stripped from the response (set to `null`).
4. If the role is `resident` and the sighting belongs to a different user,
   the backend returns `403`.

Note: residents do not have a dedicated fauna sighting UI — this RBAC rule
protects the API layer directly in case a resident queries the endpoint
directly (e.g. via a browser dev tool or API client).

Alternate / exception flows:

- Staff or admin requesting → full GPS returned, no stripping.
- Non-cat species → GPS returned to all roles.

Postcondition: cat GPS coordinates are never exposed to residents, protecting
community cat locations from potential misuse.

---

## UC-F5: Staff views hotspot counter per block

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; at least one
  sighting exists.

Main flow:

1. The staff member opens the Hotspots page; the frontend calls
   `GET /api/fauna/hotspots`.
2. The backend counts non-deleted sightings from the last 30 days (default),
   grouped by `block_number` and `species`, sorted by total count descending.
3. The frontend displays each block as a card: block number, total sighting
   count, and a species breakdown (e.g. cat: 7, pigeon: 4).
4. The staff member clicks a block card to trigger the AI summary (UC-F6).

Alternate / exception flows:

- No sightings in the period → empty-state message shown.
- `?days=` query param overrides the 30-day default.
- Request fails → error alert displayed.

Postcondition: the staff member can see which blocks have the highest fauna
activity in the selected period; no data is changed.

---

## UC-F6: Staff triggers AI zone summary for a hotspot block

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin; at least one
  sighting exists for the selected block in the last 30 days.

Main flow:

1. The staff member clicks a block card on the Hotspots page.
2. The frontend calls `GET /api/fauna/hotspots/:block/summary`.
3. The backend fetches the last 30 days of sightings for that block, builds a
   prompt with species counts and behaviour tags, and sends it to Gemini
   (`gemini-3.5-flash`).
4. Gemini returns a one-paragraph plain-English summary of recent activity.
5. The backend returns the summary, agency recommendation, sighting count, and
   period days.
6. The frontend displays the summary in a modal or expanded panel. The agency
   recommendation is shown (Cat Welfare Society / SPCA for cats; ACRES for
   birds) so staff knows who to contact.

Alternate / exception flows:

- Gemini API unavailable → `503` "AI summary unavailable. Please try again
  later." (fallback, does not crash the app).
- No sightings in the last 30 days for that block → `404` "No sightings found
  for this block".
- Resident attempts access → `403` (route restricted to staff/admin).

Postcondition: the staff member has an AI-generated summary of fauna activity
for the block and knows which agency to contact; the human property officer
then decides the action (human in the loop).

---

## UC-F7: Admin soft-deletes a sighting

- Actor: admin
- Precondition: the user is logged in with role admin; the target sighting
  exists and is not already deleted.

Main flow:

1. The admin issues `DELETE /api/fauna/:id`.
2. The backend sets `is_deleted = true` (row is not physically removed) and
   returns `200` "Sighting deleted".
3. The sighting no longer appears in any list, detail, or hotspot responses.

Alternate / exception flows:

- Staff or resident attempts delete → `403` (restricted to admin).
- Sighting not found or already deleted → `404` "Sighting not found".

Postcondition: the sighting is hidden from the API but retained in the
database for audit.