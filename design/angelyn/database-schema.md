# Database Schema - Member 4 (Angelyn)

Tables owned by the Alert Engine, Dashboard & Rodent Assessment module. Defined
with Sequelize (`backend/src/models/`) and backed by SQLite in local dev,
PostgreSQL (Neon) in production.

Notes that apply to all tables:

- Table names are the Sequelize-pluralized model names (`AlertRule` ->
  `AlertRules`, etc.).
- Every table has `timestamps: true` (Sequelize default), giving `createdAt`
  and `updatedAt` (`DATETIME`, NOT NULL).
- Validated string columns carry an `isIn` validator. SQLite stores these as
  plain TEXT with no value check, so the validator enforces the allowed values
  for SQLite/PostgreSQL parity.
- `is_deleted` columns implement soft delete: rows are never physically removed;
  read queries filter on `is_deleted = false` so deleted rows disappear from the
  API while remaining in the table.

---

## AlertRules

Configurable rules that decide when the system notifies staff (e.g. flora goes
critical, a fauna hotspot forms, an urgent case opens, the weekly summary is
due). Created and managed by admins; read by staff.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| name | STRING | NOT NULL |
| trigger_type | STRING | NOT NULL, `isIn` ('flora_critical', 'fauna_hotspot', 'new_case_urgent', 'weekly_summary') |
| threshold | INTEGER | nullable (e.g. sightings-per-block for a fauna hotspot) |
| recipients | TEXT | NOT NULL (comma-separated email addresses) |
| channel | STRING | default `'email'`, `isIn` ('email', 'sms', 'both') |
| is_active | BOOLEAN | default `true` (paused rules stay stored but do not fire) |
| is_deleted | BOOLEAN | default `false` (soft-delete flag) |
| created_by | INTEGER | nullable, FK -> `Users.id` |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:
- `AlertRules.created_by` -> `Users.id` (the admin who created the rule)
- `AlertRules.id` -> `NotificationLogs.rule_id` (one rule produces many log entries)

Soft delete: `DELETE /api/alert-rules/:id` sets `is_deleted = true`; list/read
queries filter on `is_deleted = false`.

---

## NotificationLogs

An append-only audit trail of every notification the system dispatched. One row
per send attempt, powering the Notification Log page and the dashboard's
"Alerts Sent (7d)" KPI.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| rule_id | INTEGER | nullable, FK -> `AlertRules.id` (null if the rule was later deleted) |
| channel | STRING | nullable (e.g. 'email', 'sms') |
| recipient | TEXT | nullable (address the notification was sent to) |
| status | STRING | nullable ('sent' or 'failed') |
| message_preview | TEXT | nullable (first ~200 chars of the message body, for the log UI) |
| createdAt | DATETIME | NOT NULL (when the dispatch happened) |
| updatedAt | DATETIME | NOT NULL |

Relationships:
- `NotificationLogs.rule_id` -> `AlertRules.id` (nullable; set to null if the
  parent rule is deleted, so the log survives for audit)

---

## RodentAssessments

Stores each AI-assisted rodent risk assessment. A staff/admin submits field
observations; the Gemini service (or a deterministic stub when no API key is
set) returns a structured risk assessment that is saved here.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| block_number | STRING | nullable |
| floor_level | STRING | nullable |
| observations | TEXT | NOT NULL (the officer's field notes; the AI input) |
| risk_level | STRING | nullable, `isIn` ('low', 'medium', 'high', 'critical') |
| likely_cause | TEXT | nullable (AI's assessed cause) |
| signs_identified | JSON | nullable (array of signs the AI extracted) |
| immediate_actions | JSON | nullable (array of recommended actions) |
| escalate_to_contractor | BOOLEAN | default `false` |
| escalation_reason | TEXT | nullable |
| follow_up_notes | TEXT | nullable |
| assessed_by | INTEGER | nullable, FK -> `Users.id` |
| is_deleted | BOOLEAN | default `false` (soft-delete flag) |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:
- `RodentAssessments.assessed_by` -> `Users.id` (the staff/admin who ran it)

Soft delete: `DELETE /api/rodent-assessments/:id` (admin only) sets
`is_deleted = true`; read queries filter on `is_deleted = false`.

JSON columns: `signs_identified` and `immediate_actions` are stored as JSON
(native JSON on PostgreSQL, TEXT on SQLite) so the structured AI output is kept
as arrays.

---

## MetricSnapshots

One row per calendar day: a point-in-time capture of the estate's headline
metrics. The dashboard diffs today's row against yesterday / last week to show
real trend arrows instead of fabricated deltas. Written daily by the cron job.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| snapshot_date | STRING | NOT NULL, UNIQUE (YYYY-MM-DD; unique makes daily capture idempotent) |
| open_cases | INTEGER | NOT NULL, default `0` |
| critical_flora | INTEGER | NOT NULL, default `0` |
| at_risk_flora | INTEGER | NOT NULL, default `0` |
| active_hotspots | INTEGER | NOT NULL, default `0` |
| total_sightings | INTEGER | NOT NULL, default `0` |
| risk_score | INTEGER | NOT NULL, default `0` (0-100 estate risk index) |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:
- None. A standalone time-series table keyed on `snapshot_date`.

Idempotent capture: `snapshot_date` is UNIQUE, so re-running the daily capture
for the same day updates rather than duplicates the row.

---

## Foreign key summary

| Foreign key | References |
|-------------|------------|
| AlertRules.created_by | Users.id |
| NotificationLogs.rule_id | AlertRules.id (nullable) |
| RodentAssessments.assessed_by | Users.id |

MetricSnapshots has no foreign keys (standalone time-series table).