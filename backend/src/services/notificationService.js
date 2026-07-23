// angelyn
// Central dispatch layer for the notification log. Every outbound message is
// recorded here (so the log is a complete audit trail), can be re-sent through
// the same nodemailer transport if it failed, and is mirrored to an optional
// outbound webhook (Power Automate / Dynamics 365 / SharePoint) for the client's
// Microsoft stack.
const { NotificationLog } = require('../models');
const { sendEmail } = require('./emailService');

// Where a critical alert escalates if its intended recipient can't be reached.
const FALLBACK_EMAIL = process.env.ALERT_FALLBACK_EMAIL || null;
const WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL || null;

// Fire-and-forget mirror of a dispatch to the client's automation stack. Non-fatal
// and skipped entirely when no URL is configured, so it never blocks a send.
function notifyWebhook(payload) {
  if (!WEBHOOK_URL || typeof fetch !== 'function') return;
  Promise.resolve()
    .then(() => fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
    .catch(e => console.error('notify webhook failed (non-fatal):', e.message));
}

// Record one dispatch attempt. message_preview stays populated for backward
// compatibility (older UI reads it); subject/body are kept so the row is re-sendable.
async function recordDispatch({
  rule_id = null, channel = 'email', recipient, subject = null, body = null,
  status = 'sent', error_reason = null, severity = null,
  source_type = null, source_id = null, retry_of = null,
}) {
  const preview = (status === 'failed' ? (error_reason || '') : (body || '')).slice(0, 200);
  const row = await NotificationLog.create({
    rule_id, channel, recipient, status, message_preview: preview,
    subject, body, error_reason, severity,
    source_type, source_id: source_id == null ? null : String(source_id), retry_of,
  });
  notifyWebhook({
    id: row.id, at: row.createdAt, channel, recipient, subject, status,
    severity, source_type, source_id: row.source_id, error_reason,
  });
  return row;
}

// Send an email via nodemailer AND record the outcome in one call.
async function sendAndRecord(meta) {
  let status = 'sent';
  let error_reason = null;
  try {
    await sendEmail({ to: meta.recipient, subject: meta.subject, body: meta.body });
  } catch (e) {
    status = 'failed';
    error_reason = e.message;
  }
  return recordDispatch({ ...meta, status, error_reason });
}

// Re-attempt a previously logged dispatch. Keeps the original row intact (audit),
// writes the retry as its own row, and marks the original resolved on success. If
// a critical/urgent alert still fails, it escalates to the fallback recipient so
// an urgent notice is never silently lost.
async function resend(logId, actor = {}) {
  const orig = await NotificationLog.findByPk(logId);
  if (!orig) return { error: 'not found', code: 404 };
  if (!orig.recipient) return { error: 'no recipient on record to resend to', code: 400 };

  const subject = orig.subject || 'Estate notification (resent)';
  const body = orig.body || orig.message_preview || 'Original message content was not stored.';
  const common = {
    rule_id: orig.rule_id, channel: orig.channel || 'email', severity: orig.severity,
    source_type: orig.source_type, source_id: orig.source_id, retry_of: orig.id, subject, body,
  };

  const attempt = await sendAndRecord({ ...common, recipient: orig.recipient });

  let fallback = null;
  let resolved = false;
  if (attempt.status === 'sent') {
    await resolveGroup(orig);
    resolved = true;
  } else if (['urgent', 'critical', 'high'].includes(orig.severity) && FALLBACK_EMAIL && FALLBACK_EMAIL !== orig.recipient) {
    // still failing on a serious alert - escalate so it isn't missed
    fallback = await sendAndRecord({
      ...common, recipient: FALLBACK_EMAIL, subject: `[Escalated] ${subject}`,
    });
    if (fallback.status === 'sent') { await resolveGroup(orig); resolved = true; }
  }

  return {
    code: 200,
    resent_id: attempt.id,
    delivered: attempt.status === 'sent',
    resolved,
    escalated: Boolean(fallback),
    fallback_delivered: fallback ? fallback.status === 'sent' : null,
    fallback_configured: Boolean(FALLBACK_EMAIL),
  };
}

// A failure "incident" is usually a burst of retries for one event, so a
// successful resend clears the whole matching run of unresolved failures, not
// just the single row - otherwise the banner keeps sounding for a fixed problem.
async function resolveGroup(orig) {
  const where = {
    status: 'failed', resolved_at: null,
    recipient: orig.recipient, channel: orig.channel,
  };
  if (orig.rule_id != null) where.rule_id = orig.rule_id;
  if (orig.source_type) where.source_type = orig.source_type;
  await NotificationLog.update({ resolved_at: new Date() }, { where });
}

// Bulk resend: re-attempt every unresolved failure, one send per outage group
// (resolveGroup clears the rest), so the banner's "Resend all" is one click.
async function resendAllFailed() {
  const failures = await NotificationLog.findAll({
    where: { status: 'failed', resolved_at: null },
    order: [['createdAt', 'DESC']],
  });
  const seen = new Set();
  let groups = 0;
  let delivered = 0;
  let escalated = 0;
  for (const f of failures) {
    const key = `${f.recipient}|${f.channel}|${f.rule_id}|${f.source_type}`;
    if (seen.has(key)) continue; // resolveGroup already handled this run
    seen.add(key);
    groups += 1;
    const res = await resend(f.id);
    if (res.delivered) delivered += 1;
    if (res.escalated) escalated += 1;
  }
  return { groups, delivered, escalated };
}

// Reliability snapshot for the log's KPI strip.
async function buildStats() {
  const logs = await NotificationLog.findAll({
    attributes: ['status', 'channel', 'resolved_at', 'acknowledged_at'],
  });
  const total = logs.length;
  const sent = logs.filter(l => l.status === 'sent').length;
  const failed = logs.filter(l => l.status === 'failed').length;
  const unresolvedFailed = logs.filter(l => l.status === 'failed' && !l.resolved_at).length;
  const acknowledged = logs.filter(l => l.acknowledged_at).length;
  const failuresByChannel = {};
  logs.filter(l => l.status === 'failed').forEach(l => {
    const c = l.channel || 'unknown';
    failuresByChannel[c] = (failuresByChannel[c] || 0) + 1;
  });
  return {
    total, sent, failed, unresolvedFailed, acknowledged,
    deliveryRate: total ? sent / total : null,
    acknowledgedRate: sent ? acknowledged / sent : null,
    failuresByChannel,
    fallbackConfigured: Boolean(FALLBACK_EMAIL),
    webhookConfigured: Boolean(WEBHOOK_URL),
  };
}

module.exports = { recordDispatch, sendAndRecord, resend, resendAllFailed, buildStats, notifyWebhook };
