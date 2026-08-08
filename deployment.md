# Deployment - 4E Flora, Fauna & Estate Biodiversity Tracker

Group deliverable. This document records how the application is actually
deployed, the environment variables each service needs, and how to run the
seeds. It expands on section 7 of `design/architecture.md`.

Live URLs (fill in before submission):

- Frontend (Vercel): `https://4e-flora-fauna-tracker.vercel.app`
- Backend (Render): `https://foure-flora-fauna-tracker.onrender.com`

No credentials, API keys, or connection strings belong in this file. Real values
live only in the hosting provider's environment settings and in local `.env`
files, which are gitignored.

---

## 1. Architecture

Five services, each hosting one thing:

| Service | Hosts | Notes |
|---------|-------|-------|
| Vercel | React + Vite frontend (`frontend/`) | Static build output, served from Vercel's CDN. |
| Render | Express API (`backend/`) | Free instance, the only service that talks to the database. |
| Neon | Managed PostgreSQL | Connection string supplied to Render as `DATABASE_URL`. |
| Cloudinary | Uploaded images | Backend uploads via `POST /api/uploads`; only the returned secure URL is stored in the database. |
| Gemini API (Google AI Studio) | AI features | Flora care recommendations and related AI endpoints. |

Request flow:

```
Browser
  |
  |  1. loads the static React app
  v
Vercel (frontend)
  |
  |  2. XHR to VITE_API_URL, Authorization: Bearer <jwt>
  v
Render (Express API)
  |
  +--3a. SQL over the Neon connection string ------> Neon (PostgreSQL)
  |
  +--3b. image upload (Multer memory -> SDK) ------> Cloudinary
  |            returns a secure URL, stored as a plain string in Postgres
  |
  +--3c. prompt for AI care recommendations -------> Gemini API
  |
  +--3d. SMTP for case-resolved / alert email -----> SMTP provider
  |
  v
  4. JSON response back to the browser
```

The browser never talks to Neon, Cloudinary's API, or Gemini directly. Every
credential stays on the Render side. Images are the one exception in that the
browser loads them straight from Cloudinary's CDN using the stored URL, which is
public but unguessable.

---

## 2. Render setup (backend)

Create a Web Service pointing at the GitHub repo, then set:

| Setting | Value |
|---------|-------|
| Root directory | `backend` |
| Environment | Node |
| Build command | `npm install` |
| Start command | `npm start` (runs `node src/index.js`) |
| Branch | `main` |
| Instance type | Free |
| Auto-deploy | On - pushes to `main` redeploy automatically |

The root directory must be `backend`, not the repo root. The repo is a two-app
layout with no root `package.json`, so a build from the root finds nothing to
install.

**Do not set `PORT`.** Render injects it into the environment and expects the
service to bind to whatever it provides. `backend/src/index.js` already reads
`process.env.PORT` and only falls back to `3000` for local development. Setting
`PORT` manually overrides Render's value, the service binds to the wrong port,
and the deploy fails its health check even though the logs look healthy.

---

## 3. Render environment variables

Everything below is set in the Render dashboard under Environment. The list
mirrors `backend/.env.example`.

| Variable | What it does | Required |
|----------|--------------|----------|
| `JWT_SECRET` | Signing secret for auth tokens. Use a long random string, different per environment. | **Required** |
| `DATABASE_URL` | Neon Postgres connection string. Unset falls back to a local SQLite file, which is wrong on Render. | **Required** |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account identifier. | Required for photo upload |
| `CLOUDINARY_API_KEY` | Cloudinary API key. | Required for photo upload |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. | Required for photo upload |
| `GEMINI_API_KEY` | Google AI Studio key for AI flora care recommendations. Unset disables the feature and the endpoint returns 503. | Optional |
| `SMTP_HOST` | SMTP server hostname for outgoing mail. **Has no effect on the current deployment - see section 7.** | Local only |
| `SMTP_PORT` | SMTP port. Defaults to `587` if unset. Both 587 and 465 are blocked on the Render free tier. | Local only |
| `SMTP_SECURE` | `true` for port 465, `false` for 587. | Local only |
| `SMTP_USER` | SMTP username. For Gmail, the full address. | Local only |
| `SMTP_PASS` | SMTP password. For Gmail, an app password, not the account password. | Local only |
| `EMAIL_FROM` | From address on outgoing mail. Falls back to a built-in default. | Optional |

