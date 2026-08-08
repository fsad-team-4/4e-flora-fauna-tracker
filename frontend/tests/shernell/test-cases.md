# Frontend - Test Cases (Member 1 / Shernell)

Tested with Vitest + React Testing Library in a jsdom environment
(`npm test` runs `vitest run`; config lives in the `test` block of
`vite.config.js`, matchers in `tests/setup.js`). The axios instance
`src/http.js` is replaced with `vi.mock` in every page test, so no real network
request is made. Components that navigate are wrapped in `MemoryRouter`.

Files: `FloraList.test.jsx`, `FloraDetail.test.jsx`, `HorticultureHandbook.test.jsx`,
`AddFlora.test.jsx` (21 cases total).

## Flora List (`FloraList.test.jsx`)

Setup: `http.get` is mocked per test. The fixture is two plants - one
`healthy` "Ficus Benjamina" in Block A, one `critical` "Bougainvillea" in
Block B. The Health Status filter is a MUI `<Select>`, opened with
`fireEvent.mouseDown` on its combobox and closed by clicking the option.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 20 | FloraList | Renders the list (happy path) | `http.get` resolves with the two-plant fixture | Both species names rendered (title-cased); each card shows its own health chip ("Healthy" / "Critical"), scoped via `within` to avoid the metrics panel; `http.get` called with `/api/flora` and `params: {}` |
| 21 | FloraList | Health filter re-fetches from the server | Same fixture; open the Health Status select and choose "Critical" | `http.get` called again with `params: { health_status: 'critical' }` |
| 22 | FloraList | Search box filters client-side | Same fixture; type "bougainvillea" into the search box | Only "Bougainvillea" remains visible, "Ficus Benjamina" is gone; `http.get` still only called once (no extra request) |
| 23 | FloraList | Empty state | `http.get` resolves with `[]` | "No plants recorded yet" message shown |
| 24 | FloraList | Request failure | `http.get` rejects | Error message "Failed to load flora. Please try again." shown |

## Flora Detail (`FloraDetail.test.jsx`)

Setup: `http.get` is mocked with an implementation that branches on URL -
`/api/flora/species-catalog` resolves to `[]` and `/api/flora` resolves to a
one-plant array, since the page loads the full list and finds the record by
`:id` rather than fetching a single-record endpoint. Rendered inside
`MemoryRouter` with a `/flora/:id` route so the id param is available.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 25 | FloraDetail | Renders plant details (happy path) | GET `/api/flora` resolves with a full plant record | Species, common name, health status, location, location zone, health notes, plant family, site suitability, color and max height are all rendered |
| 26 | FloraDetail | Photo shown when `image_url` is set | Plant fixture has an `image_url` | An `img` with accessible name = species and `src` = `image_url` is rendered |
| 27 | FloraDetail | No image element when `image_url` is null | Plant fixture has `image_url: null` | No `img` role is rendered anywhere on the page |
| 28 | FloraDetail | AI care recommendation (happy path) | Click "Get AI Recommendation"; `http.post` resolves with an emoji-prefixed tip | Tip text rendered; `http.post` called with `/api/flora/1/care-recommendation` |
| 29 | FloraDetail | Not-found id | List only contains id 1; navigate to `/flora/999` | "Plant not found." message shown |
| 30 | FloraDetail | Record Info section | Plant fixture includes `recorder.name`, `createdAt`, `updatedAt` | Recorder name and both locale-formatted timestamps are rendered |

## Horticulture Handbook (`HorticultureHandbook.test.jsx`)

