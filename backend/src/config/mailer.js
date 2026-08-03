const nodemailer = require('nodemailer');

let transporter = null;
let usingEthereal = false;

// Lazily create (and cache) a transporter.
// Uses real SMTP when SMTP_HOST/SMTP_USER/SMTP_PASS are all set (same env vars
// as services/emailService.js), otherwise falls back to an Ethereal test
// account, which does not deliver real mail - it gives a preview URL per message.
async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    usingEthereal = false;
    console.log('Mailer: using SMTP host', process.env.SMTP_HOST);
    return transporter;
  }

  const account = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  });
  usingEthereal = true;
  console.log('Mailer: no SMTP config - using Ethereal test account');
  return transporter;
}

// Send an email. Failures are logged but never thrown - email is a side effect,
// not critical to the request that triggered it.
async function sendMail({ to, subject, text, html }) {
  try {
    const tx = await getTransporter();
    const info = await tx.sendMail({
      from: process.env.EMAIL_FROM || '"4E Biodiversity Tracker" <no-reply@4e.local>',
      to,
      subject,
      text,
      html,
    });
    console.log('Email sent:', info.messageId);
    // Only Ethereal messages have a preview URL.
    if (usingEthereal) {
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    }
  } catch (err) {
    console.error('Failed to send email:', err.message);
  }
}

module.exports = { getTransporter, sendMail };
