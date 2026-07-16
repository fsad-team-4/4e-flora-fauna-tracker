# CLAUDE.md

## PROJECT CONTEXT

Project: PS 4E - Flora, Fauna & Estate Biodiversity Tracker (Full Stack PoC, SCCCI AI Challenge)
Client: EM Services (Town Council estate management)

My module (Member 3 / Klemens): Resident Reports & Authentication
- ResidentReport CRUD (photo upload via Cloudinary, GPS pin, case status workflow: Open/In-Progress/Resolved)
- Shared JWT authentication + RBAC middleware (roles: resident / staff / admin)
- This auth layer is the keystone - consumed by ALL other modules (M1 flora, M2 fauna, M4 alerts)
- Rule-based auto-email to resident when their case is resolved

Member 1 / Shernell - Flora Management:
- GreeneryRecord CRUD with RBAC (read and mutations: staff/admin only; residents have zero access)
- CSV bulk upload (partial-failure: valid rows import, invalid rows reported by row number)
- Health status tracking (healthy / at_risk / critical)
- Soft delete (is_deleted flag; hidden from lists, retained for data retention)
- Gemini AI care recommendations (emoji-prefixed actionable bullets)
- Key files:
  - backend/src/models/GreeneryRecord.js
  - backend/src/controllers/floraController.js
  - backend/src/routes/floraRoutes.js
  - frontend/src/pages/FloraList.jsx
  - frontend/src/pages/AddFlora.jsx
  - frontend/src/pages/FloraDetail.jsx
  - backend/tests/shernell/flora.test.js

Tech Stack:
- Frontend: React + Vite, MUI/ui, Formik, Yup, Axios
- Backend: Node.js + Express, Sequelize ORM, Yup validation
- Database: SQLite (local dev) -> PostgreSQL via Neon (production)
- Images: Cloudinary
- Auth: JWT (jsonwebtoken) + bcryptjs

JWT payload shape: { user_id, role, name }

Key Files:
- Submission guide and task allocation in project docs
- Backend code in backend/src/

Writing Style:
- Use hyphen (-) instead of em dash in all generated documents and code

## BEHAVIORAL GUIDELINES

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" - "Write tests for invalid inputs, then make them pass"
- "Fix the bug" - "Write a test that reproduces it, then make it pass"
- "Refactor X" - "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] - verify: [check]
2. [Step] - verify: [check]
3. [Step] - verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
