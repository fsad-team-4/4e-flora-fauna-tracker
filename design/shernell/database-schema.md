# Database Schema - Member 1 (Shernell)

The table owned by the Flora Management module. Defined with Sequelize
(`backend/src/models/GreeneryRecord.js`) and backed by SQLite in local dev,
PostgreSQL (Neon) in production.

Notes:

- The table name is the Sequelize-pluralized model name (`GreeneryRecord` ->
  `GreeneryRecords`).
- `timestamps: true` (Sequelize default) adds `createdAt` and `updatedAt`
  (`DATETIME`, NOT NULL).
- The `health_status` ENUM also carries an `isIn` validator. SQLite stores ENUM
  as plain TEXT with no value check, so the validator enforces the allowed
  values for SQLite/PostgreSQL parity.
- Postgres' `LIKE` is case-sensitive (unlike SQLite's), so the partial-match
  filters (`plant_family`, `site_suitability`, `location`) use a dialect-aware
  operator to keep results consistent across environments - see the
  case-insensitivity note in `use-cases.md`.
- Dual validation: the controller (`floraController.js`) validates incoming
  request bodies with yup (`species` required, `health_status` restricted to the
  three values) before writing, and the model re-enforces `allowNull` and the
  `isIn` check at the ORM layer - so bad data is rejected whether it arrives via
  the API or another code path.

---

## GreeneryRecords

An estate greenery asset (tree, shrub, or planting-bed stock) with its location,
health status, inspection notes, and an optional AI care recommendation.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| species | STRING | NOT NULL |
| common_name | STRING | nullable |
| location_zone | STRING | nullable |
| location | STRING | nullable |
| health_status | ENUM('healthy', 'at_risk', 'critical') | NOT NULL, default `'healthy'`, `isIn` validator |
| health_notes | TEXT | nullable |
| plant_family | STRING | nullable |
| site_suitability | STRING | nullable |
| color | STRING | nullable |
| max_height_at_maturity | FLOAT | nullable (metres) |
| care_recommendation | TEXT | nullable (populated by the AI care-recommendation endpoint) |
| image_url | STRING | nullable |
| last_inspected_at | DATE | nullable |
| recorded_by | INTEGER | NOT NULL, FK -> `Users.id` |
| is_deleted | BOOLEAN | NOT NULL, default `false` (soft-delete flag) |
| createdAt | DATETIME | NOT NULL |
| updatedAt | DATETIME | NOT NULL |

Relationships:

- `GreeneryRecords.recorded_by` -> `Users.id` (a user records many greenery
  records; association alias `recorder`, exposing `{ id, name }` on read).
  Defined in `backend/src/models/index.js`:
  `User.hasMany(GreeneryRecord, { foreignKey: 'recorded_by' })` and
  `GreeneryRecord.belongsTo(User, { as: 'recorder', foreignKey: 'recorded_by' })`.

Field notes:

- `care_recommendation` is not set on create or update; it is written only by
  `POST /api/flora/:id/care-recommendation`, which stores the Gemini-generated
  text there.
- `is_deleted` drives the soft delete: `DELETE /api/flora/:id` sets it to
  `true`, and every read query filters on `is_deleted = false`, so deleted
  records disappear from the API while remaining in the table (supporting the
  client's 3-5 year data retention preference).
- `plant_family`, `site_suitability`, `color`, and `max_height_at_maturity` are
  botanical catalog fields added for the Horticulture Handbook feature. They are
  optional on both create and CSV bulk upload, and support partial-match filtering
  (`plant_family`, `site_suitability`) and exact-match filtering (`color`) via
  query parameters on `GET /api/flora`, powering the Handbook browse view.
- `location` is a broader area (e.g. "Bishan"), distinct from `location_zone`
  (a specific spot within it, e.g. "Block 123 Void Deck"). It's optional on
  both create and CSV bulk upload, and supports the same case-insensitive
  partial-match filtering as `plant_family`/`site_suitability` via `GET
  /api/flora`.
- `image_url` holds a Cloudinary-hosted photo URL, set via the Add/Edit flora
  forms. Nullable since a photo is optional.

---

## Foreign key summary

| Foreign key | References |
|-------------|------------|
| GreeneryRecords.recorded_by | Users.id |
