# Use Cases - Member 4 (Angelyn)

Use cases for the Alert Engine, Dashboard & Rodent Assessment module, based on
the implemented features: configurable alert rules, the notification dispatch log,
the estate command-centre dashboard (KPIs, trends, hotspots), the AI-assisted
rodent risk assessment, and the weekly estate summary. All endpoints reuse the
shared JWT auth and role-based access control (resident / staff / admin).

---

## UC-1: Admin configures an alert rule

- Actor: admin
- Precondition: the user is logged in with role admin.

Main flow:

1. The admin opens the Alert Rules page (a nav link visible only to staff/admin)
   and clicks "New Rule".
2. The admin fills in the rule: a name, a trigger type (flora goes critical, a
   fauna hotspot forms, a new urgent case, or the weekly summary), an optional
   threshold, recipient emails, and a channel.
3. The frontend submits `POST /api/alert-rules`.
4. The backend validates the input, sets `created_by` from the JWT, and creates
   the rule (returning `201`).
5. The new rule appears in the list, active by default.

Alternate / exception flows:

- Missing required fields, an invalid trigger type, or a malformed recipient
  email -> `400` with the validation message; no rule created.
- A staff member or resident attempts to create a rule -> `403` (create is
  admin-only); staff see the page in read-only mode, residents cannot see it at
  all.

Postcondition: a new alert rule exists and is active.

---

## UC-2: Admin edits, toggles, or deletes an alert rule

- Actor: admin
- Precondition: the user is logged in as admin; at least one rule exists.

Main flow:

1. On the Alert Rules page the admin edits a rule, flips its active toggle, or
   deletes it.
2. Editing/toggling submits `PATCH /api/alert-rules/:id`; the backend merges the
   change, re-validates, and returns the updated rule. Toggling `is_active` off
   keeps the rule stored but stops it firing.
3. Deleting submits `DELETE /api/alert-rules/:id`; the backend soft-deletes it
   (`is_deleted = true`) and it disappears from the list.

Alternate / exception flows:

- An edit that fails validation -> `400`; the rule is unchanged.
- A staff member or resident attempts an edit/toggle/delete -> `403`
  (all writes are admin-only).
- The rule id does not exist or is already deleted -> `404`.

Postcondition: the rule is updated, paused, or hidden from the API (retained in
the database for audit).

---

## UC-3: Staff reviews the notification log

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Main flow:

1. The staff member opens the Notification Log page; the frontend calls
   `GET /api/notifications`.
2. The backend returns dispatched notifications newest-first, each showing the
   time, the originating rule name, the recipient, the status (sent / failed),
   and a message preview.
3. The staff member filters by status (all / sent / failed) and pages through
   older entries; the frontend re-fetches with `?status=`, `?limit=`, `?offset=`.

Alternate / exception flows:

- No notifications yet, or none matching the filter -> an empty-state message.
- A resident attempts to open the log -> `403` (restricted to staff/admin).

Postcondition: the staff member has reviewed the dispatch history; no data is
changed.

---

## UC-4: Staff views the estate command-centre dashboard

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Main flow:

1. The staff member opens the Dashboard; the frontend calls
   `GET /api/dashboard/metrics`.
2. The backend computes the estate metrics from the current flora, fauna, and
   case data (open cases, critical/at-risk flora, active hotspots, total
   sightings, an explainable 0-100 risk score and its healthy/watch/critical
   status).
3. It also returns real trend deltas (diffed against stored daily snapshots), a
   time series for the activity chart, the ranked hotspot blocks, cases by
   category, the recent cases, and the 7-day notification count.
4. The dashboard renders KPI cards with trend arrows, an activity chart, a
   category breakdown, and a hotspot panel, with a "last updated" indicator.

Alternate / exception flows:

- No history yet -> trend deltas are null and the dashboard shows the current
  values without arrows.
- Empty sections (e.g. no hotspots) -> a friendly empty state rather than a blank
  panel.
- A resident attempts to open the dashboard -> `403` (restricted to staff/admin).

Postcondition: the staff member has an up-to-date overview of estate health; no
data is changed.

---

## UC-5: Admin triggers the weekly estate summary

- Actor: admin
- Precondition: the user is logged in as admin.

Main flow:

1. From the Dashboard, the admin clicks "Send Weekly Summary".
2. The frontend calls `POST /api/dashboard/trigger-summary`.
3. The backend generates the summary text (via the Gemini AI service, or a
   templated fallback if AI is unavailable), dispatches it to the configured
   recipients, and records the dispatch in the notification log.
4. The response returns the recipient count, how the summary was generated, and a
   preview, which the frontend shows in a confirmation.

Alternate / exception flows:

- A staff member or resident attempts to trigger the summary -> `403`
  (admin-only).
- Generation or dispatch fails -> `500` with the error; nothing is sent.

Postcondition: the weekly summary has been generated and dispatched, and the
dispatch is recorded in the notification log.

---

## UC-6: Officer runs an AI rodent risk assessment

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Main flow:

1. On the Rodent Assessment page the officer describes what they observed in the
   field (droppings, holes, food sources, etc.), optionally noting the block and
   floor/area.
2. The frontend submits `POST /api/rodent-assessments`.
3. The backend runs the assessment: if a Gemini API key is configured it calls
   the AI, otherwise it uses a deterministic stub and flags the response with
   `stubbed: true`.
4. The assessment is saved (risk level, likely cause, signs identified,
   immediate actions, whether to escalate to a contractor) with `assessed_by`
   from the JWT, and returned (`201`).
5. The page shows the risk level, recommended actions, and any escalation notice,
   and the new entry appears in the recent-assessments history.

Alternate / exception flows:

- No observations provided -> `400` "observations are required".
- The AI call fails -> `500` with the error; nothing is saved.
- A resident attempts an assessment -> `403` (restricted to staff/admin).

Postcondition: a rodent assessment is stored and shown to the officer, with a
clear risk level and recommended next steps.

---

## UC-7: Officer adds follow-up notes to an assessment

- Actor: staff (or admin)
- Precondition: the user is logged in as staff/admin; an assessment exists.

Main flow:

1. The officer opens an existing assessment and adds follow-up notes (e.g. the
   outcome of an inspection).
2. The frontend submits `PATCH /api/rodent-assessments/:id` with
   `follow_up_notes`.
3. The backend updates only that field and returns the updated assessment.

Alternate / exception flows:

- A request that tries to change any other field -> `400`
  "only follow_up_notes can be updated".
- The assessment id does not exist or is deleted -> `404`.
- A resident attempts the update -> `403`.

Postcondition: the assessment carries the officer's follow-up notes.

---

## UC-8: Admin soft-deletes a rodent assessment

- Actor: admin
- Precondition: the user is logged in as admin; the target assessment exists and
  is not already deleted.

Main flow:

1. The admin issues `DELETE /api/rodent-assessments/:id`.
2. The backend sets `is_deleted = true` (the row is not physically removed) and
   returns `200`.
3. The assessment no longer appears in the history, since read queries filter on
   `is_deleted = false`.

Alternate / exception flows:

- A staff member or resident attempts the delete -> `403` (admin-only).
- The assessment does not exist or is already deleted -> `404`.

Postcondition: the assessment is hidden from the API but retained in the database
for audit.

---

## Note on scope

An early prototype of a horticulture handbook assistant was explored under this
module, but during team scope alignment it was reallocated to other members
(handbook digitalisation to M1, AI querying to M3). It is therefore not part of
this module's use cases; M4 focuses on the alert engine, dashboard, and rodent
assessment above.