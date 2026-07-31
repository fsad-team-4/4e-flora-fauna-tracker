// angelyn
// The work order pipeline: raised -> dispatched -> scheduled -> in_progress ->
// resolved -> closed.
//
// HONESTY CONTRACT (the reason this file exists rather than an inline update):
//  - A stage is only ever true because a WorkOrderEvent row says a named human
//    moved it at a recorded time. Nothing is inferred from a later stage.
//  - Reaching 'resolved' does NOT retro-fill 'scheduled'. A skipped stage stays
//    null forever, and the UI renders it "not yet", not done.
//  - 'scheduled' cannot be entered without a real attendance date. There is no
//    default, no "+3 days", no estimate.
//  - Movement is forward-only. Correcting a mistake is a new event, never an
//    edit or deletion of an old one.
const { WorkOrder, WorkOrderEvent } = require('../models');

// Ordered pipeline. Index is the rank used for forward-only enforcement.
const STAGES = ['raised', 'dispatched', 'scheduled', 'in_progress', 'resolved', 'closed'];

const STAGE_LABEL = {
  raised: 'Raised',
  dispatched: 'Dispatched to contractor',
  scheduled: 'Attendance scheduled',
  in_progress: 'Contractor on site',
  resolved: 'Work completed',
  closed: 'Closed',
};

// Approving a call-out commits money, so raising is admin-only (enforced at the
// route). Every other stage is operational reporting an officer can record.
const FINANCIAL_STAGES = new Set(['raised']);

// Cache columns on WorkOrder per stage. 'raised' reuses the existing approval
// audit (createdAt + approved_by) rather than duplicating it.
const CACHE_COLUMNS = {
  dispatched: { at: 'dispatched_at', by: 'dispatched_by', byName: 'dispatched_by_name' },
  scheduled: { at: 'scheduled_at', by: 'scheduled_by', byName: 'scheduled_by_name' },
  in_progress: { at: 'in_progress_at', by: 'in_progress_by', byName: 'in_progress_by_name' },
  resolved: { at: 'resolved_at', by: 'resolved_by', byName: 'resolved_by_name' },
  closed: { at: 'closed_at', by: 'closed_by', byName: 'closed_by_name' },
};

const rank = stage => STAGES.indexOf(stage);
const isStage = stage => rank(stage) >= 0;

/**
 * Can `from` move to `to`?
 *
 * Forward-only, and skipping is allowed on purpose: a contractor can attend
 * without anyone having logged a scheduled date, and pretending otherwise would
 * force a fake 'scheduled' event just to reach 'in_progress'. The skipped stage
 * stays null and reads as never-happened, which is the truth.
 */
function canTransition(from, to) {
  if (!isStage(from) || !isStage(to)) return { ok: false, error: 'unknown stage' };
  if (rank(to) === rank(from)) return { ok: false, error: `work order is already ${to}` };
  if (rank(to) < rank(from)) {
    return { ok: false, error: `cannot move a work order backwards (${from} -> ${to})` };
  }
  return { ok: true };
}

/**
 * Record a stage change: one append-only event plus the denormalised cache.
 *
 * `at` defaults to now but is caller-supplied so a back-dated attendance can be
 * logged truthfully (the event still carries its own createdAt for "when recorded").
 * `scheduledFor` is required to enter 'scheduled' and is never synthesised.
 */
async function recordStage(workOrder, { stage, actor, note = null, at = null, scheduledFor = null }) {
  const check = canTransition(workOrder.status, stage);
  if (!check.ok) return { error: check.error, code: 400 };

  if (!actor || actor.user_id == null) {
    return { error: 'a stage change must record who made it', code: 400 };
  }

  // A scheduled stage without a date would be exactly the theatre the brief
  // forbids: a tracker claiming "scheduled" when nothing is scheduled.
  let scheduled = null;
  if (stage === 'scheduled') {
    scheduled = scheduledFor ? new Date(scheduledFor) : null;
    if (!scheduled || Number.isNaN(scheduled.getTime())) {
      return { error: 'scheduled_for is required to mark a work order scheduled - it is never estimated', code: 400 };
    }
  }

  const when = at ? new Date(at) : new Date();
  if (Number.isNaN(when.getTime())) return { error: 'invalid event time', code: 400 };

  const event = await WorkOrderEvent.create({
    work_order_id: workOrder.id,
    stage,
    at: when,
    actor_id: actor.user_id,
    actor_name: actor.name || null,
    note: note || null,
  });

  const patch = { status: stage };
  const cols = CACHE_COLUMNS[stage];
  if (cols) {
    patch[cols.at] = when;
    patch[cols.by] = actor.user_id;
    patch[cols.byName] = actor.name || null;
  }
  if (scheduled) patch.scheduled_for = scheduled;
  await workOrder.update(patch);

  return { code: 200, event, workOrder };
}

/**
 * The pipeline as the UI should render it: one entry per stage, in order, each
 * either reached (with its real timestamp and actor) or explicitly not.
 * `reached: false` must never be drawn as done or in-progress.
 */
function buildPipeline(workOrder, events = []) {
  const byStage = new Map();
  // last event wins per stage, so a correction supersedes without deleting history
  for (const e of events) byStage.set(e.stage, e);

  return STAGES.map(stage => {
    const e = byStage.get(stage);
    // 'raised' predates the event log for rows created before this feature, so
    // fall back to the approval audit that has always been recorded.
    if (!e && stage === 'raised' && workOrder.createdAt) {
      return {
        stage,
        label: STAGE_LABEL[stage],
        reached: true,
        at: workOrder.createdAt,
        actor_name: workOrder.approved_by_name || null,
        note: null,
      };
    }
    return {
      stage,
      label: STAGE_LABEL[stage],
      reached: Boolean(e),
      at: e ? e.at : null,
      actor_name: e ? e.actor_name : null,
      note: e ? e.note : null,
    };
  });
}

// Most recent real activity on the order, for the queue's "last update" column.
// Derived from events only - never from updatedAt, which changes on any write.
function lastUpdate(workOrder, events = []) {
  const times = events.map(e => new Date(e.at).getTime()).filter(t => !Number.isNaN(t));
  if (!times.length) return workOrder.createdAt || null;
  return new Date(Math.max(...times));
}

module.exports = {
  STAGES, STAGE_LABEL, FINANCIAL_STAGES, CACHE_COLUMNS,
  canTransition, recordStage, buildPipeline, lastUpdate, isStage,
};
