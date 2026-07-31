// angelyn
// Idempotent column back-fill for the work order pipeline.
//
// WHY THIS EXISTS: the app boots with sequelize.sync() (no `alter`), which
// creates missing TABLES but never adds columns to a table that already exists.
// The pipeline change added ~20 columns to WorkOrders, so every developer with
// an existing database.sqlite would hit "no such column: WorkOrder.scheduled_for"
// on the queue. `sync({ alter: true })` would fix it but rebuilds tables on
// SQLite, which risks the team's demo data - so this adds only what is missing.
//
// Scope is deliberately narrow: it touches ONLY the WorkOrders table (my module).
// It is safe to run on every boot and does nothing once the columns exist.
const sequelize = require('../config/database');

// column -> SQLite type. Kept in step with models/WorkOrder.js.
const WORK_ORDER_COLUMNS = {
  scheduled_for: 'DATETIME',
  town_council: 'VARCHAR(255)',
  resident_report_ids: 'TEXT',
  photo_urls: 'TEXT',
  vendor_briefing: 'TEXT',
  vendor_briefing_at: 'DATETIME',
  dispatched_by: 'INTEGER',
  dispatched_by_name: 'VARCHAR(255)',
  scheduled_at: 'DATETIME',
  scheduled_by: 'INTEGER',
  scheduled_by_name: 'VARCHAR(255)',
  in_progress_at: 'DATETIME',
  in_progress_by: 'INTEGER',
  in_progress_by_name: 'VARCHAR(255)',
  resolved_at: 'DATETIME',
  resolved_by: 'INTEGER',
  resolved_by_name: 'VARCHAR(255)',
};

async function ensureWorkOrderColumns() {
  // Postgres (production) is managed by sync/migrations; this back-fill is the
  // SQLite dev-database path only.
  if (sequelize.getDialect() !== 'sqlite') return { skipped: 'not sqlite' };

  let existing;
  try {
    existing = await sequelize.query('PRAGMA table_info(WorkOrders)', { type: sequelize.QueryTypes.SELECT });
  } catch {
    return { skipped: 'WorkOrders table not present yet' }; // fresh DB: sync creates it complete
  }
  if (!existing.length) return { skipped: 'WorkOrders table not present yet' };

  const have = new Set(existing.map(c => c.name));
  const added = [];
  for (const [col, type] of Object.entries(WORK_ORDER_COLUMNS)) {
    if (have.has(col)) continue;
    try {
      await sequelize.query(`ALTER TABLE WorkOrders ADD COLUMN ${col} ${type}`);
      added.push(col);
    } catch (e) {
      console.error(`work order schema: could not add ${col}:`, e.message);
    }
  }

  // 'open' was the pre-pipeline value for "raised but not closed". Map it once so
  // old rows render as a real first stage instead of an unknown status. Closed
  // rows already mean 'closed' and are left exactly as they are.
  let migratedStatuses = 0;
  if (added.length) {
    const [, meta] = await sequelize.query("UPDATE WorkOrders SET status = 'raised' WHERE status = 'open'");
    migratedStatuses = meta?.changes ?? 0;
  }

  if (added.length) {
    console.log(`work order schema: added ${added.length} column(s) [${added.join(', ')}], remapped ${migratedStatuses} 'open' -> 'raised'`);
  }
  return { added, migratedStatuses };
}

module.exports = { ensureWorkOrderColumns, WORK_ORDER_COLUMNS };
