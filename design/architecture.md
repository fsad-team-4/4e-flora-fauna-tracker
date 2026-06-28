# System Architecture - 4E Flora, Fauna & Estate Biodiversity Tracker

Group deliverable. This document captures the architecture established so far
(mostly Member 3 - authentication, resident reports, uploads) and marks clear
placeholders for the other modules to fill in:

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
file and track reports; staff and admins triage, update case status, and manage
records.

---

See architecture-diagram.md (Mermaid source) and architecture-diagram.png for the full system architecture diagram.

---

## 2. Backend Folder Structure (`backend/src/`)

| Folder / file | Purpose |
|---------------|---------|
| `config/` | Service configuration. `database.js` (Sequelize instance - SQLite locally, PostgreSQL via `DATABASE_URL` in prod), `cloudinary.js` (Cloudinary SDK from env), `mailer.js` (Nodemailer transporter for notifications). |
| `models/` | Sequelize models and their associations. `index.js` wires up the models and relationships. Current models: `User`, `ResidentReport`, `CaseStatusLog` (M3). <!-- M1 Flora (Shernell): add flora model(s). M2 Fauna (Renee): add fauna model(s). M4 Alerts (Angelyn): add alert model(s). Define associations in models/index.js. --> |
| `controllers/` | Request handlers / business logic. Current: `authController.js`, `reportController.js`, `uploadController.js` (M3). <!-- M1/M2/M4: add your controllers here. --> |
| `middleware/` | Express middleware. `auth.js` (`protect`, `restrictTo` - shared by all modules), `upload.js` (Multer memory storage + image validation). |
| `routes/` | Express routers, mounted in `index.js`. Current: `auth.js` (`/api/auth`), `reports.js` (`/api/reports`), `uploads.js` (`/api/uploads`) (M3). <!-- M1/M2/M4: add and mount your routers. --> |
| `index.js` | App entry point: loads env, fails fast if `JWT_SECRET` is unset, sets up `express.json()` + CORS, mounts routers, the `/api/health` check, a global error handler, then syncs the DB and starts the server. |

Tests live under `backend/tests/<member>/` - one folder per team member
(`klemens/`, `shernell/`, `renee/`, `angelyn/`), each with a `test-cases.md` and
any Jest test files. M3 has automated Jest + Supertest suites (`auth.test.js`,
`reports.test.js`, `email-notification.test.js`).

---

## 3. Frontend Folder Structure (`frontend/src/`)

| Folder / file | Purpose |
|---------------|---------|
| `pages/` | Route-level page components. Current: `Login.jsx`, `Register.jsx`, `SubmitReport.jsx`, `MyReports.jsx`, `ReportDetail.jsx`, `AllReports.jsx` (M3). <!-- M1/M2/M4: add your pages here. --> |
| `components/` | Reusable components. Current: `ProtectedRoute.jsx` (redirects to `/login` when not authenticated). <!-- M1/M2/M4: add shared/feature components here. --> |
| `contexts/` | React contexts. `UserContext.jsx` holds the logged-in user (decoded from the JWT) and restores/clears it on load. |
| `http.js` | Shared Axios instance - base URL from `VITE_API_URL`, request interceptor that attaches `Authorization: Bearer <token>` from localStorage. All modules should use this for API calls. |
| `constants.js` | Shared front-end constants (category labels, status colors/options). <!-- M1/M2/M4: add your enums/labels here if shared. --> |
| `App.jsx` | Router setup, MUI AppBar/nav (role-aware links), and route table (public + `ProtectedRoute`-wrapped routes). |
| `main.jsx` | React entry point. |

---

## 4. Tech Stack

- Frontend: React + Vite, MUI (Material UI), Formik + Yup (forms/validation),
  Axios (HTTP), React Router.
- Backend: Node.js + Express, Sequelize ORM, Yup (request validation).
- Database: SQLite for local development, PostgreSQL (Neon) in production -
  switched via the `DATABASE_URL` env var with no code change.
- Auth: JWT (`jsonwebtoken`) + `bcryptjs`.

---

## 5. Third-Party Services

- Cloudinary - image storage. Implemented in M3: photos are uploaded via
  `POST /api/uploads` (Multer memory storage -> Cloudinary), which returns a
  secure URL stored on the report. Credentials are read from environment
  variables.
- Map API - <!-- M2 Fauna (Renee) to confirm: a map library (e.g. Leaflet) is
  expected for plotting fauna sightings / report locations. Add details once
  chosen. -->

---

## 6. Generative AI Services

The provider is PENDING tutor confirmation (Gemini vs Claude). In-app AI features
are planned but not yet built:

- M1 Flora - flora remediation / care suggestions. <!-- M1 (Shernell) to detail. -->
- M4 Alerts - weekly summary generation. <!-- M4 (Angelyn) to detail. -->

<!-- pending: confirm Gemini or Claude as the GenAI provider; M1/M4 to detail
their AI feature integration. -->

---

## 7. Cloud Services (Deployment)

Deployment is planned for after feature completion (not yet deployed):

- Render - backend (Express API).
- Vercel - frontend (Vite build).
- Neon - managed PostgreSQL.
- Cloudinary - image hosting.

Environment variables (e.g. `JWT_SECRET`, `DATABASE_URL`, Cloudinary keys) are
configured per environment in the hosting provider; they are never committed.

---

## 8. Authentication & Security

- JWT authentication: login issues a signed token (`{ user_id, role, name }`,
  7-day expiry); the frontend stores it and sends it as
  `Authorization: Bearer <token>`.
- Role-based access control (RBAC): three roles - `resident`, `staff`, `admin`.
- Shared middleware (`backend/src/middleware/auth.js`): `protect` verifies the
  JWT and attaches `req.user`; `restrictTo(...roles)` guards role-specific
  endpoints. All modules should reuse these to secure their routes - this auth
  layer is the keystone consumed by M1, M2, and M4.
- Passwords are hashed with bcrypt and never returned by the API.
- Secrets live in `.env` files, which are gitignored; `.env.example` documents
  the required variables without real values.
