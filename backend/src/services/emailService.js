// email dispatch via nodemailer (team standardised on this instead of resend)
// falls back to console.log if SMTP isn't configured, so the app keeps
// working for teammates who haven't set up mail credentials

const nodemailer = require('nodemailer');

// build a transporter only if SMTP creds are present in env
// using a standard SMTP setup - works with gmail app passwords, mailtrap, etc.
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    family: 4,   // force IPv4 - Render free tier can't route IPv6 outbound
  });
}

function hasMailer() {
  return transporter !== null;
}

async function sendEmail({ to, subject, body }) {
  // no transporter - log to console and pretend it worked
  if (!transporter) {
    console.log('\n========== EMAIL (stub - no SMTP config) ==========');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('---');
    console.log(body);
    console.log('===================================================\n');
    return { ok: true, stubbed: true };
  }

  // nodemailer wants html - our summary is plain text with newlines so wrap it
  const html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px;">
    ${body.replace(/\n/g, '<br>')}
  </div>`;

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'Estate CC <no-reply@estate.local>',
    to,
    subject,
    text: body, // plain text fallback for clients that block html
    html,
  });

  return { ok: true, id: info.messageId };
}

module.exports = { sendEmail, hasMailer };
