# Frontend - Test Cases (Member 2 / Renee)

Tested with Vitest + React Testing Library in a jsdom environment
(`npm test` runs `vitest run`; config lives in the `test` block of
`vite.config.js`, matchers in `tests/setup.js`). The axios instance
`src/http.js` is replaced with `vi.mock` in the page test, so no real network
request is made. Components that navigate are wrapped in `MemoryRouter`.

Files: `faunaDisplay.test.js`, `FaunaLogSighting.test.jsx`,
`FaunaSightingDetail.test.jsx` (50 cases total).

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

## Sighting Detail (`FaunaSightingDetail.test.jsx`)

Setup: `http` is mocked; `get` resolves to a crow sighting fixture (status
`open`, block "Block 203", tagged `nesting`, with GPS and a reporter) unless a
test overrides it, and `patch` resolves by default. The page is rendered at a
real `/fauna/:id` route inside `MemoryRouter` + `Routes`, so `useParams` gives
the component an id and the asserted URLs are the real ones (`/api/fauna/7`).

The role comes from `useUser()`. The real `UserProvider` derives it from a JWT
in localStorage, but **localStorage has no working methods in this jsdom setup**,
so the token-seeding approach used in Member 3's `ProtectedRoute.test.jsx` is not
usable here. The hook is mocked instead and a `mockUser` holder is swapped per
test - see the note below.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 33 | FaunaSightingDetail | Renders the sighting (happy path) | Fixture resolves | `http.get` called with `/api/fauna/7`; species heading "Crow", status "Open", severity "Monitor" (derived from the `nesting` tag), "Block 203", the notes, "Recommended agency: ACRES", the `nesting` chip and "Reported by: Officer Tan" |
| 34 | FaunaSightingDetail | Severity from an aggressive tag | Fixture with `behaviour_tags: ['aggressive']` | Severity badge reads "Urgent" |
| 35 | FaunaSightingDetail | Load failure | `http.get` rejects with status 403 | "You do not have access to this sighting." shown |
| 36 | FaunaSightingDetail | Controls visible to field_officer | `useUser` returns `field_officer` | Both "Update Status" and "Change block number" are present |
| 37 | FaunaSightingDetail | Controls visible to manager | `useUser` returns `manager` | Both controls present |
| 38 | FaunaSightingDetail | Controls hidden from welfare_partner | `useUser` returns `welfare_partner` | The sighting still renders, but "Update Status", "Change block number" and "Set block number" are all absent |
| 39 | FaunaSightingDetail | Status update (happy path) | Select "Resolved", click Update Status; reload returns the resolved sighting | Button starts disabled (value unchanged) and enables after the selection; `http.patch` called once with `/api/fauna/7/status` and `{ status: 'resolved' }`; the chip then reads "Resolved" |
| 40 | FaunaSightingDetail | Status update fails | `http.patch` rejects with `{ error: 'Forbidden' }` | "Forbidden" shown in an error alert |
| 41 | FaunaSightingDetail | Blockless sighting offers "Set" | Fixture with `block_number: null`; click "Set block number" | "No block number recorded" shown; the revealed input is empty |
| 42 | FaunaSightingDetail | Set flow (happy path) | Blockless fixture; type "Block 305", Save, Confirm; reload returns the attributed sighting | Dialog reads `Set block number to "Block 305"?` and "attribute the sighting to that block's summary"; `http.patch` called with `/api/fauna/7/block` and `{ block_number: 'Block 305' }`; afterwards the action becomes "Change block number" and "Block 305" is displayed |
| 43 | FaunaSightingDetail | Value is trimmed | Blockless fixture; type "  Block 305  "; Save, Confirm | `http.patch` sent `{ block_number: 'Block 305' }` |
| 44 | FaunaSightingDetail | Empty / whitespace-only block | Blockless fixture; leave empty, then type "   " | Save is disabled in both states; no confirmation dialog opens; `http.patch` NOT called |
| 45 | FaunaSightingDetail | Block patch fails | `http.patch` rejects with `{ error: 'Sighting not found' }` | "Sighting not found" shown in an error alert |
| 46 | FaunaSightingDetail | Block patch fails with a message array | `http.patch` rejects with `{ error: [msg] }` | The message is shown (array joined) |
| 47 | FaunaSightingDetail | Change flow pre-fills | Sighting already has "Block 203"; click "Change block number" | The input is pre-filled with "Block 203", so a correction starts from a known value |
| 48 | FaunaSightingDetail | Change confirmation wording | Change "Block 203" to "Block 999"; Save | Dialog reads `Change block number from "Block 203" to "Block 999"?` and "move the sighting into that block's summary" - different wording from the set case |
| 49 | FaunaSightingDetail | Unchanged value is a no-op | Open the editor and leave the pre-filled value alone | Save is disabled; it enables only once the value differs |
| 50 | FaunaSightingDetail | Cancelling the editor | Open the editor, click Cancel | The input disappears, the "Change block number" action returns, `http.patch` NOT called |

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
- **`localStorage` has no working methods in this jsdom setup** - it is an object
  whose `getItem`/`setItem`/`clear` are all `undefined`. `FaunaSightingDetail`
  reads the role through `useUser()`, so rather than seeding a JWT the way
  Member 3's `ProtectedRoute.test.jsx` does, the context module is mocked and a
  `vi.hoisted` holder swaps the role per test. (The same environment gap is why
  the `ProtectedRoute` suite currently fails - that is a separate, pre-existing
  issue in another member's file.)
- A status value renders twice for a staff user: once in the header chip and once
  as the select's current value. Those assertions use `getAllByText` and check
  presence rather than uniqueness.
- After confirming a block change, the assertion waits on the "Change block
  number" button rather than the block text, because the new value also appears
  inside the confirmation dialog and would match before the reload lands.
- Still verified manually (no automated tests yet): `FaunaHotspots.jsx` (map
  pins, heatmap, block drill-down, AI summary, alert draft and send),
  `FaunaSightings.jsx` (list rendering and the species/status filters), photo
  upload on `FaunaLogSighting.jsx` (Cloudinary is an external service), and the
  map click-to-pin interaction.
- Backend coverage for the same module lives in `backend/tests/renee/`
  (29 cases across four files).
