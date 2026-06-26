# Frontend - Test Cases (Member 3 / Klemens)

The frontend is verified by **manual testing** (clicking through the running app
against the live backend) plus the **CI build check** (`npm run build` and
`npm run lint` run on every push). There are no automated frontend unit tests
yet; adding Vitest + React Testing Library is noted as a future addition.

Pages covered: `Login.jsx`, `Register.jsx`, `SubmitReport.jsx`, `MyReports.jsx`,
`components/ProtectedRoute.jsx`.

## Login (`Login.jsx`)

| # | Page / Flow | Scenario | Steps | Expected |
|---|-------------|----------|-------|----------|
| 1 | Login | Valid credentials (happy path) | Enter a registered email + correct password, submit | Token stored in localStorage; user decoded into context; redirected to `/`; AppBar shows logged-in nav links |
| 2 | Login | Wrong password | Enter valid email + wrong password, submit | Red MUI Alert with the API's "Invalid email or password" message; stays on login |
| 3 | Login | Empty / invalid email | Leave email blank or enter a non-email, blur/submit | Field-level helperText: "Email is required" / "Enter a valid email"; no request sent |
| 4 | Login | Empty password | Leave password blank, blur/submit | Field-level helperText: "Password is required" |

## Register (`Register.jsx`)

| # | Page / Flow | Scenario | Steps | Expected |
|---|-------------|----------|-------|----------|
| 5 | Register | Valid registration (happy path) | Enter name (>= 2), valid email, password (>= 6), submit | Account created; redirected to `/login` |
| 6 | Register | Validation errors | Submit with short name, bad email, short password | Field-level helperText for each: name >= 2, valid email, password >= 6 chars |
| 7 | Register | Duplicate email | Register with an email already in use | Red MUI Alert with the API's error message (e.g. email already registered) |

## Submit Report (`SubmitReport.jsx`)

| # | Page / Flow | Scenario | Steps | Expected |
|---|-------------|----------|-------|----------|
| 8 | Submit Report | Valid submission (happy path) | Pick category, enter title + description, submit | Report created via POST /api/reports; redirected to `/reports` (My Reports) |
| 9 | Submit Report | Required field validation | Submit with category/title/description empty | Field-level helperText: category, title, and description required |
| 10 | Submit Report | Title too long | Enter a title over 200 characters | helperText: "Title must be at most 200 characters" |
| 11 | Submit Report | Photo upload preview | Click "Add Photo", choose a valid image | Button shows "Uploading..."; on success an 80x80 thumbnail preview appears with a "Remove" button; uploaded URL included in `photo_urls` on submit |
| 12 | Submit Report | Remove uploaded photo | After uploading, click "Remove" | Thumbnail clears; file input reset; submit sends empty `photo_urls` |
| 13 | Submit Report | Non-image upload | Click "Add Photo", choose a non-image (e.g. .txt) | Red MUI Alert with the API's "Only JPEG, PNG, and WebP images are allowed" message; file input reset for retry |
| 14 | Submit Report | Cancel | Click "Cancel" | Navigates back to `/reports` without submitting; disabled while an upload or submit is in progress |

## My Reports (`MyReports.jsx`)

| # | Page / Flow | Scenario | Steps | Expected |
|---|-------------|----------|-------|----------|
| 15 | My Reports | List own reports | Log in as a resident with existing reports, open `/reports` | Each report renders as an MUI Card with title, category label, status as a colored Chip (open=warning, in_progress=info, resolved=success), block number (if present), and created date |
| 16 | My Reports | Empty state | Open `/reports` as a user with no reports | "No reports yet" message with a button/link to submit the first report |
| 17 | My Reports | Submit shortcut | Click the "Submit Report" button at the top | Navigates to `/submit-report` |

## Protected Routes (`components/ProtectedRoute.jsx`)

| # | Page / Flow | Scenario | Steps | Expected |
|---|-------------|----------|-------|----------|
| 18 | ProtectedRoute | Logged-out access to Submit Report | While logged out, navigate to `/submit-report` | Redirected to `/login` |
| 19 | ProtectedRoute | Logged-out access to My Reports | While logged out, navigate to `/reports` | Redirected to `/login` |
| 20 | Nav | Conditional nav links | Compare AppBar logged out vs logged in | "Submit Report" and "My Reports" links appear only when logged in |

## Notes

- Auth token is stored in localStorage as `accessToken` and attached to every
  request by the shared axios interceptor (`src/http.js`).
- On page load the JWT is decoded from its payload; an expired token is cleared
  and the user is treated as logged out.
- These cases are exercised manually; the CI `frontend-build` job guards against
  build/compile regressions on every push.
