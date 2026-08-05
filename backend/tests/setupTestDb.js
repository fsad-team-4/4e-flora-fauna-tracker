// angelyn
// TEST DATABASE GUARD - runs before every test file, via jest `setupFiles`.
//
// WHY THIS EXISTS. Every test in this repo that touches the database opens with
// `process.env.DATABASE_URL = 'sqlite::memory:'` as its literal first line, because
// src/models/index.js falls back to the on-disk dev database (backend/database.sqlite) when
// that variable is unset. A test file that forgets the line and then calls
// `sequelize.sync({ force: true })` does not fail - it silently DROPS AND RECREATES every
// table in the developer's real database, destroying whatever was in it.
//
// That is not hypothetical: it happened while adding residentUpdateStatus.test.js, and it
// wiped the entire local dataset (18 greenery records, 24 sightings, 20 reports, 39 rodent
// assessments, 8 work orders, the notification log and 14 days of snapshots). The data was
// restorable only because `npm run test-data` exists.
//
// A convention that has to be remembered on line 1 of every new file, where forgetting it is
// both silent and destructive, is not a safe convention. This makes it the default instead:
// the variable is set here, before the test file is loaded, so a new test cannot reach the
// dev database by omission.
//
// The per-file lines are now redundant. They are deliberately left in place - they document
// the intent at the point of use, they keep each file runnable in isolation without this
// setup, and removing 24 of them would be churn for no benefit.
//
// ESCAPE HATCH: set ALLOW_REAL_DB_IN_TESTS=1 to opt out. Nothing in this repo does, and
// anything that ever needs to should have to say so explicitly rather than inherit it by
// forgetting a line.
if (process.env.ALLOW_REAL_DB_IN_TESTS !== '1') {
  process.env.DATABASE_URL = 'sqlite::memory:';
}

// Signing key for tests. Set here for the same reason - a missing secret makes auth tests
// fail in ways that look like route bugs.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
