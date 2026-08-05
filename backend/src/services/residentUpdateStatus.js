// angelyn
// RESIDENT UPDATE - the last step of an assessment's tracked lifecycle.
//
// This step used to render as "NOT BUILT" in the lifecycle panel. That was accurate when it
// was written and is no longer: workOrderNotify.js sends the resident a message when a work
// order reaches a resident-facing stage, and every send is written to NotificationLog with
// its REAL outcome. So the facts already existed in the database - what was missing was a
// read path from an assessment back to them.
//
// NOTHING IS INFERRED HERE. That matters more on this step than anywhere else in the panel,
// because the claim "the resident was told" is the one an officer would repeat to a resident
// who says nobody contacted them. So:
//
//   - `sent` is returned ONLY where a NotificationLog row exists with status 'sent'. Not
//     "we called the mailer", not "the stage was reached" - a logged send.
//   - `failed` is a first-class outcome, not folded into "not sent". A bounced update is
//     worse than no update, because the system believed it had informed someone.
//   - every not-sent case returns WHY, so the panel can say "no reachable resident on the
//     linked report" rather than leaving a blank that reads as an omission.
//
// The two "cannot happen yet" cases are deliberately distinct from the failures: an
// assessment with no work order, and a work order that has not yet reached a
// resident-facing stage, are both correct states with nothing owed to anybody.
const { Op } = require('sequelize');
const { NotificationLog } = require('../models');
const { resolveResidentRecipients, RESIDENT_VISIBLE } = require('./workOrderNotify');

/**
 * Outcome vocabulary. The panel renders these directly, so a new value here is a UI change.
 *
 *  not_applicable  - no work order, or the order has not reached a resident-facing stage
 *  unreachable     - the order IS at such a stage but no resident could be resolved
 *  pending         - resident-facing stage reached, resident reachable, nothing logged yet
 *  failed          - a send was attempted and the log records it failing
 *  sent            - a send is logged as delivered to the mail server
 */
const OUTCOMES = ['not_applicable', 'unreachable', 'pending', 'failed', 'sent'];

/**
 * Given an assessment's linked work order (or null), report whether the resident was told.
 *
 * `workOrder` is passed in rather than looked up: the detail route already loads it, and a
 * second query here would let the two disagree about which order an assessment belongs to.
 */
async function residentUpdateStatus(workOrder) {
  if (!workOrder) {
    return {
      status: 'not_applicable',
      reason: 'No work order was raised for this report, so there is no outcome to pass on.',
      messages: [],
    };
  }

  // The stage gate is read from workOrderNotify's own RESIDENT_VISIBLE rather than
  // re-listed, so this cannot drift from the set that actually triggers a send.
  const stageReached = RESIDENT_VISIBLE.has(workOrder.status);

  // Logged sends first, and they are reported EVEN IF the current stage is no longer
  // resident-facing. A closed order that was messaged at 'scheduled' still told the
  // resident something, and hiding that because of the order's present stage would be a
  // false negative on exactly the question this answers.
  const logs = await NotificationLog.findAll({
    where: {
      source_type: 'work_order',
      // source_id is a STRING column (it holds ids from several different sources), so a
      // numeric work order id has to be compared as text or Postgres rejects the query.
      source_id: String(workOrder.id),
      status: { [Op.in]: ['sent', 'failed'] },
    },
    order: [['createdAt', 'ASC']],
  });

  const messages = logs.map(l => ({
    id: l.id,
    recipient: l.recipient,
    status: l.status,
    subject: l.subject,
    error_reason: l.error_reason || null,
    at: l.createdAt,
  }));

  const sent = messages.filter(m => m.status === 'sent');
  if (sent.length) {
    return {
      status: 'sent',
      // the FIRST send is when the resident was informed; later ones are stage updates
      at: sent[0].at,
      lastAt: sent[sent.length - 1].at,
      count: sent.length,
      recipients: [...new Set(sent.map(m => m.recipient))],
      // A partial failure is surfaced alongside the success rather than swallowed by it:
      // two linked residents where one bounced is not "the residents were told".
      failedCount: messages.filter(m => m.status === 'failed').length,
      messages,
    };
  }

  if (messages.length) {
    const last = messages[messages.length - 1];
    return {
      status: 'failed',
      at: last.at,
      count: messages.length,
      recipients: [...new Set(messages.map(m => m.recipient))],
      reason: last.error_reason || 'The update could not be delivered.',
      messages,
    };
  }

  if (!stageReached) {
    return {
      status: 'not_applicable',
      reason: 'The work order has not reached a stage the resident is told about yet.',
      messages,
    };
  }

  // At this point a send SHOULD have happened, so the only honest answers are "there was
  // nobody to send to" or "it has not happened yet" - and those are different facts.
  let recipients = [];
  try {
    recipients = await resolveResidentRecipients(workOrder);
  } catch (e) {
    // A lookup failure is not the same as an empty result, and must not be reported as
    // "no resident linked" - that would be a claim about the data made from a broken query.
    console.error('resident lookup failed for update status:', e.message);
    return {
      status: 'pending',
      reason: 'Resident details could not be read, so delivery cannot be confirmed.',
      messages,
    };
  }

  if (!recipients.length) {
    return {
      status: 'unreachable',
      reason: workOrder.resident_report_ids?.length
        ? 'The linked report has no contactable resident on file, so no update could be addressed.'
        : 'No resident report is linked to this work order, so there is nobody to update.',
      messages,
    };
  }

  return {
    status: 'pending',
    reason: `Due to ${recipients.length} resident${recipients.length === 1 ? '' : 's'} - not sent yet.`,
    recipients: recipients.map(r => r.email),
    messages,
  };
}

module.exports = { residentUpdateStatus, OUTCOMES };
