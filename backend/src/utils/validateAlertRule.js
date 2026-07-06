// angelyn
// validation logic for alert rule input, pulled out of the route handler
// so it can be unit tested without spinning up express + a db connection
// alertRules.js imports and uses this directly

const VALID_TRIGGER_TYPES = ['flora_critical', 'fauna_hotspot', 'new_case_urgent', 'weekly_summary'];
const VALID_CHANNELS = ['email', 'sms', 'both'];

// returns { valid: true } or { valid: false, error: "..." }
function validateRuleInput(body) {
  const { name, trigger_type, recipients, channel } = body;

  if (!name || !name.trim()) {
    return { valid: false, error: 'name, trigger_type and recipients are required' };
  }

  if (!trigger_type) {
    return { valid: false, error: 'name, trigger_type and recipients are required' };
  }

  if (!recipients || !recipients.trim()) {
    return { valid: false, error: 'name, trigger_type and recipients are required' };
  }

  if (!VALID_TRIGGER_TYPES.includes(trigger_type)) {
    return { valid: false, error: `trigger_type must be one of: ${VALID_TRIGGER_TYPES.join(', ')}` };
  }

  if (channel && !VALID_CHANNELS.includes(channel)) {
    return { valid: false, error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` };
  }

  // basic sanity check on recipients - at least one thing that looks like an email
  const emails = recipients.split(',').map(r => r.trim()).filter(Boolean);
  if (emails.length === 0) {
    return { valid: false, error: 'recipients must contain at least one email address' };
  }
  const looksLikeEmail = /\S+@\S+\.\S+/;
  const invalidEmails = emails.filter(e => !looksLikeEmail.test(e));
  if (invalidEmails.length > 0) {
    return { valid: false, error: `these recipients don't look like valid emails: ${invalidEmails.join(', ')}` };
  }

  return { valid: true };
}

module.exports = { validateRuleInput, VALID_TRIGGER_TYPES, VALID_CHANNELS };
