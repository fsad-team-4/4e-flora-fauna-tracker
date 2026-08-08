# Use Cases - Member 2 (Renee)

Use cases for the Fauna Sightings module. Sighting records reach the system by
two routes: they are auto-created when a resident submits a ResidentReport with
category `community_cat` or `pigeon`, and they are logged directly by internal
users through the Log Sighting form (`POST /api/fauna`). There is no
resident-facing fauna UI or fauna endpoint.

The module is internal-facing. It aggregates sightings into a hotspot
dashboard with a map, AI-generated zone summaries, a derived risk level, an
editable alert email, and agency recommendations - giving staff the trend
visibility needed to make proactive intervention decisions (human in the loop).

Roles:

| Role | Fauna access |
|------|--------------|
| `field_officer` | everything except delete |
| `manager` | everything, including delete |
| `welfare_partner` | list, log and read by id only, scoped server-side to their assigned blocks; no hotspots, summaries or alerts |

---

## UC-F1: System auto-creates a FaunaSighting from a ResidentReport

- Actor: system (triggered by Klemens's `reportController` after a
  ResidentReport is created)
- Precondition: a resident has submitted a ResidentReport with category
  `community_cat` or `pigeon`.

Main flow:

1. Resident submits a ResidentReport via `POST /api/reports` with category
   `community_cat` or `pigeon`, including block number, floor level, GPS
   coordinates, photo, and description.
2. The `reportController` creates the ResidentReport successfully.
3. Immediately after, the controller calls `createFaunaSightingFromReport()`
   which maps the report fields to a FaunaSighting record:
   - `community_cat` -> species `cat`
   - `pigeon` -> species `pigeon`
   - `block_number`, `floor_level`, `gps_lat`, `gps_lng`, `photo_urls[0]`
     and `description` (-> `notes`) are carried across
   - `reported_by` is taken from the JWT (same reporter)
   - `behaviour_tags` defaults to `[]` (not captured at complaint stage)
   - `status` defaults to `open`
4. The FaunaSighting is created silently - the resident sees only the normal
   ResidentReport confirmation. No second form or extra step is required.

Alternate / exception flows:

- ResidentReport category is not `community_cat` or `pigeon` (e.g.
  `flora_health`, `pest`, `other`) -> no FaunaSighting is created.
- FaunaSighting creation fails (e.g. database error) -> the failure is logged
  but does not affect the ResidentReport response (fire-and-forget, and the
  call is not awaited).
- `block_number` is null on the ResidentReport -> the FaunaSighting is still
  created with `block_number` null; hotspot grouping files it under `Unknown`.

Postcondition: a FaunaSighting record exists with `status = open` and no
behaviour tags, linked to the same reporter and carrying the complaint's
location, description and photo, ready to feed the hotspot dashboard.

---

## UC-F2: Internal user logs a fauna sighting from the field

- Actor: Field Officer, Manager, or Welfare Partner
- Precondition: the user is logged in with one of those roles and opens
  **Fauna > Log Sighting** (`/fauna/log`).

Main flow:

1. The user selects a **species** (cat / pigeon / crow / mynah / other) and
   enters a **block number**; both are required.
2. The user optionally enters a floor level and ticks any of the five
   **behaviour tags** (urinating, feeding, nesting, droppings, aggressive).
3. The user enters a **description in the Notes field - this is required**
   (trimmed, max 500 characters), matching the resident report convention that
   a sighting always carries a description.
4. The user optionally pins a GPS location, either with **Use My Location**
   (browser geolocation) or by clicking the map to drop a pin. Coordinates are
   shown to 5 decimal places.
5. The user optionally uploads a photo via `POST /api/uploads` (Cloudinary);
   the returned URL is attached as `photo_url`.
6. The user submits; the frontend posts to `POST /api/fauna`. The backend
   re-validates with Yup, sets `reported_by` from the JWT, defaults
   `behaviour_tags` to `[]` and `status` to `open`, and returns `201`.
7. The user is redirected to the Fauna Sightings list, where the new sighting
   appears first with its species chip, status chip and severity badge.

Alternate / exception flows:

- Species, block number or notes missing (or notes whitespace-only, or over
  500 characters) -> inline form error, and `400` with `{ error: [...] }` if
  the request is made directly.
- A Welfare Partner submits a `block_number` outside their assigned blocks ->
  `403 Forbidden`; the sighting is not created.
- Geolocation denied or unsupported -> a warning is shown and the sighting can
  still be submitted without GPS.
- Photo upload fails -> upload error is shown and the file input is cleared;
  the rest of the form is unaffected.

Postcondition: a new FaunaSighting exists, attributed to the submitting user,
immediately visible in the list and counted in the hotspot aggregation.

---

## UC-F3: Internal user views and filters fauna sightings

- Actor: Field Officer, Manager, or Welfare Partner
- Precondition: the user is logged in with one of those roles; at least one
  FaunaSighting exists.

Main flow:

1. The user opens the Fauna Sightings page; the frontend calls
   `GET /api/fauna`.
2. The backend returns non-deleted sightings newest first. Each card shows a
   species chip with a species icon, the block number, a neutral **status
   chip**, a coloured **severity badge**, the reporter name and the date.
