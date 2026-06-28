# Database Schema - Member 3 (Klemens)

Tables owned by the Resident Reports & Authentication module. Defined with
Sequelize (`backend/src/models/`) and backed by SQLite in local dev,
PostgreSQL (Neon) in production.

Notes that apply to all three tables:

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
| role | ENUM('resident', 'staff', 'admin') | NOT NULL, default `'resident'`, `isIn` validator |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:

- `Users.id` -> `ResidentReports.reported_by` (one user has many reports)
- `Users.id` -> `CaseStatusLogs.changed_by` (one user makes many status changes)

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

## Foreign key summary

| Foreign key | References |
|-------------|------------|
| ResidentReports.reported_by | Users.id |
| CaseStatusLogs.report_id | ResidentReports.id |
| CaseStatusLogs.changed_by | Users.id |
