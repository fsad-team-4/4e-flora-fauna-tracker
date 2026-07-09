# Database Schema - Member 2 (Renee)

Tables owned by the Fauna Sightings module. Defined with Sequelize
(`backend/src/models/`) and backed by SQLite in local dev, PostgreSQL (Neon)
in production.

Notes that apply to all tables:

- Table names are the Sequelize-pluralized model names
  (`FaunaSighting` → `FaunaSightings`).
- Every table has `timestamps: true` (Sequelize default), giving `createdAt`
  and `updatedAt` (`DATETIME`, NOT NULL).
- ENUM columns carry an `isIn` validator for SQLite/PostgreSQL parity.

---

## FaunaSightings

A structured fauna sighting record, automatically created by the system when
a resident submits a ResidentReport with category `community_cat` or `pigeon`.
There is no resident-facing submission form — sightings are derived from
resident complaints and used exclusively by staff for hotspot trend analysis,
AI zone summaries, and agency routing decisions.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| species | ENUM('cat','pigeon','crow','mynah','other') | NOT NULL, `isIn` validator |
| block_number | STRING | nullable (carries value from ResidentReport) |
| floor_level | STRING | nullable |
| behaviour_tags | JSON | NOT NULL, default `[]` |
| gps_lat | FLOAT | nullable — stripped for residents if accessed directly |
| gps_lng | FLOAT | nullable — stripped for residents if accessed directly |
| photo_url | STRING | nullable — Cloudinary URL from ResidentReport |
| notes | TEXT | nullable — taken from ResidentReport description |
| status | ENUM('open','in_progress','resolved') | NOT NULL, default `'open'` |
| reported_by | INTEGER | NOT NULL, FK → `Users.id` |
| is_deleted | BOOLEAN | NOT NULL, default `false` (soft-delete flag) |
| createdAt | DATETIME | NOT NULL, auto |
| updatedAt | DATETIME | NOT NULL, auto |

Relationships:

- `FaunaSightings.reported_by` → `Users.id` (association alias `reporter`)

How records are created:

FaunaSighting records are never created directly by residents. They are
created automatically inside `reportController.js` immediately after a
ResidentReport is saved, when the report category is `community_cat` or
`pigeon`. The creation is fire-and-forget — a failure does not affect the
ResidentReport response.

RBAC note:

`gps_lat` and `gps_lng` are stored for all species. The API controller
strips them from responses when `req.user.role === 'resident'` and
`species === 'cat'`. All fauna list and detail endpoints are currently
restricted to `staff` and `admin` — the GPS stripping is a defence-in-depth
measure in case access is extended to residents in future.

Soft delete:

Rows are never physically removed. `DELETE /api/fauna/:id` sets
`is_deleted = true`. All read queries filter on `is_deleted = false`.

---

## Allowed behaviour_tags values

`behaviour_tags` stores a JSON array. The following values are accepted:

| Tag | Description |
|-----|-------------|
| `urinating` | Animal urinating or defecating in public areas |
| `feeding` | Resident feeding the animal (cats/birds) |
| `nesting` | Animal nesting in estate structures |
| `droppings` | Bird droppings causing hygiene issues |
| `aggressive` | Animal showing aggressive behaviour toward residents |

Tags default to `[]` at auto-creation since the ResidentReport complaint form
does not capture structured behaviour data. Staff can update tags via
`PATCH /api/fauna/:id`.

---

## Species-to-agency mapping

Derived at the API layer (not stored). Returned in the hotspot summary response.

| Species | Agency recommendation |
|---------|-----------------------|
| `cat` | Cat Welfare Society / SPCA |
| `pigeon` | ACRES |
| `crow` | ACRES |
| `mynah` | ACRES |
| `other` | Town Council to assess |

---

## Foreign key summary

| Foreign key | References |
|-------------|------------|
| FaunaSightings.reported_by | Users.id |

---

## Relationship to existing tables

This module adds one new table (`FaunaSightings`) to the shared schema. It
references the existing `Users` table (owned by Klemens) for `reported_by`.
It is populated from `ResidentReports` (owned by Klemens) via the
auto-creation logic in `reportController.js` — there is no foreign key to
`ResidentReports` in the schema, but the data origin is documented here for
clarity.