3. The user filters by species and/or status (`?species=`, `?status=`; the API
   also accepts `?block_number=`). The frontend re-fetches with the params.
4. The user clicks a card to open the detail page (`GET /api/fauna/:id`),
   which shows species, status and severity, the recommended agency, block,
   floor, GPS with a **View on Google Maps** link, reporter, timestamp,
   behaviour tag chips, notes and photo.

Alternate / exception flows:

- Welfare Partner -> the list is scoped server-side to their assigned blocks;
  a `?block_number=` outside the zone, or no assigned blocks at all, returns
  an empty array.
- Welfare Partner opens a sighting outside their zone -> `403`, shown as
  "You do not have access to this sighting."
- Sighting missing or soft-deleted -> `404`, shown as "Sighting not found."
- No sightings match the filter -> empty-state message.

Postcondition: the user has viewed the relevant sightings; no data is changed.

---

## UC-F4: Severity badge is derived from behaviour tags

- Actor: any user viewing the sightings list or a sighting detail
- Precondition: the sighting has been loaded.

Main flow:

1. The frontend passes the sighting's `behaviour_tags` to `severityFor()`.
2. If the tags include `aggressive`, the badge is **Urgent** (red, filled).
3. Otherwise, if they include `nesting`, the badge is **Monitor** (amber,
   filled).
4. Otherwise the badge is **Routine** (green, outlined, so a non-issue never
   shouts).
5. The badge is rendered next to the neutral status chip, using the shared
   chip styling so every token on the fauna pages reads as one design
   language.

Alternate / exception flows:

- No tags at all (e.g. an auto-created sighting) -> Routine.
- A behaviour keyword appears in the notes but was never tagged -> severity is
  **not** affected; it surfaces instead as an untagged-note hint in the block
  drill-down (UC-F8).

Postcondition: severity is displayed but never stored; it always reflects the
tags currently on the record.

---

## UC-F5: Internal user updates a sighting status

- Actor: Field Officer or Manager
- Precondition: the user is logged in as `field_officer` or `manager`; a
  sighting exists.

Main flow:

1. The user opens a sighting detail page and sees the Update Status control
   (dropdown + button), which is hidden for Welfare Partners.
2. The user selects a new status (`open`, `in_progress`, `resolved`) and
   submits `PATCH /api/fauna/:id/status`.
3. The backend updates the status and returns the updated sighting.
4. The detail page reloads and shows the new status chip.

Alternate / exception flows:

- Invalid or missing status value -> `400`.
- Sighting not found or soft-deleted -> `404`.
- Welfare Partner attempts the update -> `403` (route restricted).

Postcondition: the sighting status reflects the officer's decision on the case
(human in the loop).

---

## UC-F6: Internal user views hotspot counts per block

- Actor: Field Officer or Manager
- Precondition: the user is logged in as `field_officer` or `manager`; at
  least one sighting exists.

Main flow:

1. The user opens the Hotspots page; the frontend calls `GET /api/fauna` and
   `GET /api/fauna/hotspots`.
2. The backend counts non-deleted sightings from the last 30 days (default),
   grouped by `block_number` and `species`, sorted by total descending.
3. The page shows a Leaflet map of every GPS-pinned sighting, switchable
   between **Pins** (species-coloured markers with hover tooltip and click
   popup) and **Heatmap** (intensity tuned so a block reads full red at 8
   sightings, matching the urgent-by-volume threshold).
4. Below the map, each block is a card: block number, total count, and a
   species breakdown chip per species.
5. The user clicks a block card, or picks a block from the **Jump to block**
   selector, to expand it (UC-F7 / UC-F8).

Alternate / exception flows:

- No sightings in the period -> "No hotspots found".
- Sightings with no block number are grouped under `Unknown`.
- `?days=` overrides the 30-day default.
- Welfare Partner attempts access -> `403`; the nav link is not shown to them.

Postcondition: the user can see which blocks have the highest fauna activity
in the period; no data is changed.

---

## UC-F7: Internal user reviews the AI zone summary and risk level for a block

- Actor: Field Officer or Manager
- Precondition: the user is on the Hotspots page; the selected block has at
  least one sighting in the last 30 days.

Main flow:

1. The user expands a block card (or jumps to it via the selector). The card
   scrolls into view and the map flies to that block's pinned sightings.
2. The frontend calls `GET /api/fauna/hotspots/:block/summary`.
3. The backend aggregates the block over the window: species counts,
   behaviour tag counts, agency recommendations, and a derived **risk level**
   with the reason it was assigned:
   - `urgent` - 8 or more sightings, **or** any sighting tagged `aggressive`
   - `monitor` - 4 to 7 sightings, **or** any sighting tagged `nesting`, and
     not already urgent
   - `routine` - otherwise
4. The aggregation and the risk reason are sent to Gemini
   (`gemini-3.5-flash`), which returns a one-paragraph plain-English summary
   that explains what drove the level rather than restating the label.
5. The panel shows the summary with a colour-coded risk chip (urgent = red,
   monitor = amber, routine = green), the distinct behaviour tags recorded in
   the block, and the agency recommendation per species present.

