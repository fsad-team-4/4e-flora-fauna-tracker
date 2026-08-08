# Test Cases - Member 2 (Renee), Fauna Sightings

Backend integration tests for the Fauna Sightings module, run with Jest +
Supertest against an in-memory SQLite database (`sqlite::memory:`), with the
schema rebuilt (`sequelize.sync({ force: true })`) before each file.

External services are mocked so no test hits a real API:

- `src/config/mailer` - mocked in all three files
- `src/config/gemini` - mocked in `fauna.alerts.test.js`; `generateContent`
  returns a fixed `"Subject: Fauna alert\n\nBody text here."` by default
- `src/services/emailService` - mocked in `fauna.alerts.test.js`; `sendEmail`
  resolves `{ ok: true }` and is asserted on rather than actually sending

Test files:

| File | Covers |
|------|--------|
| `fauna.create.test.js` | `POST /api/fauna` - sighting creation and validation |
| `fauna.blockSightings.test.js` | `GET /api/fauna/hotspots/:block/sightings` - block drill-down and untagged mentions |
| `fauna.alerts.test.js` | risk level in the block summary, alert draft, alert send |
| `fauna.updateBlock.test.js` | `PATCH /api/fauna/:id/block` - setting and changing a sighting's block number |

---

## 1. Sighting creation - `POST /api/fauna`

Fixtures: a `field_officer` user (seeded directly, since public registration
always creates residents) and a `resident` user, each logged in for a JWT.

| # | Test file | What is tested | Expected outcome |
|---|-----------|----------------|------------------|
| 1 | `fauna.create.test.js` | A field officer posts a full sighting (species `crow`, block, floor, `behaviour_tags: ['nesting','aggressive']`, GPS, notes) | `201`; response has an `id`, `species: 'crow'`, the two behaviour tags, `status: 'open'` and a defined `reported_by`; the persisted row also has both behaviour tags |
| 2 | `fauna.create.test.js` | A resident attempts to create a sighting | `403` - residents are not permitted on the fauna routes |
| 3 | `fauna.create.test.js` | A behaviour tag outside the allowed five is submitted (`['flying']`) | `400` validation failure |
| 4 | `fauna.create.test.js` | `notes` is omitted entirely | `400` - notes is required on creation |
| 5 | `fauna.create.test.js` | `notes` contains only whitespace (`'   '`) | `400` - the value is trimmed before the required check |

---

## 2. Block drill-down and untagged mentions - `GET /api/fauna/hotspots/:block/sightings`

Fixtures: a `field_officer` ("Officer Tan") and four sightings logged through
the API - three in `Block 203` (a crow tagged `feeding` whose notes say
"NESTING"; a cat tagged `aggressive` whose notes say "aggressive"; a pigeon
whose notes name no behaviour keyword) and one mynah in `Block 115`.

| # | Test file | What is tested | Expected outcome |
|---|-----------|----------------|------------------|
| 6 | `fauna.blockSightings.test.js` | Listing the sightings behind a block, including ordering, block scoping and the joined reporter | `200`; exactly 3 sightings returned; species order is `['pigeon','cat','crow']` (newest first); every row has `block_number === 'Block 203'` so the `Block 115` sighting is excluded; the first row carries `reporter.name === 'Officer Tan'` and a defined `createdAt` |
| 7 | `fauna.blockSightings.test.js` | A behaviour keyword named in the notes but absent from `behaviour_tags` (crow: notes say "NESTING", tags are `['feeding']`) | `untagged_mentions` is `['nesting']` - matched case-insensitively; `behaviour_tags` is unchanged at `['feeding']`, and `feeding` is not flagged because it is already tagged |
| 8 | `fauna.blockSightings.test.js` | A keyword named in the notes that the sighting already carries as a tag (cat: notes say "aggressive", tagged `aggressive`) | `untagged_mentions` is `[]` - nothing to flag |
| 9 | `fauna.blockSightings.test.js` | Notes that name no behaviour keyword at all (pigeon) | `untagged_mentions` is `[]` |

---

## 3. Risk level - `GET /api/fauna/hotspots/:block/summary`

Fixtures: a `field_officer`, plus six purpose-built blocks seeded through the
API. Only the first sighting of a block carries tags, and all notes are kept
free of behaviour keywords so the risk level is driven by tags and volume
alone.

| Block | Seeded |
|-------|--------|
| `Block High Volume` | 8 sightings, no tags |
| `Block Aggressive` | 2 sightings, first tagged `aggressive` |
| `Block Nesting` | 2 sightings, first tagged `nesting` |
| `Block Medium Low` | 4 sightings, no tags |
| `Block Medium High` | 7 sightings, no tags |
| `Block Low` | 3 sightings, no tags |

