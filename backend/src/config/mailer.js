const nodemailer = require('nodemailer');

let transporter = null;

// Lazily create (and cache) an Ethereal test-account transporter.
// Ethereal does not deliver real mail - it gives a preview URL per message.
async function getTransporter() {
  if (transporter) return transporter;
  const account = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  });
  return transporter;
}

// Send an email. Failures are logged but never thrown - email is a side effect,
// not critical to the request that triggered it.
async function sendMail({ to, subject, text, html }) {
  try {
    const tx = await getTransporter();
    const info = await tx.sendMail({
      from: '"4E Biodiversity Tracker" <no-reply@4e.local>',
      to,
      subject,
      text,
      html,
    });
    console.log('Email sent:', info.messageId);
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
  } catch (err) {
    console.error('Failed to send email:', err.message);
  }
}

module.exports = { getTransporter, sendMail };
