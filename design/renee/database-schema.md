# Database Schema - Member 2 (Renee)

Tables owned by the Fauna Sightings module. Defined with Sequelize
(`backend/src/models/`) and backed by SQLite in local dev, PostgreSQL (Neon)
in production.

Notes that apply to all tables:

- Table names are the Sequelize-pluralized model names
  (`FaunaSighting` -> `FaunaSightings`).
- Every table has `timestamps: true` (Sequelize default), giving `createdAt`
  and `updatedAt` (`DATETIME`, NOT NULL).
- ENUM columns also carry an `isIn` validator. SQLite stores ENUM as plain
  TEXT with no value check, so the validator enforces the allowed values for
  SQLite/PostgreSQL parity.

---

## FaunaSightings

A fauna sighting filed by a resident or volunteer (community cat or bird
incident), including photo, GPS coordinates, floor level, and behaviour tags.
Cat GPS coordinates are hidden from residents via RBAC at the API layer — the
column is always stored but stripped from responses for non-staff roles.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| species | ENUM('cat', 'pigeon', 'crow', 'mynah', 'other') | NOT NULL, `isIn` validator |
| block_number | STRING | NOT NULL, e.g. `"Block 203"` |
| floor_level | STRING | nullable, e.g. `"Ground"`, `"2nd"`, `"5th+"` |
| behaviour_tags | JSON | NOT NULL, default `[]` (array of tag strings) |
| gps_lat | FLOAT | nullable — stripped from resident responses for cat sightings |
| gps_lng | FLOAT | nullable — stripped from resident responses for cat sightings |
| photo_url | STRING | nullable — Cloudinary hosted URL |
| notes | TEXT | nullable — free-text description, max 500 chars |
| status | ENUM('open', 'in_progress', 'resolved') | NOT NULL, default `'open'`, `isIn` validator |
| reported_by | INTEGER | NOT NULL, FK -> `Users.id` |
| is_deleted | BOOLEAN | NOT NULL, default `false` (soft-delete flag) |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:

- `FaunaSightings.reported_by` -> `Users.id` (association alias `reporter`)

Soft delete: rows are never physically removed. `DELETE /api/fauna/:id` sets
`is_deleted = true`, and all read queries filter on `is_deleted = false`, so
deleted sightings disappear from the API while remaining in the table for
audit.

RBAC note: `gps_lat` and `gps_lng` are stored for all species but the API
controller strips them from responses when `req.user.role === 'resident'` and
`species === 'cat'`. This prevents residents from locating community cats and
potentially causing harm.

---

## Allowed behaviour_tags values

The `behaviour_tags` column stores a JSON array. The following values are
accepted at the API layer (validated in the controller):

| Tag | Description |
|-----|-------------|
| `urinating` | Animal urinating or defecating in public areas |
| `feeding` | Resident feeding the animal (cats/birds) |
| `nesting` | Animal nesting in estate structures |
| `droppings` | Bird droppings causing hygiene issues |
| `aggressive` | Animal showing aggressive behaviour toward residents |

Multiple tags may be selected per sighting. An empty array is valid (tags are
optional).

---

## Allowed species values and agency mapping

| Species | Agency recommendation |
|---------|-----------------------|
| `cat` | Cat Welfare Society / SPCA |
| `pigeon` | ACRES |
| `crow` | ACRES |
| `mynah` | ACRES |
| `other` | Town Council to assess |

The agency recommendation is derived at the API layer (not stored in the
database) and returned in the hotspot summary response.

---

## Foreign key summary

| Foreign key | References |
|-------------|------------|
| FaunaSightings.reported_by | Users.id |

---

## Relationship to existing tables

This module adds one new table (`FaunaSightings`) to the shared schema. It
references the existing `Users` table (owned by Klemens) for `reported_by`
and the JWT auth system for role-based access control. No changes are required
to any existing tables.