`JWT_SECRET` is a hard requirement at boot, not at first request:
`src/index.js` logs an error and calls `process.exit(1)` if it is missing, so the
service crash-loops on Render rather than starting in a broken state.

**The SMTP variables are marked "Local only" because setting them on Render does
not work.** The free tier blocks the outbound SMTP ports, so the deployed
instance is run with them deliberately unset - see section 7 for the detail. They
are still the way to get real delivery when running locally.

Real SMTP is used only when `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are all
three set. Otherwise:

- `src/config/mailer.js` (case-resolved emails, flora health alerts) creates an
  Ethereal test account. Ethereal accepts the message and returns a preview URL
  in the Render logs, but delivers nothing to the real recipient.
- `src/services/emailService.js` (weekly summary, and the fauna block alert email
  sent from `POST /api/fauna/hotspots/:block/alert-send`) prints the message to
  the console instead and returns `{ ok: true, stubbed: true }`. The caller
  cannot tell a stubbed send from a real one, so the fauna alert UI reports
  "Alert email sent" either way.

Both are deliberate developer conveniences so teammates without mail credentials
can run the app. Neither is a production configuration. Getting a real email into
a real inbox therefore has to be demonstrated **locally** - it cannot be done on
the current Render deployment at all, whatever the variables are set to.

Not in `.env.example`, but read by the code: `CRON_SCHEDULE` optionally overrides
the weekly summary cron expression (`src/cron.js`), which is useful for testing
but should be left unset in production.

---

## 4. Vercel setup (frontend)

| Setting | Value |
|---------|-------|
| Root directory | `frontend` |
| Framework preset | Vite |
| Build command | `npm run build` (preset default) |
| Output directory | `dist` (preset default) |
| Install command | `npm install` (preset default) |

One environment variable:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://foure-flora-fauna-tracker.onrender.com` |

Two things about this variable cause most of the "the deployed site can't reach
the API" confusion:

**Vite inlines env vars at BUILD time, not at run time.** `VITE_API_URL` is
substituted into the JavaScript bundle when Vercel builds it. Changing the value
in the Vercel dashboard does nothing to the already-built site - the old value is
still hardcoded in the shipped bundle. **Any change to `VITE_API_URL` requires a
redeploy to take effect.** Trigger one from the Vercel dashboard (Deployments ->
Redeploy) or with an empty commit.

**The value must have no trailing slash.** `frontend/src/http.js` sets it as the
Axios `baseURL` and every call appends a path beginning with `/api/...`. A
trailing slash produces `https://host//api/reports`, which the backend does not
route, so requests 404 while the URL still looks right in the address bar.

---

## 5. Neon (database)

Create a project in Neon, then copy the pooled connection string from the Neon
dashboard into Render as `DATABASE_URL`. It is the only place the value belongs -
it is never committed and never needed by the frontend.

No code change is required between environments. `backend/src/config/database.js`
picks its dialect from the environment:

- `DATABASE_URL` set to a Postgres URL - connects to Postgres (Neon in production).
- `DATABASE_URL` set to `sqlite::memory:` - in-memory SQLite, used by the Jest suites.
- `DATABASE_URL` unset - local SQLite file at `backend/database.sqlite`, used for local dev.

The practical consequence is that forgetting `DATABASE_URL` on Render does not
produce an obvious connection error. The service starts happily against a SQLite
file on Render's ephemeral disk, appears to work, and then loses all data on the
next deploy or restart. If deployed data keeps vanishing, check that
`DATABASE_URL` is actually set before looking anywhere else.

Schema creation is handled by `sequelize.sync()` on boot - see the first entry in
section 7 for what that does and does not cover.

---

