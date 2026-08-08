# Frontend - Test Cases (Member 2 / Renee)

Tested with Vitest + React Testing Library in a jsdom environment
(`npm test` runs `vitest run`; config lives in the `test` block of
`vite.config.js`, matchers in `tests/setup.js`). The axios instance
`src/http.js` is replaced with `vi.mock` in the page test, so no real network
request is made. Components that navigate are wrapped in `MemoryRouter`.

Files: `faunaDisplay.test.js`, `FaunaLogSighting.test.jsx` (32 cases total).

## Display helpers (`faunaDisplay.test.js`)

Setup: none. `src/faunaDisplay.js` holds pure functions that map a stored value
to how it should be rendered, so there is no DOM, router or http to mock. These
helpers are shared by `FaunaSightings.jsx`, `FaunaSightingDetail.jsx` and
`FaunaHotspots.jsx`, so a regression here shows up on all three pages.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 1 | severityFor | Aggressive behaviour | `['aggressive']` | `label: 'Urgent'`, `color: 'error'` |
| 2 | severityFor | Nesting without aggression | `['nesting']` | `label: 'Monitor'`, `color: 'warning'` |
| 3 | severityFor | Tags that carry no severity | `['feeding','droppings']` | `label: 'Routine'` |
| 4 | severityFor | Empty tag array | `[]` | `label: 'Routine'` |
| 5 | severityFor | Tags missing entirely | `undefined` and `null` (the detail page calls this before the sighting loads) | `label: 'Routine'`, no throw |
| 6 | severityFor | Both severities present | `['nesting','aggressive']` and the reverse order | `label: 'Urgent'` both ways - aggressive wins regardless of array order |
| 7 | statusLabel | Known statuses | `open`, `in_progress`, `resolved` | "Open", "In Progress", "Resolved" |
| 8 | statusLabel | Unrecognised value | `'archived'` | Passed through unchanged as `'archived'` |
| 9 | speciesLabel | The five species | `cat`, `pigeon`, `crow`, `mynah`, `other` | "Cat", "Pigeon", "Crow", "Mynah", "Other" |
| 10 | speciesLabel | Unrecognised value | `'otter'` | Passed through unchanged as `'otter'` |
| 11 | formatBlock | Bare block number | `'605'`, `'12A'` | "Block 605", "Block 12A" |
| 12 | formatBlock | Already prefixed | `'Block 123'` | Unchanged |
| 13 | formatBlock | Prefix in another case | `'block 123'`, `'BLOCK 123'` | Unchanged - the check is case-insensitive |
| 14 | formatBlock | "block" later in the string | `'Near Block 126'`, `'Behind block 5 carpark'` | Unchanged, NOT double-prefixed to "Block Near Block 126" |
| 15 | formatBlock | Empty or missing input | `''`, `undefined`, `null` | Empty string, no throw |
| 16 | tokenVariant | Neutral token | `undefined`, `'default'` | `'outlined'` |
| 17 | tokenVariant | Success | `'success'` | `'outlined'` - a non-issue never shouts |
| 18 | tokenVariant | Any other colour | `'error'`, `'warning'`, `'info'` | `'filled'` |

## Log a Fauna Sighting (`FaunaLogSighting.test.jsx`)

Setup: `http` is mocked (`post` resolves to `{ data: { id: 1 } }` unless a test
overrides it) and `navigator.geolocation` is deleted before each test, so a test
opts into GPS by defining a stub that invokes its success callback. A helper
fills the three yup-required fields (species `Cat`, block number, description);
each can be omitted to leave that field blank, which is how the validation tests
isolate one rule at a time.