| # | Test file | What is tested | Expected outcome |
|---|-----------|----------------|------------------|
| 10 | `fauna.alerts.test.js` | Volume alone reaching the urgent threshold (8 sightings) | `200`; `sighting_count` is `8` and `risk_level` is `urgent` |
| 11 | `fauna.alerts.test.js` | An `aggressive` tag with only 2 sightings - severity escalating past low volume | `200`; `sighting_count` is `2` and `risk_level` is still `urgent` |
| 12 | `fauna.alerts.test.js` | A `nesting` tag at low volume (2 sightings) | `risk_level` is `monitor` - nesting warrants monitoring, not urgency |
| 13 | `fauna.alerts.test.js` | Lower boundary of the monitor band (4 sightings, no tags) | `risk_level` is `monitor` |
| 14 | `fauna.alerts.test.js` | Upper boundary of the monitor band (7 sightings, no tags) | `risk_level` is `monitor` |
| 15 | `fauna.alerts.test.js` | Below the monitor band with no aggressive or nesting tag (3 sightings) | `risk_level` is `routine` |
| 16 | `fauna.alerts.test.js` | Gemini throwing while generating the summary | `503` with `error: "AI summary unavailable. Please try again later."` - the fallback is unchanged and the app does not crash |

---

## 4. Alert draft - `POST /api/fauna/hotspots/:block/alert-draft`

| # | Test file | What is tested | Expected outcome |
|---|-----------|----------------|------------------|
| 17 | `fauna.alerts.test.js` | Drafting an alert for `Block High Volume`, including the split of the model's `"Subject: ..."` first line from the body | `200`; `subject` is `"Fauna alert"`, `body` is `"Body text here."`, and `risk_level` is `urgent` |
| 18 | `fauna.alerts.test.js` | Gemini throwing while generating the draft (`Block Low`) | `503` with `error: "AI summary unavailable. Please try again later."` |

---

## 5. Alert send - `POST /api/fauna/hotspots/:block/alert-send`

| # | Test file | What is tested | Expected outcome |
|---|-----------|----------------|------------------|
| 19 | `fauna.alerts.test.js` | Sending with an empty body (no `to`, `subject` or `body`) | `400`; `error` is an array of validation messages; `sendEmail` is **not** called |
| 20 | `fauna.alerts.test.js` | Sending a staff-edited draft (`to`, edited `subject`, multi-line edited `body`) | `200` with `{ ok: true }`; `sendEmail` is called with exactly the submitted payload, confirming the edited content is what goes out |

---

---

## 6. Setting and changing a block number - `PATCH /api/fauna/:id/block`

Fixtures: a `field_officer` and a `welfare_partner`, each logged in for a JWT.
Every test builds its own sighting through a `blocklessSighting()` helper - a cat
with GPS but, by default, no block - so no test depends on another's state. The
helper takes an optional block, which the tests use to create a sighting that
already has one.

The endpoint sets **or** changes the block: it is not one-way, so a sighting that
already carries a block can be re-attributed to a different one.

| # | Test file | What is tested | Expected outcome |
|---|-----------|----------------|------------------|
| 21 | `fauna.updateBlock.test.js` | A field officer sets a block on a sighting that has none | `200`; the response carries `block_number: 'Block 305'`, and the reloaded row confirms it was persisted |
| 22 | `fauna.updateBlock.test.js` | A padded value `'  Block 306  '` is submitted | `200`; stored trimmed as `'Block 306'` |
| 23 | `fauna.updateBlock.test.js` | A sighting stored with `''` rather than null (a row written before block normalisation) | `200`; still treated as blockless and updated to `'Block 307'`, so legacy rows are not stranded |
| 24 | `fauna.updateBlock.test.js` | A welfare partner attempts the update | `403`; the reloaded row still has `block_number` null, confirming nothing was written |
| 25 | `fauna.updateBlock.test.js` | A field officer changes a block that is already set (`'Block 101'` to `'Block 999'`) | `200`; response and reloaded row both show `'Block 999'` - re-attribution is allowed |
| 26 | `fauna.updateBlock.test.js` | The hotspot consequence of a change: a sighting moved from `'Block 201'` to `'Block 202'` | `GET /api/fauna/hotspots` no longer lists `'Block 201'` at all, and `'Block 202'` has `total: 1` - the sighting moved between summaries |
| 27 | `fauna.updateBlock.test.js` | A whitespace-only `block_number` (`'   '`) | `400`; the reloaded row still has `block_number` null |
| 28 | `fauna.updateBlock.test.js` | `block_number` omitted from the body entirely | `400` |
| 29 | `fauna.updateBlock.test.js` | An id that matches no sighting (`99999`) | `404` with `error: "Sighting not found"` |

---

## Totals

| File | Test cases |
|------|-----------|
| `fauna.create.test.js` | 5 |
| `fauna.blockSightings.test.js` | 4 |
| `fauna.alerts.test.js` | 11 |
| `fauna.updateBlock.test.js` | 9 |
| **Total** | **29** |
