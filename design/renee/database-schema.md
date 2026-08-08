# Database Schema - Member 2 (Renee)

Tables owned by the Fauna Sightings module. Defined with Sequelize
(`backend/src/models/`) and backed by SQLite in local dev, PostgreSQL (Neon)
in production.

Notes that apply to all tables:

- Table names are the Sequelize-pluralized model names
  (`FaunaSighting` -> `FaunaSightings`).
- Every table has `timestamps: true` (Sequelize default), giving `createdAt`
  and `updatedAt` (`DATETIME`, NOT NULL).
- ENUM columns carry an `isIn` validator for SQLite/PostgreSQL parity.

---

## FaunaSightings

A structured fauna sighting record. Rows arrive through two paths:

1. **Auto-created from a resident report** - the system mirrors a
   ResidentReport with category `community_cat` or `pigeon` into a sighting
   (`reportController.js`).
2. **Logged directly by an internal user** - a Field Officer, Manager or
   Welfare Partner submits the Log Sighting form, which posts to
   `POST /api/fauna`.

The module is internal-facing: sightings feed the hotspot dashboard, AI zone
summaries, risk assessment, and agency routing decisions. Residents have no
fauna UI and no fauna endpoint.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| species | ENUM('cat','pigeon','crow','mynah','other') | NOT NULL, `isIn` validator |
| block_number | STRING | nullable at the DB level; **required** by `POST /api/fauna`, carried as-is from the ResidentReport on auto-creation |
| floor_level | STRING | nullable |
| behaviour_tags | JSON | NOT NULL, default `[]` |
| gps_lat | FLOAT | nullable |
| gps_lng | FLOAT | nullable |
| photo_url | STRING | nullable - Cloudinary URL (form upload, or `photo_urls[0]` of the ResidentReport) |
| notes | TEXT | nullable at the DB level; **required** by `POST /api/fauna` (trimmed, max 500 chars). On auto-creation it carries the ResidentReport `description`, which is itself required |
| status | ENUM('open','in_progress','resolved') | NOT NULL, default `'open'` |
| reported_by | INTEGER | NOT NULL, FK -> `Users.id` (always the JWT user; never settable in the request body) |
| is_deleted | BOOLEAN | NOT NULL, default `false` (soft-delete flag) |
| createdAt | DATETIME | NOT NULL, auto |
| updatedAt | DATETIME | NOT NULL, auto |

Relationships:

- `FaunaSightings.reported_by` -> `Users.id` (association alias `reporter`)

### Why notes is nullable in the model but required by the API

The column stays `allowNull: true` so existing rows and any non-API writer
(seed scripts, `seedFauna.js`) are unaffected. The requirement lives in the
Yup `createSchema` in `faunaController.js`: `notes` is `required()` and
`trim()`ed, so a whitespace-only description fails validation. The frontend
form (`FaunaLogSighting.jsx`) mirrors the same rule with a `required` Notes
field labelled as the description.

### RBAC and GPS

`gps_lat` / `gps_lng` are stored for every species. On read, the controller
runs `stripCatGps()`: for a **cat** sighting, GPS is nulled unless the caller's
role is in `FULL_GPS_ROLES` (`field_officer`, `manager`, `welfare_partner`).
Welfare Partners keep full GPS because their access is already bounded to
their assigned blocks - the zone is their control, not field-stripping.

Since all three roles allowed onto the fauna routes are in `FULL_GPS_ROLES`,
stripping is currently defence-in-depth: it only bites if the routes are
opened to another role later.

### Zone scoping (welfare_partner)

`getAssignedBlocks()` (in `middleware/auth.js`) reads `ZoneAssignments` for the
user and returns the block numbers, or `null` for any role other than
`welfare_partner` (meaning "no zone restriction"). Consequences:

- List: a Welfare Partner only sees sightings in their assigned blocks. A
  `?block_number=` outside the zone returns `[]`; no assigned blocks at all
  also returns `[]`.
- Detail: a block outside the zone returns `403`.
- Create: a `block_number` outside the zone returns `403`.

### Soft delete

Rows are never physically removed. `DELETE /api/fauna/:id` (Manager only) sets
`is_deleted = true`. Every read query filters on `is_deleted = false`.

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

Tags default to `[]` on auto-creation, since the resident complaint form does
not capture structured behaviour data. They are set at logging time via the
checkbox group on the Log Sighting form. There is no endpoint to edit
`behaviour_tags` after creation - only `status` can be changed
(`PATCH /api/fauna/:id/status`).

### Derived from behaviour_tags (never stored)

- **Severity badge** (per sighting, frontend `faunaDisplay.js`): `aggressive`
  -> Urgent (red), else `nesting` -> Monitor (amber), else Routine (green).
  Computed from the applied tags only - note text is deliberately not read.
- **Untagged-note hints** (per sighting, backend drill-down): behaviour
  keywords that appear in `notes` but are missing from `behaviour_tags`,
  returned as `untagged_mentions`. Display-only; nothing is written back.
- **Risk level** (per block, backend aggregation): see below.

---

## Derived risk level (per block, not stored)

Computed in `aggregateBlock()` over the sightings for a block within the
window (`?days=`, default 30). Returned by the summary and alert-draft
endpoints.

| Level | Condition |
|-------|-----------|
| `urgent` | 8 or more sightings in the window, **or** any sighting tagged `aggressive` |
| `monitor` | 4 to 7 sightings, **or** any sighting tagged `nesting`, and not already `urgent` |
| `routine` | otherwise |

Alongside the level, a plain-English `risk_reason` is built (volume,
aggression, or nesting) and fed into the Gemini prompt so the generated text
explains what drove the level.

---

## Species-to-agency mapping

Derived at the API layer (not stored). Returned in the hotspot summary
response and mirrored in the frontend detail page.

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
| ZoneAssignments.user_id | Users.id (read by the fauna zone check; table owned outside this module) |

---

## Relationship to existing tables

This module adds one new table (`FaunaSightings`) to the shared schema. It
references the existing `Users` table for `reported_by`, and reads
`ZoneAssignments` to scope Welfare Partners. It is also populated from
`ResidentReports` via the auto-creation logic in `reportController.js` - there
is no foreign key to `ResidentReports` in the schema, but the data origin is
documented here for clarity.
