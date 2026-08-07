# Database Schema - Member 3 (Klemens)

Tables owned by the Resident Reports & Authentication module. Defined with
Sequelize (`backend/src/models/`) and backed by SQLite in local dev,
PostgreSQL (Neon) in production.

Notes that apply to all four tables:

- Table names are the Sequelize-pluralized model names (`User` -> `Users`, etc.).
- Every table has `timestamps: true` (Sequelize default), giving `createdAt`
  and `updatedAt` (`DATETIME`, NOT NULL).
- ENUM columns also carry an `isIn` validator. SQLite stores ENUM as plain TEXT
  with no value check, so the validator enforces the allowed values for
  SQLite/PostgreSQL parity.

---

## Users

Authentication and role-based access. One user per account; consumed by every
module via JWT (payload `{ user_id, role, name }`).

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| name | STRING | NOT NULL |
| email | STRING | NOT NULL, UNIQUE, validated as email (`isEmail`) |
| password_hash | STRING | NOT NULL (bcrypt hash; never returned by the API) |
| role | ENUM('resident', 'welfare_partner', 'field_officer', 'manager') | NOT NULL, default `'resident'`, `isIn` validator |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:

- `Users.id` -> `ResidentReports.reported_by` (one user has many reports)
- `Users.id` -> `CaseStatusLogs.changed_by` (one user makes many status changes)
- `Users.id` -> `ZoneAssignments.user_id` (one user is assigned many blocks)

---

## ResidentReports

A report filed by a resident (flora/fauna/estate issue), including photos, an
optional GPS pin, location details, and a case status workflow.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| category | ENUM('flora_health', 'community_cat', 'pigeon', 'pest', 'other') | NOT NULL, `isIn` validator |
| title | STRING | NOT NULL |
| description | TEXT | NOT NULL |
| photo_urls | JSON | NOT NULL, default `[]` (array of Cloudinary URL strings) |
| gps_lat | FLOAT | nullable |
| gps_lng | FLOAT | nullable |
| block_number | STRING | nullable |
| floor_level | STRING | nullable |
| status | ENUM('open', 'in_progress', 'resolved') | NOT NULL, default `'open'`, `isIn` validator |
| reported_by | INTEGER | NOT NULL, FK -> `Users.id` |
| is_deleted | BOOLEAN | NOT NULL, default `false` (soft-delete flag) |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:

- `ResidentReports.reported_by` -> `Users.id` (association alias `reporter`)
- `ResidentReports.id` -> `CaseStatusLogs.report_id` (one report has many status logs)

Soft delete: rows are never physically removed. `DELETE /api/reports/:id` sets
`is_deleted = true`, and all read queries filter on `is_deleted = false`, so
deleted reports disappear from the API while remaining in the table for audit.

---

## CaseStatusLogs

Audit trail of status transitions on a report. One row is written each time a
report's status actually changes.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| report_id | INTEGER | NOT NULL, FK -> `ResidentReports.id` |
| old_status | STRING | NOT NULL |
| new_status | STRING | NOT NULL |
| changed_by | INTEGER | NOT NULL, FK -> `Users.id` |
| createdAt | DATETIME | NOT NULL (when the change happened) |
| updatedAt | DATETIME | NOT NULL |

Relationships:

- `CaseStatusLogs.report_id` -> `ResidentReports.id`
- `CaseStatusLogs.changed_by` -> `Users.id` (association alias `changer`)

---

## ZoneAssignments

The blocks a Welfare Partner is responsible for. One row per block covered, so a
partner covering three blocks has three rows. The table is the access boundary
for fauna data: `getAssignedBlocks()` in `backend/src/middleware/auth.js` reads
it and the fauna controller uses the result to filter sighting lists, guard
access to a single sighting, and constrain which block a partner may log a
sighting for.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| user_id | INTEGER | NOT NULL, FK -> `Users.id` |
| block_number | STRING | NOT NULL |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:

- `ZoneAssignments.user_id` -> `Users.id` (one user has many zone assignments)

`getAssignedBlocks(user)` returns two different "empty" results and they are not
interchangeable:

- `null` for any role other than `welfare_partner`. Callers read this as no zone
  restriction at all, so a field officer or manager sees the whole estate.
- `[]` for a `welfare_partner` with no rows in this table. Callers read this as
  an empty zone, so the partner sees nothing: their list comes back empty and
  every individual sighting is `403`.

Treating an empty array as if it were `null` would hand an unassigned partner
estate-wide access, which is why the two cases are kept distinct at the call
sites.

Two things the schema deliberately does not enforce:

- There is no unique constraint on `(user_id, block_number)`, so the same block
  can be inserted twice for one user. Duplicates are harmless in practice - the
  blocks are only ever used for an `IN` filter and an `includes()` check - but
  nothing at the database level prevents them. `seed.js` avoids them by using
  `findOrCreate`.
- Nothing restricts rows to users whose role is `welfare_partner`. A row naming
  a resident, field officer or manager can be inserted and is simply ignored,
  because `getAssignedBlocks` short-circuits on the role before it ever queries
  this table.

---

## Foreign key summary

| Foreign key | References |
|-------------|------------|
| ResidentReports.reported_by | Users.id |
| CaseStatusLogs.report_id | ResidentReports.id |
| CaseStatusLogs.changed_by | Users.id |
| ZoneAssignments.user_id | Users.id |


## Tables read but not owned

The AI querying system (`POST /api/flora/query`) and the catalog seed
(`seedFlora.js`) both read and populate `GreeneryRecords`, which is owned by
Member 1 (Shernell) and documented in `design/shernell/database-schema.md`.
No new tables were introduced by the AI querying feature - it queries the
existing greenery catalog rather than storing its own data.