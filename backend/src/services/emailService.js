// angelyn
// email dispatch via resend
// falls back to console.log if no api key, same idea as claudeService
// so the app keeps working for teammates without a resend account

const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function hasResend() {
  return resend !== null;
}

async function sendEmail({ to, subject, body }) {
  // no key - log to console like the old stub and pretend it worked
  if (!resend) {
    console.log('\n========== EMAIL (stub - no resend key) ==========');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('---');
    console.log(body);
    console.log('==================================================\n');
    return { ok: true, stubbed: true };
  }

  // resend wants html. our summary is plain text with newlines so wrap it
  const html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px;">
    ${body.replace(/\n/g, '<br>')}
  </div>`;

  const result = await resend.emails.send({
    // onboarding@resend.dev is resend's test sender - works without verifying a domain
    // but it can ONLY send to your own resend signup email (see README)
    from: process.env.EMAIL_FROM || 'Estate CC <onboarding@resend.dev>',
    to,
    subject,
    html,
    text: body  // plain text fallback for clients that block html
  });

  // resend returns { data, error } rather than throwing
  if (result.error) {
    throw new Error(result.error.message || 'resend send failed');
  }

  return { ok: true, id: result.data?.id };
}

module.exports = { sendEmail, hasResend };
