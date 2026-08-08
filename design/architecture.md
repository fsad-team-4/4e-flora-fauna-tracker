# System Architecture - 4E Flora, Fauna & Estate Biodiversity Tracker

Group deliverable. This document describes the architecture of the delivered
system. All four modules have shipped and are integrated behind one Express API
and one React app:

- M1 Flora - Shernell
- M2 Fauna - Renee
- M3 Resident Reports & Authentication - Klemens (the auth layer is the shared keystone)
- M4 Alerts - Angelyn

---

## 1. Project Overview

The 4E Flora, Fauna & Estate Biodiversity Tracker is a full-stack web
application for EM Services (town council estate management) to record and manage
estate biodiversity and resident-reported issues. It combines staff-maintained
flora and fauna records with a resident reporting workflow (photo, location, and
case status), all secured behind shared role-based authentication. Residents
file and track reports; field officers and managers triage, update case status,
and manage records; welfare partners log fauna sightings in the blocks they are
assigned to. An alerts and dashboard layer aggregates the estate's headline
metrics, and Gemini powers the in-app AI features described in section 6.

---

See architecture-diagram.md (Mermaid source) and architecture-diagram.png for the full system architecture diagram.

---

## 2. Backend Folder Structure (`backend/src/`)

| Folder / file | Purpose |
|---------------|---------|
| `config/` | Service configuration. `database.js` (Sequelize instance - SQLite locally, PostgreSQL via `DATABASE_URL` in prod), `cloudinary.js` (Cloudinary SDK from env), `mailer.js` (Nodemailer transporter for notifications, falls back to an Ethereal test account when SMTP is unset), `gemini.js` (lazily created and cached `GoogleGenAI` client, so the server boots without `GEMINI_API_KEY`). |
| `models/` | Sequelize models and their associations. `index.js` wires up the models and relationships. Models: `User`, `ResidentReport`, `CaseStatusLog`, `ZoneAssignment` (M3), `GreeneryRecord` (M1), `FaunaSighting` (M2), `AlertRule`, `NotificationLog`, `MetricSnapshot`, `RodentAssessment` (M4). |
| `controllers/` | Request handlers / business logic. `authController.js`, `reportController.js`, `uploadController.js` (M3), `floraController.js` (M1), `faunaController.js` (M2). The M4 routers (alert rules, notifications, dashboard, rodent assessments) keep their handlers inline in the router file rather than in a controller. |
| `middleware/` | Express middleware. `auth.js` (`protect`, `restrictTo`, `getAssignedBlocks`, `INTERNAL_ROLES` - shared by all modules), `upload.js` (Multer memory storage, 5MB limit, JPEG/PNG/WebP only). |
| `routes/` | Express routers, mounted in `index.js`: `auth.js` (`/api/auth`), `reports.js` (`/api/reports`), `uploads.js` (`/api/uploads`), `floraRoutes.js` (`/api/flora`), `faunaRoutes.js` (`/api/fauna`), `alertRules.js` (`/api/alert-rules`), `notifications.js` (`/api/notifications`), `dashboard.js` (`/api/dashboard`), `rodentAssessments.js` (`/api/rodent-assessments`). |
| `services/` | Logic shared across routes/controllers, kept out of the request handlers so it can be unit tested directly. `geminiService.js` (weekly summary generation), `weeklySummary.js` (gathers stats, calls Gemini, emails and logs the briefing), `floraQueryService.js` (natural-language querying over the greenery catalog), `rodentService.js` (Gemini rodent risk assessment plus a no-key stub), `estateStats.js` (single source of truth for derived estate metrics), `metricsSnapshot.js` (daily metric snapshot and trend deltas), `emailService.js` (Nodemailer dispatch, logs to console when SMTP is unset), `mockDataService.js` (stand-in flora/fauna/case data still used by the dashboard, weekly summary and metric snapshot). |
| `utils/` | Small helpers with no Express dependency. `validateAlertRule.js` (alert rule input validation, unit tested without a server or database). |
| `cron.js` | node-cron scheduler started from `index.js`. Captures a metric snapshot on boot and daily at 00:05, and runs the weekly estate summary every Monday at 00:00 UTC (8am SGT). `CRON_SCHEDULE` overrides the weekly expression for local testing. |
| `seed.js` / `seedFlora.js` | Seed scripts, run as `npm run seed` and `npm run seed:flora`. `seed.js` creates the demo accounts (manager, field officer, welfare partner and their zone assignments) and the alerts demo data; `seedFlora.js` populates the greenery catalog. See `deployment.md` section 6. |
| `index.js` | App entry point: loads env, fails fast if `JWT_SECRET` is unset, sets up `express.json()` + CORS, mounts routers, the `/api/health` check, a global error handler, then syncs the DB, starts the server and starts the cron jobs. |