## 6. Seeding

Two seed scripts, both run from `backend/` with npm:

| Command | Script | Behaviour |
|---------|--------|-----------|
| `npm run seed` | `src/seed.js` | Demo data for the alerts module (alert rules, notification log, metric snapshots) plus the demo login accounts. Clears and re-inserts **only** the alert tables, so re-running is idempotent. It does not touch users' reports, flora, or fauna. |
| `npm run seed:flora` | `src/seedFlora.js` | Flora catalog records. Fully non-destructive: every record is `findOrCreate`'d on `{ species, location_zone }`, so re-running never duplicates and never clears a table. |

**Run seeds from a local machine with `DATABASE_URL` pointed at Neon, not from
Render.** The free Render instance has no shell, and the scripts are one-off
tasks rather than part of the service lifecycle. The procedure:

1. In `backend/.env` locally, temporarily set `DATABASE_URL` to the Neon
   connection string.
2. Set `DEMO_PASSWORD` in the same file to the password the demo accounts should
   use.
3. Run `npm run seed` and, if the flora catalog is needed, `npm run seed:flora`.
4. Remove or comment out the Neon `DATABASE_URL` afterwards so local development
   goes back to the local SQLite file and you do not accidentally write to
   production later.

`DEMO_PASSWORD` sets the password for every account created by `npm run seed`.
**If it is unset, the script falls back to a hardcoded default**
(`local-demo-only` in `src/seed.js`), which is fine for a local database and not
fine for a deployed one - the account emails are predictable, so a seeded Neon
database with the fallback password is effectively open. Set `DEMO_PASSWORD`
explicitly whenever the target is Neon.

`seed:flora` follows the same rule: it needs an owning staff account for its
records and creates one with `DEMO_PASSWORD` if it does not already exist,
falling back to the same `local-demo-only` default when the variable is unset.
Both seeds therefore produce the same password.

Note that accounts are created with `findOrCreate` keyed on email, so an account
that already exists is reused untouched. Changing `DEMO_PASSWORD` and re-running
a seed does **not** retroactively change the password on an already-seeded
database - it only affects accounts created from then on. To change an existing
one, update that account directly or seed a clean database.

---

## 7. Known issues and gotchas

All of these were hit during the actual deployment.

**`sequelize.sync()` only creates missing tables. It does not alter existing
ones.** `src/index.js` calls plain `sequelize.sync()` at boot, which creates any
table that does not exist yet and leaves every existing table exactly as it
found it. Adding a column to a model does not add that column to a table Neon
already has. The deploy succeeds, the service starts clean, and then any query
touching the new column fails - typically surfacing as a 500 from the endpoint
that reads or writes it. After any model change that adds or changes a column,
run the matching `ALTER TABLE` against Neon (via the Neon SQL editor) before or
alongside the deploy. Dropping and re-syncing works too but destroys all data, so
it is only acceptable before a demo has been seeded.

**Render's free tier blocks outbound SMTP entirely, so the deployed instance
cannot send real mail.** There are two separate problems here, and only one of
them has a code-level fix.

*The IPv6 half, which is fixed in code.* `smtp.gmail.com` resolves to an IPv6
address, Node picks it, and the connection dies with `ENETUNREACH` - which reads
like a credentials or firewall problem but is neither. Two changes address this:

- `family: 4` on the transporter in `src/config/mailer.js` **and** in
  `src/services/emailService.js`. Both build their own transporter, so both need
  it; `emailService.js` was missing it initially and timed out on Render while
  working fine locally.
- `dns.setDefaultResultOrder('ipv4first')` at the top of `src/index.js`, which
  makes Node prefer IPv4 for every lookup in the process rather than per
  transporter.

*The port half, which has no code-level fix.* Even on IPv4, the free tier blocks
the outbound SMTP ports themselves:

| Port | Result on Render free tier |
|------|----------------------------|
| 587 | fails with `ENETUNREACH` (and resolves to IPv6, which the tier also cannot route) |
| 465 | fails with a connection timeout |

