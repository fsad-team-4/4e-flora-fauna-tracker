// angelyn
// Prevention Scorecard - the "did it actually work?" layer.
//
// Layer 1 turns AI-flagged rodent risk into approved, consolidated work orders.
// This service measures whether those interventions REDUCED recurrence, which is
// the outcome the client asked to measure (repeat-risk reduction) rather than raw
// activity volume. For each work order (an intervention at a block on a date) it
// compares the number of rodent reports at that block in the window BEFORE the
// intervention against the window AFTER it:
//   - after == 0  -> prevented (the intervention held)
//   - after > 0   -> recurred (the problem came back)
//   - too recent  -> monitoring (not enough follow-up time to judge yet)
//
// Everything here is a pure function of the rows passed in, so it is unit-testable
// with a fixed `now` and needs no database.

const DAY = 24 * 60 * 60 * 1000;

// callout cost assumption - matches the consolidation saving used in Layer 1's
// work-order queue. A demo figure, not a real EM Services rate.
const DEFAULT_CALLOUT_COST = 80;

function blockKey(b) {
  return (b || '').trim().toLowerCase();
}

function computeScorecard({
  assessments = [],
  workOrders = [],
  now = Date.now(),
  windowDays = 14,
  trendWeeks = 8,
  calloutCost = DEFAULT_CALLOUT_COST,
} = {}) {
  const win = windowDays * DAY;

  // rodent report timestamps grouped by block, for before/after counting
  const timesByBlock = new Map();
  const allTimes = [];
  for (const a of assessments) {
    if (a.is_deleted) continue;
    const t = new Date(a.createdAt).getTime();
    allTimes.push(t);
    const k = blockKey(a.block_number);
    if (!timesByBlock.has(k)) timesByBlock.set(k, []);
    timesByBlock.get(k).push(t);
  }

  const interventions = [];
  for (const w of workOrders) {
    if (w.is_deleted) continue;
    const T = new Date(w.createdAt).getTime();
    const k = blockKey(w.block_number);
    const hasBlock = k.length > 0;
    const times = timesByBlock.get(k) || [];

    // "before" includes the reports that triggered the escalation (they precede
    // the approval); "after" is strictly post-intervention.
    const before = hasBlock ? times.filter(t => t >= T - win && t <= T).length : 0;
    const after = hasBlock ? times.filter(t => t > T && t <= T + win).length : 0;
    const matured = T + win <= now; // enough follow-up time has elapsed to judge

    let outcome;
    if (!hasBlock) outcome = 'unmeasurable';
    else if (!matured) outcome = 'monitoring';
    else outcome = after > 0 ? 'recurred' : 'prevented';

    const closeDays = w.closed_at ? Math.max(0, (new Date(w.closed_at).getTime() - T) / DAY) : null;

    interventions.push({
      id: w.id,
      block: w.block_number,
      date: w.createdAt,
      status: w.status,
      consolidated_count: w.consolidated_count || 1,
      before,
      after,
      outcome,
      close_days: closeDays == null ? null : Math.round(closeDays * 10) / 10,
    });
  }

  const measured = interventions.filter(i => i.outcome === 'prevented' || i.outcome === 'recurred');
  const prevented = measured.filter(i => i.outcome === 'prevented').length;
  const recurred = measured.filter(i => i.outcome === 'recurred').length;
  const monitoring = interventions.filter(i => i.outcome === 'monitoring').length;

  const totalBefore = measured.reduce((s, i) => s + i.before, 0);
  const totalAfter = measured.reduce((s, i) => s + i.after, 0);

  const closed = interventions.filter(i => i.status === 'closed' && i.close_days != null);
  const avgTimeToClose = closed.length
    ? Math.round((closed.reduce((s, i) => s + i.close_days, 0) / closed.length) * 10) / 10
    : null;

  const totalWo = interventions.length;
  const closedCount = interventions.filter(i => i.status === 'closed').length;
  const callOutsAvoided = interventions.reduce((s, i) => s + Math.max(0, i.consolidated_count - 1), 0);

  // weekly estate-wide report volume, oldest-first, to show the trajectory
  const trend = [];
  for (let wk = trendWeeks - 1; wk >= 0; wk--) {
    const end = now - wk * 7 * DAY;
    const start = end - 7 * DAY;
    trend.push({
      weekStart: new Date(start).toISOString(),
      reports: allTimes.filter(t => t >= start && t < end).length,
    });
  }

  return {
    summary: {
      repeat_risk_reduction: totalBefore ? (totalBefore - totalAfter) / totalBefore : null,
      prevention_rate: measured.length ? prevented / measured.length : null,
      measured: measured.length,
      prevented,
      recurred,
      monitoring,
      total_before: totalBefore,
      total_after: totalAfter,
      avg_time_to_close_days: avgTimeToClose,
      impact_completion: totalWo ? closedCount / totalWo : null,
      total_work_orders: totalWo,
      open_work_orders: totalWo - closedCount,
      closed_work_orders: closedCount,
      call_outs_avoided: callOutsAvoided,
      est_savings: callOutsAvoided * calloutCost,
    },
    interventions: interventions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 50),
    trend,
    params: { windowDays, trendWeeks, calloutCost },
  };
}

module.exports = { computeScorecard };
