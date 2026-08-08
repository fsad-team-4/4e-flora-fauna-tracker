# Frontend - Test Cases (Member 3 / Klemens)

Tested with Vitest + React Testing Library in a jsdom environment
(`npm test` runs `vitest run`; config lives in the `test` block of
`vite.config.js`, matchers in `tests/setup.js`). The axios instance
`src/http.js` is replaced with `vi.mock` in every page test, so no real network
request is made. Components that navigate are wrapped in `MemoryRouter`.

Files: `ProtectedRoute.test.jsx`, `SubmitReport.test.jsx`, `MyReports.test.jsx`
(19 cases total).

## Route Guard (`ProtectedRoute.test.jsx`)

Setup: renders `<ProtectedRoute>` at `/secret` inside a `MemoryRouter` with stub
`/` and `/login` routes, wrapped in the real `UserProvider`. The provider reads
the JWT from localStorage on mount, so a hand-built token (`header.<base64
payload>.signature`) is enough to log a user in - the context is not mocked, so
`decodeToken` is exercised too. localStorage is cleared before each test.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 1 | ProtectedRoute | Logged out (happy path for the guard) | No token in localStorage; visit `/secret` | Renders the `/login` route; guarded children are not in the document |
| 2 | ProtectedRoute | Role not permitted | Token with `role: resident`; `roles={['field_officer','manager']}` | Redirected to `/`; guarded children are not in the document |
| 3 | ProtectedRoute | Role permitted | Token with `role: manager`; `roles={['field_officer','manager']}` | Guarded children render |
| 4 | ProtectedRoute | No `roles` prop (login-only guard) | Token with `role: resident`; no `roles` passed | Guarded children render for any logged-in user |
| 5 | ProtectedRoute | Expired token | Token whose payload has `exp: 1` (past) | Treated as logged out; renders the `/login` route |

## Submit Report (`SubmitReport.test.jsx`)

Setup: `http` is mocked (`post` resolves to `{ data: { id: 1 } }` unless a test
overrides it) and `navigator.geolocation` is deleted before each test, so a test
opts into GPS by defining a stub that invokes its success callback. A helper
fills the three yup-required fields (category `Pest`, title, description) so the
only rule left standing is block-number-or-GPS.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 6 | SubmitReport | Location rule - neither half supplied | Required fields filled, no block number and no GPS; submit | Error alert "Add a block number or capture your GPS location..." shown; `http.post` NOT called |
| 7 | SubmitReport | Location rule not shown pre-emptively | Required fields filled; no submit attempt yet | The location rule alert is absent (it appears only after a blocked submit) |
| 8 | SubmitReport | Block number only (happy path) | Block number "Blk 123", no GPS; submit | `http.post` called once with `/api/reports`; payload has `category: pest`, the title, `block_number: "Blk 123"`, `photo_urls: []`, and NO `gps_lat`; no rule alert |
| 9 | SubmitReport | GPS only (happy path) | Geolocation stubbed to 1.3521 / 103.8198; click "Use My Location", leave block number empty; submit | Coordinates shown as "1.35210, 103.81980"; `http.post` called once with `block_number: ""`, `gps_lat: 1.3521`, `gps_lng: 103.8198` |
| 10 | SubmitReport | Rule message self-clears | After a blocked submit, type a block number | The location rule alert disappears without another submit |
| 11 | SubmitReport | Whitespace-only block number | Block number set to "   ", no GPS; submit | Treated as no location: rule alert shown; `http.post` NOT called |
| 12 | SubmitReport | Empty form validation | Submit with every field blank | Field-level helperText "Category is required", "Title is required", "Description is required"; `http.post` NOT called |
| 13 | SubmitReport | API rejects the submission | `http.post` rejects with `{ error: 'Report rejected' }`; valid form with block number; submit | The API's message "Report rejected" is shown in an error alert |
| 14 | SubmitReport | Browser without geolocation | No `navigator.geolocation`; click "Use My Location" | Warning "Geolocation is not supported by this browser"; the Submit Report button stays enabled (GPS is optional) |

## My Reports (`MyReports.test.jsx`)

Setup: `http.get` is mocked per test. The fixture is two reports - one `open` /
`flora_health` with block number "Blk 123", one `resolved` / `community_cat`
with `block_number: null`.

| # | Component | Scenario | Setup / Action | Expected |
|---|-----------|----------|----------------|----------|
| 15 | MyReports | Renders the list (happy path) | `http.get` resolves with the two-report fixture | Both report titles rendered; `http.get` called with `/api/reports` |
| 16 | MyReports | Code-to-label mapping | Same fixture | Categories shown as "Flora Health" and "Community Cat"; status chips show `open` and `resolved` |
| 17 | MyReports | Optional block number | Same fixture (one report has none) | "Blk 123" rendered exactly once - the report without a block number renders no block line |
| 18 | MyReports | Empty state | `http.get` resolves with `[]` | "No reports yet" message plus a "Submit your first report" link |
| 19 | MyReports | Request failure | `http.get` rejects | Error alert "Failed to load reports"; the empty-state message is NOT shown instead |

## Notes

- Auth token is stored in localStorage as `accessToken` and attached to every
  request by the shared axios interceptor (`src/http.js`).
- On page load the JWT payload is decoded without a library; an expired token is
  cleared and the user is treated as logged out (case 5).
- The block-number-or-GPS rule is a cross-field check inside formik's
  `onSubmit`, mirroring the backend. Neither field is required on its own, so
  cases 6-11 are the ones that pin the rule down.
- `@testing-library/user-event` is not a dependency, so interactions use
  `fireEvent`. The MUI category `<Select>` is opened with `fireEvent.mouseDown`
  on its combobox, then the option is clicked.
- Formik validates asynchronously through yup, so the fill helper ends with an
  `act` flush; without it, validation state settles after a synchronous
  assertion and React logs "not wrapped in act" warnings.
- Still verified manually (no automated tests yet): `Login.jsx` and
  `Register.jsx` (valid credentials, wrong password, duplicate email, field
  validation), photo upload and removal on `SubmitReport.jsx` (Cloudinary is an
  external service), `ReportDetail.jsx` status updates, and `AllReports.jsx`
  status/category filtering.
- The CI `frontend-build` job runs `npm run build` and `npm run lint` on every
  push, guarding against build and compile regressions.