This is a platform restriction, not a configuration mistake. No combination of
`family: 4`, DNS ordering, host, or credentials gets past it.

**Consequence: the deployed instance runs with the SMTP variables unset.** It
therefore falls back to the Ethereal test account, which accepts the message and
logs a preview URL in the Render logs rather than delivering to the recipient.
Real SMTP delivery has been verified working **locally**, where the ports are
open - so the mail code itself is correct and this is purely a hosting limit.

To send real mail from a deployed instance you would need either a paid Render
tier, or an HTTP-based email API such as Resend or SendGrid, which deliver over
HTTPS and so are not affected by the SMTP port block. Switching to one would mean
replacing the Nodemailer transporters in `src/config/mailer.js` and
`src/services/emailService.js`; nothing that calls them would have to change.

**Render's free tier sleeps after about 15 minutes of inactivity.** The first
request after it sleeps takes roughly 50 seconds while the instance cold-starts,
and it usually looks like the frontend is broken rather than slow. Before any
demo or marking session, open the backend health endpoint once and wait for it to
respond, so the instance is already awake. This also means the cron jobs started
in `src/cron.js` only fire when the instance happens to be awake, so scheduled
work on the free tier is not dependable.

**Opening the bare backend URL returns `Cannot GET /`.** This is correct
behaviour, not a failed deploy. The backend is an API-only service and mounts no
route at `/` - every route lives under `/api/...`. Use `/api/health` to check the
service is up; it returns `{"status":"ok"}`.

---

## 8. Verification checklist

After a deploy, click through this end to end. Each step exercises a different
service, so a failure points at a specific place.

1. **Backend is awake** - open `https://foure-flora-fauna-tracker.onrender.com/api/health`, expect
   `{"status":"ok"}`. Allow ~50 seconds on the first hit (cold start). Confirms
   Render and the Express app.
2. **Frontend loads** - open `https://4e-flora-fauna-tracker.vercel.app`. Confirms the Vercel build.
3. **Register a new resident account** - confirms the frontend reached the
   backend (so `VITE_API_URL` is correct and has no trailing slash) and that
   Neon accepted a write.
4. **Log in with a seeded staff account** - confirms the seed ran against Neon
   and that `DEMO_PASSWORD` is what you think it is.
5. **Submit a report with a photo and a block number** - confirms Cloudinary
   upload plus the report write path. The photo should render on the report
   afterwards, which confirms the stored URL is being served.
6. **Submit a report with GPS instead of a block number** - confirms the
   either/or location rule accepts coordinates on their own.
7. **Submit a report with neither** - expect a 400 with a location message,
   confirming the rule is live on the deployed backend and not just locally.
8. **Open a flora record and request AI care recommendations** - confirms
   `GEMINI_API_KEY`. A 503 here means the key is unset.
9. **As staff, move a report to Resolved** - confirms the status workflow and
   triggers the resolved-case email.
10. **Check mail delivery** - on the Render deployment, expect the Ethereal
    preview URL in the logs and nothing in any real inbox; the SMTP ports are
    blocked there, so this is the correct result, not a failure (section 7). To
    verify real delivery, run the same step locally with the SMTP variables set
    and confirm the mail arrives in the resident's inbox.
11. **Check the Render logs for errors** - a 500 immediately after a model change
    is almost always the missing-column issue in section 7.

---

## 9. Demo Accounts

Seeded via `npm run seed` (see section 6). All three use the same password.

| Role | Email | Password |
|------|-------|----------|
| Estate Admin / Manager | `admin@emservices.com.sg` | `local-demo-only` (or `DEMO_PASSWORD` if set — see section 6) |
| Estate Officer / Field Officer | `staff@emservices.com.sg` | same as above |
| Welfare Partner | `welfare@emservices.com.sg` | same as above — scoped to assigned blocks, sightings view only |

**Residents have no seeded account.** Register one via the app's Register page.
Use a real, working email address — the app sends a notification email when a
submitted report is marked Resolved (see section 3, mailer), so a fake or
unreachable address means that notification is never delivered.