Every case submits the same way a user would, by clicking the "Log Sighting"
button. No field carries a native `required` attribute, so the click always
reaches formik and yup owns validation and error display for all three required
fields consistently.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 19 | FaunaLogSighting | Happy path | Species "Cat", block "Block 203", description filled; click submit | `http.post` called once with `/api/fauna`; payload has `species: 'cat'`, `block_number: 'Block 203'`, the notes and `behaviour_tags: []`; NO `photo_url` and NO `gps_lat` keys |
| 20 | FaunaLogSighting | Behaviour tags are optional | Required fields only, no checkbox ticked; submit | The "nesting" checkbox is unchecked; `http.post` called with `behaviour_tags: []` |
| 21 | FaunaLogSighting | Behaviour tags are sent when ticked | Tick "nesting" and "aggressive"; submit | `http.post` called with `behaviour_tags: ['nesting','aggressive']` |
| 22 | FaunaLogSighting | Empty form validation | Submit with every field blank | All three messages shown: "Species is required", "Block number is required", "Description is required"; `http.post` NOT called |
| 23 | FaunaLogSighting | Species missing | Block and description filled, species left blank; submit | "Species is required"; `http.post` NOT called |
| 24 | FaunaLogSighting | Block number missing | Species and description filled, block left blank; submit | "Block number is required"; `http.post` NOT called |
| 25 | FaunaLogSighting | Description missing | Species and block filled, description left blank; submit | "Description is required"; `http.post` NOT called |
| 26 | FaunaLogSighting | Whitespace-only description | Description set to "   "; submit | "Description is required" - yup trims before the required test, mirroring the backend; `http.post` NOT called |
| 27 | FaunaLogSighting | Browser without geolocation | No `navigator.geolocation`; click "Use My Location" | Warning "Geolocation is not supported by this browser"; the "Log Sighting" button stays enabled |
| 28 | FaunaLogSighting | Submitting after geolocation failed | Click "Use My Location" with no geolocation, then fill and submit | `http.post` called once; payload has no `gps_lat` or `gps_lng` - GPS is optional and its absence does not block the sighting |
| 29 | FaunaLogSighting | GPS captured | Geolocation stubbed to 1.3521 / 103.8198; click "Use My Location"; submit | Coordinates shown as "1.35210, 103.81980"; `http.post` called with `gps_lat: 1.3521`, `gps_lng: 103.8198` |
| 30 | FaunaLogSighting | API rejects with a message | `http.post` rejects with `{ error: 'Forbidden' }` | "Forbidden" shown in an error alert |
| 31 | FaunaLogSighting | API rejects with a message array | `http.post` rejects with `{ error: [msg1, msg2] }`, the shape yup errors take on the backend | Both messages shown, comma-joined |
| 32 | FaunaLogSighting | Request fails with no response body | `http.post` rejects with a bare `Error` | Falls back to "Failed to log sighting" |

## Notes

- **No field uses MUI's `required` prop.** It renders a native `required`
  attribute whose constraint validation blocks the submit before formik runs,
  showing a browser tooltip instead of the schema message. Leaving it off all
  three required fields keeps validation consistent: every error comes from yup
  and renders as field helper text, so cases 22-26 can all use the plain button
  click.
- `behaviour_tags` is an array in formik state toggled by checkboxes, so the
  checkbox is found by role and accessible name rather than a label lookup.
- `@testing-library/user-event` is not a dependency, so interactions use
  `fireEvent`. The MUI species `<Select>` is opened with `fireEvent.mouseDown` on
  its combobox, then the option is clicked - the same approach as the category
  select in Member 3's `SubmitReport.test.jsx`.
- Formik validates asynchronously through yup, so the fill helper ends with an
  `act` flush; without it, validation state settles after a synchronous
  assertion and React logs "not wrapped in act" warnings.
- The page renders a Leaflet `MapContainer` for dropping a GPS pin. It mounts
  cleanly in jsdom, so react-leaflet is not mocked; the map itself is not
  asserted on, only the coordinates it produces via the "Use My Location" button.
- Still verified manually (no automated tests yet): `FaunaHotspots.jsx` (map
  pins, heatmap, block drill-down, AI summary, alert draft and send),
  `FaunaSightingDetail.jsx` (status update, set/change block number), photo
  upload on `FaunaLogSighting.jsx` (Cloudinary is an external service), and the
  map click-to-pin interaction.
- Backend coverage for the same module lives in `backend/tests/renee/`
  (29 cases across four files).
