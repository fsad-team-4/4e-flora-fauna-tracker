// angelyn
// Stage-change notifications for a work order.
//
// OWNERSHIP / HANDOVER NOTE (overlaps Klemens' M3 resident-email module):
// Resident-facing email is Klemens' area. Nothing here edits his files. The
// overlap is deliberately confined to one seam - `resolveResidentRecipients` -
// which reads his ResidentReport/User models but writes nothing. If he wants to
// own resident delivery, he replaces that one function (or passes his own
// resolver in) and the rest of this file is unchanged. Everything else here is
// dispatch + logging, which is my notificationService.
//
// HONESTY CONTRACT:
//  - Every send is written to NotificationLog with its REAL outcome via
//    sendAndRecord: 'sent' only when nodemailer accepted it, 'failed' with the
//    error otherwise. The UI shows "email sent 14:32" only for a 'sent' row.
//  - A work order with no linked resident report notifies nobody and reports
//    `skipped: 'no resident linked'`. That is not a failure and must not render
//    as one - it is simply an item no resident is attached to.
const { ResidentReport, User } = require('../models');
const { sendAndRecord } = require('./notificationService');
const { STAGE_LABEL } = require('./workOrderStages');

// Stages worth telling a resident about. 'raised' and 'dispatched' are internal
// procurement steps; residents care that someone is coming and that it is done.
const RESIDENT_VISIBLE = new Set(['scheduled', 'in_progress', 'resolved', 'closed']);

/**
 * THE HANDOVER SEAM. Given a work order, return [{ email, name, report_id }].
 * Read-only against Klemens' ResidentReport + the shared User model.
 */
async function resolveResidentRecipients(workOrder) {
  const ids = Array.isArray(workOrder.resident_report_ids) ? workOrder.resident_report_ids : [];
  if (!ids.length) return [];
  const reports = await ResidentReport.findAll({
    where: { id: ids, is_deleted: false },
    include: [{ model: User, as: 'reporter', attributes: ['id', 'name', 'email'] }],
  });
  const seen = new Set();
  const out = [];
  for (const r of reports) {
    const email = r.reporter?.email;
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: r.reporter.name || null, report_id: r.id });
  }
  return out;
}

// WHY THIS EMAIL TALKS ABOUT THE WORKS, NOT ABOUT "YOUR REPORT".
//
// It used to open "Update on your report" and then state "Status: Contractor on
// site". That read as though the resident's own case had changed status - and it
// had not. Nothing in this module writes ResidentReport.status or CaseStatusLog
// (those are Klemens' M3, and this file's handover note keeps the overlap to one
// read-only seam), so a resident who opened the app after that email saw their
// case still sitting at 'open' and the two sources contradicted each other.
//
// The stage genuinely belongs to the WORK ORDER, so the wording now says so. The
// resident is told what is happening on the ground without any claim about their
// report's status, which keeps this honest without a cross-module write.
function buildMessage(workOrder, stage, recipientName) {
  const label = STAGE_LABEL[stage] || stage;
  const where = workOrder.block_number || 'your block';
  const subject = `Pest control update - ${where}: ${label}`;

  const lines = [
    `Hello${recipientName ? ` ${recipientName}` : ''},`,
    '',
    `This is an update on the pest control work for ${where}, raised in response to`,
    'reports from residents including yours.',
    '',
    `Work status: ${label}`,
  ];

  // Only state a date when one was actually recorded. No estimates, no "within
  // 3 working days" - if nothing is scheduled, say exactly that.
  if (stage === 'scheduled') {
    lines.push(workOrder.scheduled_for
      ? `Scheduled attendance: ${new Date(workOrder.scheduled_for).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'Attendance date: not yet confirmed.');
  }
  if (stage === 'resolved' || stage === 'closed') {
    lines.push('The contractor has reported the work as completed.');
  }

  // Names the boundary explicitly, so the email cannot be read as a change to the
  // resident's own case. Their report is updated on its own track by the officer
  // handling it.
  lines.push(
    '',
    'This describes the pest control work at the block. The status of your own',
    'report is tracked separately in the app.',
    '',
    'This is an automated update from the estate management system.',
  );
  return { subject, body: lines.join('\n') };
}

/**
 * Notify linked residents that a work order changed stage.
 *
 * Never throws: a notification problem must not roll back a real stage change
 * that already happened. Returns exactly what occurred so the caller can report
 * it truthfully rather than assuming success.
 */
async function notifyStageChange(workOrder, stage) {
  if (!RESIDENT_VISIBLE.has(stage)) {
    return { attempted: 0, sent: 0, failed: 0, skipped: 'stage is not resident-facing', results: [] };
  }
  let recipients = [];
  try {
    recipients = await resolveResidentRecipients(workOrder);
  } catch (e) {
    console.error('resident lookup failed (work order kept):', e.message);
    return { attempted: 0, sent: 0, failed: 0, skipped: 'resident lookup failed', results: [] };
  }
  if (!recipients.length) {
    return { attempted: 0, sent: 0, failed: 0, skipped: 'no resident linked', results: [] };
  }

  const results = [];
  for (const r of recipients) {
    const { subject, body } = buildMessage(workOrder, stage, r.name);
    // sendAndRecord writes the true outcome to NotificationLog; a failure here
    // becomes a 'failed' row that the Notification Log can resend, exactly like
    // every other dispatch in the system.
    const log = await sendAndRecord({
      channel: 'email',
      recipient: r.email,
      subject,
      body,
      severity: workOrder.risk_level || null,
      source_type: 'work_order',
      source_id: workOrder.id,
    });
    results.push({
      recipient: r.email,
      report_id: r.report_id,
      status: log.status,
      error_reason: log.error_reason || null,
      log_id: log.id,
      at: log.createdAt,
    });
  }

  return {
    attempted: results.length,
    sent: results.filter(r => r.status === 'sent').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: null,
    results,
  };
}

module.exports = { notifyStageChange, resolveResidentRecipients, buildMessage, RESIDENT_VISIBLE };