Alternate / exception flows:

- Gemini unavailable -> `503` "AI summary unavailable. Please try again
  later."; the panel shows the message and the rest of the page keeps working.
- No sightings in the window for that block -> `404` "No sightings found for
  this block".
- Block has no GPS-pinned sighting -> the map view is left alone rather than
  jumping somewhere arbitrary.
- Clicking the already-expanded block collapses it and clears any draft.

Postcondition: the user has an AI summary, an assessed risk level and an
agency to contact; the human officer then decides the action (human in the
loop).

---

## UC-F8: Internal user drills down into the sightings behind a block

- Actor: Field Officer or Manager
- Precondition: a block card has been expanded on the Hotspots page.

Main flow:

1. Expanding the block also calls
   `GET /api/fauna/hotspots/:block/sightings`.
2. The backend returns every non-deleted sighting for that block, newest
   first, and for each one computes `untagged_mentions`: behaviour keywords
   that appear in the sighting's `notes` text but are missing from its
   `behaviour_tags`.
3. A side panel lists the sightings with species icon, reporter name and
   date. A sighting with untagged mentions shows a "Notes mention: ..." chip,
   hinting to staff that it may be under-tagged.
4. The user clicks a row to open that sighting's detail page.
5. The user can close the panel with its close button without collapsing the
   block.

Alternate / exception flows:

- Notes empty, or every keyword found is already tagged -> `untagged_mentions`
  is `[]` and no hint chip is shown.
- Unknown block -> `200` with an empty array (not a `404`), shown as "No
  sightings found".
- Request fails -> "Failed to load sightings" in the panel.

Postcondition: the user has seen the individual records behind the count. This
is display-only: no tags are changed and the hint has no bearing on the risk
level.

---

## UC-F9: Internal user drafts and sends a block alert email

- Actor: Field Officer or Manager
- Precondition: a block is expanded and its AI summary has loaded.

Main flow:

1. The user clicks **Draft alert email**; the frontend calls
   `POST /api/fauna/hotspots/:block/alert-draft`.
2. The backend runs the same aggregation as the summary (species counts,
   behaviour counts, risk level and reason, agency recommendation) and asks
   Gemini for an internal alert email, returning `{ subject, body, risk_level }`.
   Nothing is sent at this stage.
3. The draft appears in editable **Recipient email**, **Subject** and **Body**
   fields. The user reviews and edits any of them - the AI output is only a
   starting point.
4. The user clicks **Send alert**; the frontend posts the edited
   `{ to, subject, body }` to `POST /api/fauna/hotspots/:block/alert-send`.
5. The backend validates the three fields, sends via the shared `sendEmail`
   service, and returns `{ ok: true }`. "Alert email sent" is shown.

Alternate / exception flows:

- Gemini unavailable -> `503` "AI summary unavailable. Please try again
  later."; no draft is produced.
- No sightings in the window for that block -> `404` "No sightings found for
  this block".
- Recipient missing or not a valid email, or subject/body empty -> `400` with
  the validation messages shown above the form.
- Mail transport fails -> `500` "Failed to send alert email".
- Collapsing the block or expanding another one clears the draft and any
  send result.

Postcondition: an alert email approved and edited by a human has been sent to
the chosen recipient. The email is not stored and no sighting is modified.

---

## UC-F10: Cat GPS coordinates are withheld from untrusted roles (RBAC)

- Actor: any authenticated caller of the fauna read endpoints
- Precondition: the requested sighting has species `cat` and stored GPS.

Main flow:

1. The controller calls `stripCatGps()` on every listed or fetched sighting.
2. If the caller's role is **not** in `FULL_GPS_ROLES` (`field_officer`,
   `manager`, `welfare_partner`) and the species is `cat`, `gps_lat` and
   `gps_lng` are set to `null` on the returned copy.
3. The stored row is never modified - stripping happens on a plain object.

Alternate / exception flows:

- All three roles currently permitted on the fauna routes are in
  `FULL_GPS_ROLES`, so no request today is actually stripped. The rule is
  defence-in-depth for the day the routes are opened to another role.
- Welfare Partners keep full GPS deliberately: their access is already bounded
  by their assigned blocks, so the zone is their control rather than
  field-stripping.
- Non-cat species -> GPS is returned to every permitted role.

Postcondition: community cat locations can never leak to a role that has not
been explicitly trusted with them.

---

## UC-F11: Manager soft-deletes a sighting

- Actor: Manager
- Precondition: the user is logged in as `manager`; the target sighting exists
  and is not already deleted.

Main flow:

1. The manager issues `DELETE /api/fauna/:id`.
2. The backend sets `is_deleted = true` (the row is not physically removed)
   and returns `200` "Sighting deleted".
3. The sighting no longer appears in any list, detail, hotspot, drill-down or
   summary response.

Alternate / exception flows:

- Field Officer or Welfare Partner attempts the delete -> `403`.
- Sighting not found or already deleted -> `404` "Sighting not found".

Postcondition: the sighting is hidden from the API but retained in the
database for data retention and audit.
