# Use Cases - Member 3 (Klemens)

Use cases for the Resident Reports & Authentication module, based on the
implemented features: JWT auth, role-based access control (resident / staff /
admin), report CRUD, Cloudinary photo upload, the case status workflow
(open / in_progress / resolved), and the resolve-notification email.

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

Postcondition: the user has an account and a valid JWT; protected pages and
endpoints are accessible.

---

## UC-2: Resident submits a report (with optional photo)

- Actor: resident
- Precondition: the user is logged in.

Main flow:

1. The resident opens the Submit Report form and selects a category, enters a
   title and description, and optionally block number / floor level.
2. (Optional) The resident clicks "Add Photo" and selects an image. The frontend
   uploads it via `POST /api/uploads` (multipart field `image`) and shows a
   thumbnail preview; the returned URL is held for submission.
3. The resident submits the form to `POST /api/reports`, including `photo_urls`
   (0 or 1 URL).
4. The backend sets `reported_by` from the JWT, creates the report with status
   `open`, and returns `201`.
5. The frontend redirects to My Reports.

Alternate / exception flows:

- Missing required fields (category / title / description) or title > 200 chars
  -> `400`, field-level validation errors; no report created.
- Photo is not an image, is over 5MB, or is sent under the wrong field name ->
  `400` with a clear message; the upload is rejected and can be retried.
- Cloudinary upload failure -> `500`; the report can still be submitted without
  a photo.

Postcondition: a new report exists, owned by the resident, status `open`,
optionally with one photo URL.

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
3. The backend sees the requester is a resident who is not the owner and
   responds `403` "Forbidden".
4. The detail page shows "You do not have access to this report."

Alternate / exception flows:

- The report id does not exist or is soft-deleted -> `404` "Report not found".
- A resident's `GET /api/reports` list never includes other residents' reports
  in the first place (server-side scoping).

Postcondition: the resident cannot see another resident's report; no data is
exposed or changed.

---

## UC-5: Staff views all reports, filters them, and updates a status

- Actor: staff (or admin)
- Precondition: the user is logged in with role staff or admin.

Main flow:

1. The staff member opens All Reports (a nav link visible only to staff/admin);
   the frontend calls `GET /api/reports`.
2. The backend returns all non-deleted reports (not scoped to the user), each
   card also showing the reporter's name.
3. The staff member applies status and/or category filters; the frontend
   re-fetches with `?status=` and/or `?category=` query params.
4. The staff member opens a report's detail page, which shows a status update
   control (dropdown + button) not visible to residents.
5. The staff member selects a new status and submits
   `PATCH /api/reports/:id/status`.
6. The backend records a `CaseStatusLog` entry (old -> new, changed_by) and
   returns the updated report; the detail page refreshes to show the new status
   and a new history entry.

Alternate / exception flows:

- Invalid status value -> `400`.
- A resident attempting `PATCH /api/reports/:id/status` -> `403` (route is
  restricted to staff/admin); residents never see the control.
- Status set to the same value -> the response succeeds but no log entry is
  created (no actual change).
- Report not found or soft-deleted -> `404`.

Postcondition: the report's status is updated and the change is recorded in its
status history.

---

## UC-6: Resolving a report notifies the resident by email

- Actor: staff (or admin); the resident is the recipient.
- Precondition: a report exists with a status other than `resolved`; the
  reporter has an email on file.

Main flow:

1. A staff member updates the report's status to `resolved` via
   `PATCH /api/reports/:id/status`.
2. The backend records the status change (`CaseStatusLog`) and, because the new
   status is specifically `resolved`, looks up the report's reporter.
3. The backend sends an email to the reporter ("Your report has been resolved",
   referencing the report title). In the current setup this uses an Ethereal
   test account and logs a preview URL rather than delivering real mail.
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

## UC-7: Admin soft-deletes a report

- Actor: admin
- Precondition: the user is logged in with role admin; the target report exists
  and is not already deleted.

Main flow:

1. The admin issues `DELETE /api/reports/:id`.
2. The backend sets `is_deleted = true` on the report (the row is not physically
   removed) and returns `200` "Report deleted".
3. The report no longer appears in any list or detail responses, since all read
   queries filter on `is_deleted = false`.

Alternate / exception flows:

- A staff member or resident attempts the delete -> `403` (route is restricted
  to admin).
- The report does not exist or is already deleted -> `404` "Report not found".

Postcondition: the report is hidden from the API but retained in the database
for audit; its status history remains intact.
