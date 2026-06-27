# CONVENTIONS.md

Team conventions for the 4E - Flora, Fauna & Estate Biodiversity Tracker.
Following these keeps our codebase consistent, our git history clean, and our
collaboration smooth. Most of these reflect patterns already established in the
shared auth/reports modules - when in doubt, look at existing code and match it.

---

## 0. Getting Started (do this first)

### Clone the repo
Open a terminal, go to where you want the project, and clone it:
```
git clone https://github.com/nite-source/4e-flora-fauna-tracker.git
cd 4e-flora-fauna-tracker
```

### Set up the backend
```
cd backend
npm install
```
Then create your local `.env` file (copy the template and fill in the values):
```
cp .env.example .env
```
- Set `JWT_SECRET` to any long random string for local dev.
- Leave `DATABASE_URL` blank to use local SQLite (no setup needed).
- Cloudinary values: ask Klemens for the shared credentials (sent privately, not in chat).

Run the backend:
```
npm run dev
```
It should start at `http://localhost:3000`. Test it: open `http://localhost:3000/api/health` - you should see `{"status":"ok"}`.

### Set up the frontend
Open a **second terminal** (keep the backend running in the first):
```
cd frontend
npm install
cp .env.example .env
```
- `.env` should have `VITE_API_URL=http://localhost:3000`.

Run the frontend:
```
npm run dev
```
It should start at `http://localhost:5173`. Open it in your browser, register an account, and log in to confirm everything's connected.

### You need both servers running
Backend (`:3000`) and frontend (`:5173`) run at the same time in separate terminals. The frontend calls the backend, so both must be up.

### Before you start coding
- Make your own feature branch (see Git Workflow below) - don't work on `main`.
- Put your module's code in the right folders (see Folder Structure).
- Import the shared auth middleware, don't rewrite it (see Auth & RBAC).

---

## 1. Git Workflow

### Branches
- **Never commit directly to `main`.** Always work on a feature branch.
- `main` is protected: PRs required, CI must pass before merging.
- Branch naming: `<type>/<short-kebab-description>`
  - `feature/auth`, `feature/fauna-map`, `fix/cors-origin`, `docs/api-documentation`, `chore/update-deps`
- Branch off the latest `main`:
  ```
  git checkout main
  git pull
  git checkout -b feature/your-thing
  ```

### Commits
We use **Conventional Commits** - a `type: description` format:

| Type | Use for |
|------|---------|
| `feat:` | a new feature |
| `fix:` | a bug fix |
| `docs:` | documentation only |
| `test:` | adding or updating tests |
| `chore:` | tooling, deps, config, non-code housekeeping |
| `refactor:` | code change that neither fixes a bug nor adds a feature |

- Write meaningful messages: `feat: add fauna sighting map with hotspot counter`, not `update` or `changes`.
- Present tense, lowercase after the colon.
- For bigger commits, add a body explaining what + why.

### Pull Requests
- Open a PR from your feature branch into `main`.
- Give it a clear title + a short description of what it does.
- **CI must pass** (backend tests + frontend build) before merging.
- Get a teammate review where possible.
- Delete the branch after merging (keeps the branch list clean).

---

## 2. File & Folder Naming

### Backend (`backend/src/`)
```
config/        lowercase    e.g. database.js, cloudinary.js
models/        PascalCase   e.g. User.js, ResidentReport.js, CaseStatusLog.js
controllers/   camelCase    e.g. authController.js, reportController.js
middleware/    camelCase    e.g. auth.js, upload.js
routes/        lowercase    e.g. auth.js, reports.js, uploads.js
```

### Frontend (`frontend/src/`)
```
pages/         PascalCase   e.g. Login.jsx, SubmitReport.jsx, MyReports.jsx
components/    PascalCase   e.g. ProtectedRoute.jsx
contexts/      PascalCase   e.g. UserContext.jsx
utilities      camelCase    e.g. http.js
```

### Quick rule
- **React components + Sequelize models -> PascalCase** (`SubmitReport.jsx`, `User.js`)
- **Everything else (utils, config, controllers, routes) -> camelCase or lowercase** (`http.js`, `authController.js`)

---

## 3. Code Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Variables / functions | `camelCase` | `const reportList`, `function uploadImage()` |
| React components | `PascalCase` | `function SubmitReport()` |
| Constants | `UPPER_SNAKE_CASE` | `const CATEGORIES`, `const STATUS_COLORS` |
| Database columns | `snake_case` | `reported_by`, `block_number`, `password_hash` |
| Sequelize models | `PascalCase` (singular) | `ResidentReport`, `User` |
| API routes | `kebab-case`, plural nouns | `/api/reports`, `/api/auth`, `/api/uploads` |
| JSON / request bodies | `snake_case` (matches DB) | `{ photo_urls, block_number }` |

> Note on DB: Sequelize models are `PascalCase` singular (`ResidentReport`), but
> the columns inside are `snake_case` (`reported_by`). The table name Sequelize
> generates is pluralized (`ResidentReports`). This mix is intentional - match it.