Tests live under `backend/tests/<member>/` - one folder per team member
(`klemens/`, `shernell/`, `renee/`, `angelyn/`), each with a `test-cases.md` and
its Jest test files. All four members have automated Jest (+ Supertest for the
HTTP suites) tests: `klemens/` (`auth`, `reports`, `email-notification`,
`floraQuery`), `shernell/` (`flora`), `renee/` (`fauna.create`), and `angelyn/`
(`alertRules`, `dashboard`, `estateStats`, `rodentAssessments`).

---

## 3. Frontend Folder Structure (`frontend/src/`)

| Folder / file | Purpose |
|---------------|---------|
| `pages/` | Route-level page components. Auth: `Login.jsx`, `Register.jsx`. Reports (M3): `SubmitReport.jsx`, `MyReports.jsx`, `ReportDetail.jsx`, `AllReports.jsx`. Flora (M1): `FloraList.jsx`, `AddFlora.jsx`, `FloraDetail.jsx`, `HorticultureHandbook.jsx`. Fauna (M2): `FaunaSightings.jsx`, `FaunaLogSighting.jsx`, `FaunaSightingDetail.jsx`, `FaunaHotspots.jsx`. Alerts and dashboard (M4): `Dashboard.jsx`, `AlertRules.jsx`, `NotificationLog.jsx`, `RodentAssessment.jsx`. |
| `components/` | Reusable components. `ProtectedRoute.jsx` (redirects to `/login` when not authenticated, and to `/` when an optional `roles` prop is given and the user's role is not in it - so it enforces role-based access, not just authentication), `StatusPill.jsx`, `NotificationTimeline.jsx`, and `dashboard/` (`EstateHealthHero.jsx`, `KpiCard.jsx`, `SectionCard.jsx`, `ActivityChart.jsx`, `CategoryBar.jsx`, `BlockHeatMap.jsx`, `BlocksRanked.jsx`, `RecentCasesTable.jsx`). |
| `contexts/` | React contexts. `UserContext.jsx` holds the logged-in user (decoded from the JWT) and restores/clears it on load. |
| `hooks/` | Custom hooks. `useDashboardMetrics.js` loads the dashboard metrics and polls every 60s, skipping the fetch while the tab is hidden, and exposes a manual `reload`. |
| `utils/` | Display helpers. `formatters.js` (title-casing for display only), `plantIcons.js` (maps a plant family to an MUI icon). |
| `theme.js` | Shared MUI theme - the EM Services brand palette and chart tokens, applied globally via `ThemeProvider` in `main.jsx` and imported directly where a component needs the exact same token. |
| `http.js` | Shared Axios instance - base URL from `VITE_API_URL`, request interceptor that attaches `Authorization: Bearer <token>` from localStorage. All modules use this for API calls. |
| `constants.js` | Shared front-end constants (category labels, status colors/options). `constants/singaporeLocations.js` holds the location list used by the location pickers. |
| `App.jsx` | Router setup, MUI AppBar plus a role-filtered navigation drawer, and the route table (public + `ProtectedRoute`-wrapped routes, most of which pass a `roles` list). |
| `main.jsx` | React entry point - mounts `App` inside `ThemeProvider` + `CssBaseline`. |

---

## 4. Tech Stack

- Frontend: React + Vite, MUI (Material UI), Formik + Yup (forms/validation),
  Axios (HTTP), React Router, Leaflet + react-leaflet (maps, with `leaflet.heat`
  for the fauna hotspot heat layer), Recharts (dashboard charts).
- Backend: Node.js + Express, Sequelize ORM, Yup (request validation), Multer
  (multipart image uploads, memory storage), Nodemailer (outgoing email),
  node-cron (scheduled weekly summary and daily metric snapshot),
  `@google/genai` (Gemini SDK).
- Database: SQLite for local development, PostgreSQL (Neon) in production -
  switched via the `DATABASE_URL` env var with no code change.
- Auth: JWT (`jsonwebtoken`) + `bcryptjs`.
- Testing: Jest + Supertest (backend).

---

## 5. Third-Party Services

- Cloudinary - image storage. Photos are uploaded via `POST /api/uploads`
  (Multer memory storage -> Cloudinary), which returns a secure URL stored on the
  report or record. Credentials are read from environment variables.
- Leaflet with OpenStreetMap raster tiles
  (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) - maps. Used for the
  fauna hotspot map (with a `leaflet.heat` heat layer), picking a sighting
  location when logging fauna, viewing a sighting's location, and picking a
  location when adding a flora record. No API key or account is required.
- Google AI Studio (Gemini) - see section 6.

---

## 6. Generative AI Services

The team standardised on Google Gemini (the `@google/genai` SDK, models
`gemini-3.5-flash` and `gemini-2.5-flash`). The key is read from
`GEMINI_API_KEY`; where it is unset, endpoints either return 503 or fall back to
a non-AI stub, so the app still runs without a key.

The four headline AI features:

- Flora care recommendations (M1) - `POST /api/flora/:id/care-recommendation`
  asks Gemini for stage-by-stage care advice (seedling/young, establishing,
  mature) for a specific plant record, as emoji-prefixed plain-text bullets, and
  saves the result onto the record. Returns 503 when no key is set.
- AI catalog querying (M3, `services/floraQueryService.js`) -
  `POST /api/flora/query` answers a staff question in plain English, grounded
  only in the active `GreeneryRecord` rows, which are sent in the prompt (the
  catalog is small enough that no embeddings or vector search are needed). The
  answer is scanned for catalog species/common names so the UI can link the
  plants it referenced.
- Weekly estate summary (M4, `services/weeklySummary.js` +
  `services/geminiService.js`) - gathers the week's plant health, sighting and
  case stats, asks Gemini to write a ~150-180 word management briefing, then
  emails it to the alert rule's recipients and writes a `NotificationLog` entry.
  Runs on the cron schedule in `cron.js` and can be triggered manually by a
  manager via `POST /api/dashboard/trigger-summary`. Falls back to a
  locally-generated stub summary if there is no key or the Gemini call fails.
- Rodent risk assessment (M4, `services/rodentService.js`) - a field officer
  describes what they saw; Gemini returns a structured JSON assessment (risk
  level, confidence, likely cause, normalised signs, immediate actions,
  escalation flag, timeline). Prior observations at the same block in the last 7
  days are passed into the prompt so a repeat sighting is judged as recurrence.
  A rule-based `stubAssessment` covers the no-key case.

Three further Gemini-backed endpoints also exist in the code:

- Planting suggestions (M1) - `POST /api/flora/planting-suggestions` recommends
  species for a described site condition, restricted to the active catalog and
  returning JSON recommendations with an honest tradeoff per species.
- Species identification (M1) - `POST /api/flora/identify-species` fetches an
  already-uploaded image, sends it to Gemini as inline image data, and returns a
  species guess with a confidence level.
- Fauna block summary (M2) - `GET /api/fauna/hotspots/:block/summary` summarises
  recent sighting activity for one block in a short paragraph, alongside a
  rule-based agency recommendation per species.

---

## 7. Cloud Services (Deployment)

The application is deployed across four hosted services:

- Vercel - frontend (Vite build).
- Render - backend (Express API).
- Neon - managed PostgreSQL.
- Cloudinary - image hosting.

Gemini (Google AI Studio) is called from the backend as an external API rather
than being hosted by us.

Environment variables (`JWT_SECRET`, `DATABASE_URL`, the Cloudinary keys,
`GEMINI_API_KEY`, the SMTP settings, and `VITE_API_URL` on the frontend) are
configured per environment in the hosting provider; they are never committed.
`backend/.env.example` documents the backend variables without real values.

`deployment.md` at the repo root is the full reference: live URLs, per-service
setup, the complete environment variable table, how to run the seeds, the known
deployment gotchas, and a post-deploy verification checklist.

---

## 8. Authentication & Security

- JWT authentication: login issues a signed token (`{ user_id, role, name }`,
  7-day expiry); the frontend stores it and sends it as
  `Authorization: Bearer <token>`.
- Role-based access control (RBAC): four roles - `resident`, `welfare_partner`,
  `field_officer`, `manager`. The role is a Sequelize ENUM on `User`, with an
  `isIn` validator alongside it because SQLite stores ENUM as plain TEXT with no
  value check.
- Public registration always creates a `resident`. The register schema does not
  accept a role at all and the controller hardcodes `role: 'resident'`, so a
  privileged account cannot be created through the public endpoint - staff and
  welfare accounts come from the seed script.
- Shared middleware (`backend/src/middleware/auth.js`): `protect` verifies the
  JWT and attaches `req.user`; `restrictTo(...roles)` guards role-specific
  endpoints. All modules reuse these - this auth layer is the keystone consumed
  by M1, M2, and M4.
- `INTERNAL_ROLES` (`['field_officer', 'manager']`) is exported from the same
  middleware and is what data-scoping checks test against. They ask whether the
  caller is in `INTERNAL_ROLES` rather than testing for `resident`, so any role
  added to the enum later is treated as restricted until it is deliberately
  listed. Reports and fauna sightings both use it: a caller outside
  `INTERNAL_ROLES` only sees their own records.
- Zone scoping for welfare partners: the `ZoneAssignment` model maps a user to
  the block numbers they cover (`user_id` + `block_number`, one row per block).
  The `getAssignedBlocks(user)` helper returns that list for a
  `welfare_partner` and `null` for every other role, which callers read as "no
  zone restriction". An empty array is meaningful and distinct from `null` - a
  partner assigned nothing sees nothing. `faunaController` uses it to filter
  sighting lists, guard access to a single sighting, and constrain what a
  partner may create.
- Frontend routing mirrors the backend: `ProtectedRoute` takes an optional
  `roles` prop and redirects a logged-in user without a listed role back to `/`,
  and the nav drawer only renders the groups the current role can use. This is
  UX only - every route is independently enforced server-side.
- Passwords are hashed with bcrypt and never returned by the API.
- Secrets live in `.env` files, which are gitignored; `.env.example` documents
  the required variables without real values.
