# 4E — Flora, Fauna & Estate Biodiversity Tracker

Full-stack biodiversity and estate management platform built for the SCCCI AI Challenge (Problem Statement 4E), in partnership with a Town Council. Tracks estate flora health, fauna sightings (community cats, pigeons, rodents), and resident-reported issues, with role-based access for residents, welfare partners, field officers, and managers.

## Team & Module Ownership
| Member | Module | Details |
|---|---|---|
| Shernell | Flora Management | Greenery records, horticulture handbook, AI care recommendations |
| Renee | Fauna Sightings | Cat/pigeon tracking, hotspot mapping, rodent assessments |
| Klemens | Reports, Authentication & Role Management | Resident reports, JWT/RBAC, zone assignments |
| Angelyn | Alert Engine & Admin Dashboard | Alert rules, notification log, Command Centre dashboard |

Full design docs per member are in `design/<name>/` (use-cases, API documentation, database schema).

## Tech Stack
- Frontend: React + Vite, Material UI (Vercel)
- Backend: Node.js + Express (Render)
- Database: PostgreSQL (Neon)
- Storage: Cloudinary
- AI: Google Gemini API

## Live Deployment
- Frontend: https://4e-flora-fauna-tracker.vercel.app
- Backend API: https://foure-flora-fauna-tracker.onrender.com

Full deployment architecture, environment variables, and seeding procedure: see `deployment.md`.

## Local Setup

**Backend:**
```bash
cd backend
npm install
cp .env.example .env   # fill in real values, or leave blank to use local SQLite
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

**Seeding demo data** (run from `backend/`):
```bash
npm run seed          # demo accounts + alert/dashboard data
npm run seed:flora    # flora catalog records
npm run seed:fauna    # fauna sighting records
```

## Status
Feature-complete, submitted for final review.