---

## 4. Folder Structure

```
backend/
  src/
    config/        database + external service config
    models/        Sequelize models + associations (index.js)
    controllers/   request handlers (business logic)
    middleware/    protect, restrictTo, upload, etc.
    routes/        route definitions, wired to controllers
    index.js       server entry point
  tests/
    <name>/        each member's tests + test-cases.md
  .env             local secrets (gitignored)
  .env.example     committed template with placeholders

frontend/
  src/
    pages/         route-level page components
    components/    reusable components (ProtectedRoute, etc.)
    contexts/      React context providers
    http.js        axios instance with auth interceptor
  .env             local (VITE_API_URL)
  .env.example     committed template

design/<name>/     individual design docs (use-cases, api-documentation, database-schema)
ai/<name>/         individual AI logs + reflection
```

- Put your module's work in your own controllers/routes/models files.
- **Import shared things, don't duplicate them** - e.g. everyone imports
  `protect` and `restrictTo` from `middleware/auth.js`, nobody rewrites auth.

---

## 5. Environment & Secrets

- **Never commit secrets.** `.env` is gitignored; only `.env.example` (with
  placeholder values) is committed.
- When you add a new env var, add it to `.env.example` too so teammates know it exists.
- Frontend env vars **must** be prefixed `VITE_` to be visible in the app
  (e.g. `VITE_API_URL`).
- Read secrets from `process.env` in code - never hardcode a key, secret, or
  connection string.
- Share real credentials (Cloudinary, DB URLs) **privately**, never in the group
  chat or a commit.

---

## 6. Auth & RBAC (shared dependency)

All protected routes use the shared middleware from `middleware/auth.js`:

```javascript
const { protect, restrictTo } = require('../middleware/auth');

// require login:
router.get('/things', protect, controller.list);

// require a specific role:
router.patch('/things/:id', protect, restrictTo('staff', 'admin'), controller.update);
```

- `protect` verifies the JWT and attaches the user to `req.user` (`{ user_id, role, name }`).
- `restrictTo(...roles)` checks `req.user.role` - must run **after** `protect`.
- Roles: `resident`, `staff`, `admin`.
- **Get the user's id from `req.user.user_id`, never from the request body** (prevents spoofing).

---

## 7. Validation & Errors

- Validate request bodies with **yup** in the controller; return `400` with the errors on failure.
- Use correct status codes: `200` ok, `201` created, `400` bad request/validation,
  `401` not authenticated, `403` forbidden (wrong role), `404` not found, `500` server error.
- Don't leak sensitive info in errors (e.g. login returns a generic 401 for both
  wrong-email and wrong-password so it doesn't reveal which accounts exist).

---

## 8. Testing

- Backend: **jest + supertest**, run against an in-memory SQLite DB
  (`DATABASE_URL=sqlite::memory:`, `sync({ force: true })`) so tests never touch
  the dev database.
- Put tests in `backend/tests/<your-name>/` and document them in a `test-cases.md`.
- `npm test` runs the suite; it also runs in CI on every push.
- Frontend is currently verified via manual testing + the CI build check
  (automated frontend tests are a future addition).

---

## 9. Style

- Use a **hyphen (-)**, not an em dash, in generated docs and comments.
- Match the existing code style in a file - don't reformat code you're not changing.
- Keep changes surgical: every changed line should trace to what you're actually working on.
- Keep it simple - build what's needed for the PoC, not speculative features.

---

## 10. Claude Code & CLAUDE.md

We use Claude Code (the VS Code extension) to help build. There's a `CLAUDE.md`
in the repo root that Claude Code reads automatically every session - it tells
Claude about our project, stack, and rules so you get project-aware help instead
of generic code.

### Add your module to CLAUDE.md
Right now CLAUDE.md describes the shared auth/reports context. **Add a short
description of YOUR module** under the project context so Claude Code knows what
you're building. Keep it brief - module name, your entities, your enhancement.
For example:
```
Member (Renee) - Fauna Sightings:
- FaunaSighting CRUD (cats, pigeons, floor level, behaviour tags)
- Interactive map with RBAC-hidden cat pins, hotspot counter (DB count)
```
Don't remove other people's context - just add yours.

### Working with Claude Code
- Use your **own** Claude Code seat where possible, so your AI logs are cleanly
  attributed to you (this matters for the graded AI deliverable).
- **Save your session logs** to `ai/<your-name>/ai-logs/` regularly - they're a
  graded deliverable. The logs live at `C:\Users\<you>\.claude\projects\<folder>\`
  on Windows.
- **Review what Claude Code writes before accepting it.** Don't blindly accept -
  check it does what you wanted, runs, and follows these conventions. The grading
  rewards strategic, reviewed AI use, not copy-paste.
- **Never paste real secrets** (Cloudinary secret, DB URLs, JWT secret) into a
  Claude Code prompt - they end up in the logs. Reference `process.env` instead.

---

*This is a living document. If we agree on a new convention as a team, update it
here so it stays the single source of truth.*
