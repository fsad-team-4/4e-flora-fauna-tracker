// angelyn
// SLA targets and outcome follow-up for rodent assessments.
//
// Two jobs live here:
//   1. slaTargetFor()  - the response target a report is judged against, derived
//      once at create time from the AI's risk level.
//   2. recomputeOutcomes() - the nightly pass that stamps breaches and answers
//      "did the same block report again within 30 days of this being resolved?"
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const RodentAssessment = require('../models/RodentAssessment');

/**
 * Hours from filing to the response target, by AI-assigned risk level.
 *
 * ============================ READ THIS ====================================
 * THESE ARE PLACEHOLDER TARGETS, NOT EM SERVICES POLICY. Nothing in the brief or
 * the codebase states a contractual response time, so these are a defensible
 * default (same-day for critical, next-working-day for high, a working week for
 * medium, a fortnight for low) chosen so the SLA column has something to render.
 *
 * They must be replaced with the real figures before anyone reads a breach count
 * as a performance measure. The UI says "target" rather than "SLA breach" for the
 * same reason - the mechanism is real, the thresholds are assumed.
 * ===========================================================================
 */
const SLA_HOURS = {
  critical: 24,
  high: 48,
  medium: 120,
  low: 240,
};

// Recurrence window: how long after a resolution a fresh report at the same block
// counts as the fix not having held.
const RECURRENCE_DAYS = 30;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The response target for one assessment, or null when there is no risk level to
 * derive it from. Never guesses: an unscored assessment gets no target rather
 * than a default one, because a target nobody set is not a target anybody agreed.
 */
function slaTargetFor(riskLevel, createdAt = new Date()) {
  const hours = SLA_HOURS[riskLevel];
  if (!hours) return null;
  const base = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + hours * HOUR_MS);
}

/**
 * Did this assessment miss its target, and when?
 *
 * Returns the moment the breach OCCURRED - which is the target itself, not the
 * moment the cron happened to notice. Stamping `now` would mean a job that ran
 * three days late recorded the breach three days late, and "overdue by" would be
 * measured from the wrong end.
 *
 * A row resolved before its target never breaches; a row resolved after it did
 * breach, and stays breached.
 */
function breachedAt(row, now = new Date()) {
  if (!row.sla_target_at) return null;
  const target = new Date(row.sla_target_at);
  if (Number.isNaN(target.getTime())) return null;
  const settled = row.resolved_at ? new Date(row.resolved_at) : now;
  return settled > target ? target : null;
}

// Same trimmed/lower-cased block identity the rest of this module uses, expressed
// in SQL so the comparison happens in the database rather than over a truncated
// page of rows.
function sameBlock(block) {
  return sqlWhere(fn('lower', fn('trim', col('block_number'))), block.trim().toLowerCase());
}

/**
 * Nightly pass. Three passes, each idempotent, so running it twice in a day (or on
 * every boot) changes nothing the second time.
 *
 *  1. BACKFILL targets for rows that predate the column.
 *  2. STAMP breaches on rows that have missed their target.
 *  3. CLOSE the recurrence question for resolutions whose 30-day window has fully
 *     elapsed. Windows still open are left null - "no recurrence yet" is not "no
 *     recurrence", and reporting an unfinished window as a clean result would
 *     overstate how well the fixes are holding.
 */
async function recomputeOutcomes(now = new Date()) {
  const result = { targetsBackfilled: 0, breachesStamped: 0, recurrenceResolved: 0 };

  // -- 1. backfill missing targets ------------------------------------------
  const needTarget = await RodentAssessment.findAll({
    where: { is_deleted: false, sla_target_at: null, risk_level: { [Op.ne]: null } },
  });
  for (const row of needTarget) {
    const target = slaTargetFor(row.risk_level, row.createdAt);
    if (!target) continue;
    await row.update({ sla_target_at: target });
    result.targetsBackfilled += 1;
  }

  // -- 2. stamp breaches ----------------------------------------------------
  const maybeBreached = await RodentAssessment.findAll({
    where: {
      is_deleted: false,
      sla_breached_at: null,
      sla_target_at: { [Op.ne]: null, [Op.lt]: now },
    },
  });
  for (const row of maybeBreached) {
    const at = breachedAt(row, now);
    if (!at) continue;
    await row.update({ sla_breached_at: at });
    result.breachesStamped += 1;
  }

  // -- 3. close the recurrence window --------------------------------------
  // Only resolutions old enough for the full window to have elapsed.
  const windowClosed = new Date(now.getTime() - RECURRENCE_DAYS * DAY_MS);
  const dueForCheck = await RodentAssessment.findAll({
    where: {
      is_deleted: false,
      recurrence_within_30d: null,
      resolved_at: { [Op.ne]: null, [Op.lte]: windowClosed },
    },
  });
  for (const row of dueForCheck) {
    // No block means no way to ask "did this block report again" - leave it null
    // rather than recording a false, which would read as "the fix held".
    if (!row.block_number || !row.block_number.trim()) continue;
    const resolved = new Date(row.resolved_at);
    const recurred = await RodentAssessment.count({
      where: {
        is_deleted: false,
        id: { [Op.ne]: row.id },
        createdAt: { [Op.gt]: resolved, [Op.lte]: new Date(resolved.getTime() + RECURRENCE_DAYS * DAY_MS) },
        [Op.and]: [sameBlock(row.block_number)],
      },
    });
    await row.update({ recurrence_within_30d: recurred > 0, recurrence_checked_at: now });
    result.recurrenceResolved += 1;
  }

  return result;
}

module.exports = {
  slaTargetFor,
  breachedAt,
  recomputeOutcomes,
  sameBlock,
  SLA_HOURS,
  RECURRENCE_DAYS,
};