Setup: `http.get`/`http.post` are mocked; `sessionStorage` is cleared before
each test since the page caches catalog data there. The fixture is three
plants across two named families plus one with `plant_family: null` (grouped
under "Uncategorized"). Filter inputs are plain text fields (`fireEvent.change`)
that debounce 400ms before re-fetching, so those assertions use `waitFor`
with an extended timeout.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 31 | HorticultureHandbook | Groups plants by `plant_family` (happy path) | `http.get` resolves with the three-plant fixture | Family heading spans "moraceae", "nyctaginaceae" and "Uncategorized" all rendered, each with its plant card(s); `http.get` called with `params: { include_catalog: 'true' }` |
| 32 | HorticultureHandbook | Filters re-fetch after debounce | Change Plant Family, Site Suitability and Color fields | `http.get` eventually called with all three filter params plus `include_catalog: 'true'` |
| 33 | HorticultureHandbook | Empty / no-match states | Initial empty catalog, then a Plant Family filter with no matches | "No plants in the catalog yet" shown first, then "No plants match these filters" after filtering |
| 34 | HorticultureHandbook | Ask the Handbook (happy path) | Type a question, click "Ask"; `http.post` resolves with an answer | Answer text rendered; `http.post` called with `/api/flora/query` and `{ question }` |
| 35 | HorticultureHandbook | Planting Suggestions (happy path) | Type a site condition, click "Suggest"; `http.post` resolves with a recommendation and notes | Recommended species, its tradeoff text and the notes are all rendered; `http.post` called with `/api/flora/planting-suggestions` and `{ condition }` |

## Add Flora (`AddFlora.test.jsx`)

Setup: `http.get` resolves to `[]` (species catalog) before each test.
`react-router-dom`'s `useNavigate` is mocked via `vi.hoisted` so navigation
after a successful submit can be asserted without a real route change.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 36 | AddFlora | Renders the form (happy path) | Load the page | Species field present; exactly one location card, "Location 1" - "Location 2" not shown |
| 37 | AddFlora | Add another location | Click "Add Another Location" | A second "Location 2" card appears |
| 38 | AddFlora | Required-field validation | Leave Species blank; click "Add Plant" | "Species is required" helper text shown; `http.post` NOT called |
| 39 | AddFlora | Submit valid data (happy path) | Fill Species "Mango Tree" and Location Zone "Block A"; click "Add Plant" | `http.post` called once with `/api/flora` and the full payload (blank optional fields as `''`, `image_url`/`gps_lat`/`gps_lng` as `null`, `health_status: 'healthy'`); navigates to `/flora` |
| 40 | AddFlora | API rejects the submission | Fill Species only; `http.post` rejects with `{ response: { data: { error: 'Duplicate location' } } }` | Error message "Duplicate location" shown; the location card stays visible; navigation does NOT happen |

## Notes

- Auth/RBAC for these pages is enforced server-side (staff/admin only); the
  component tests render the pages directly and do not exercise the route
  guard - that is covered separately in `ProtectedRoute.test.jsx`.
- `@testing-library/user-event` is not a dependency, so interactions use
  `fireEvent` throughout (`fireEvent.change` for text/select inputs,
  `fireEvent.click` for buttons, `fireEvent.mouseDown` to open the MUI
  `<Select>` in `FloraList`).
- Components that read a route param (`FloraDetail`) are rendered inside a
  `MemoryRouter` with an explicit `Routes`/`Route` so `useParams` resolves;
  the rest only need `MemoryRouter` for `Link`/`useNavigate` to work.
- Debounced filters (`HorticultureHandbook`) are asserted with `waitFor` and
  an extended timeout rather than fake timers, since each filter field
  debounces independently.
- Still verified manually (no automated tests yet): the map picker and GPS
  capture on `AddFlora.jsx` (both depend on browser geolocation/mapping APIs
  that are impractical to mock reliably), the "Identify Species" AI lookup
  and photo upload on `AddFlora.jsx` (photo upload hits Cloudinary, an
  external service), and the clickable species popup in Planting Suggestions
  on `HorticultureHandbook.jsx` (a multi-step interaction chain - suggest,
  then click a result, then read the popup - that adds little confidence
  over the already-covered suggestion-rendering case).
- The CI `frontend-build` job runs `npm run build` and `npm run lint` on every
  push, guarding against build and compile regressions.
