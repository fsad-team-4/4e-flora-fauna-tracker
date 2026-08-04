// angelyn
// Idempotent column back-fill for the RodentAssessments table.
//
// WHY THIS EXISTS: the app boots with sequelize.sync() (no `alter`), which creates
// missing TABLES but never adds columns to a table that already exists. The
// root-cause / outcome / SLA change adds eight columns, so every developer with an
// existing database.sqlite - and any Neon database that already holds rows - would
// otherwise hit "no such column: RodentAssessment.root_cause" on the list endpoint.
//
// DIALECT-AWARE, unlike services/workOrderSchema.js, which bails out on anything
// that is not SQLite and leaves Postgres to "sync/migrations" that do not exist in
// this repo. That was survivable there only because those columns landed before the
// Neon database held data. It is not survivable here, so this handles both:
//   - Postgres: ADD COLUMN IF NOT EXISTS, which is natively idempotent
//   - SQLite:   PRAGMA table_info first, because SQLite has no IF NOT EXISTS here
//
// Safe to run on every boot; does nothing once the columns exist.
const sequelize = require('../config/database');

// Logical type -> per-dialect SQL. Kept in step with models/RodentAssessment.js.
const SQL_TYPES = {
  sqlite: { STRING: 'VARCHAR(255)', DATE: 'DATETIME', INT: 'INTEGER', BOOL: 'BOOLEAN' },
  postgres: { STRING: 'VARCHAR(255)', DATE: 'TIMESTAMP WITH TIME ZONE', INT: 'INTEGER', BOOL: 'BOOLEAN' },
};

const RODENT_ASSESSMENT_COLUMNS = {
  root_cause: 'STRING',
  resolved_at: 'DATE',
  resolution_type: 'STRING',
  recurrence_within_30d: 'BOOL',
  recurrence_checked_at: 'DATE',
  sla_target_at: 'DATE',
  sla_breached_at: 'DATE',
  triggering_sensor_id: 'INT',
  prior_count: 'INT',
};

const TABLE = 'RodentAssessments';

// Returns the set of column names already on the table, or null when the table is
// not there yet (fresh database - sync() will create it complete).
//
// Both dialects are probed even though Postgres could rely on ADD COLUMN IF NOT
// EXISTS alone: without the check, every boot would report all nine columns as
// "added" and the log line would be a lie.
async function existingColumns(dialect) {
  try {
    if (dialect === 'postgres') {
      const rows = await sequelize.query(
        'SELECT column_name FROM information_schema.columns WHERE table_name = :t',
        { replacements: { t: TABLE }, type: sequelize.QueryTypes.SELECT }
      );
      return rows.length ? new Set(rows.map(r => r.column_name)) : null;
    }
    const rows = await sequelize.query(`PRAGMA table_info(${TABLE})`, {
      type: sequelize.QueryTypes.SELECT,
    });
    return rows.length ? new Set(rows.map(c => c.name)) : null;
  } catch {
    return null;
  }
}

async function ensureRodentAssessmentColumns() {
  const dialect = sequelize.getDialect();
  const types = SQL_TYPES[dialect];
  if (!types) return { skipped: `unsupported dialect ${dialect}` };

  const have = await existingColumns(dialect);
  if (!have) return { skipped: `${TABLE} not present yet` };

  const added = [];
  for (const [col, logicalType] of Object.entries(RODENT_ASSESSMENT_COLUMNS)) {
    if (have.has(col)) continue;
    const type = types[logicalType];
    // Quoted table name: Postgres folds unquoted identifiers to lower case, and
    // Sequelize created this table as "RodentAssessments" with capitals.
    const sql = dialect === 'postgres'
      ? `ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS ${col} ${type}`
      : `ALTER TABLE ${TABLE} ADD COLUMN ${col} ${type}`;
    try {
      await sequelize.query(sql);
      added.push(col);
    } catch (e) {
      // Never fatal: a failed back-fill must not stop the server booting. The
      // endpoint that needs the column will surface the error instead.
      console.error(`rodent assessment schema: could not add ${col}:`, e.message);
    }
  }

  if (added.length) {
    console.log(`rodent assessment schema: added ${added.length} column(s) [${added.join(', ')}]`);
  }
  return { added };
}

module.exports = { ensureRodentAssessmentColumns, RODENT_ASSESSMENT_COLUMNS };
