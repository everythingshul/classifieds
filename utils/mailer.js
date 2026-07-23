const nodemailer = require('nodemailer');
const runtimeConfig = require('../services/runtimeConfig');

// Not cached: SMTP settings can be changed live from the admin portal.
function getTransporter() {
  const host = runtimeConfig.get('smtp_host', 'SMTP_HOST');
  if (!host) {
    return {
      sendMail: async (opts) => {
        console.log('[mailer] SMTP not configured, would have sent:', { to: opts.to, subject: opts.subject });
        return { messageId: 'dry-run' };
      },
    };
  }
  const user = runtimeConfig.get('smtp_user', 'SMTP_USER');
  return nodemailer.createTransport({
    host,
    port: Number(runtimeConfig.get('smtp_port', 'SMTP_PORT') || 587),
    secure: !!runtimeConfig.get('smtp_secure', 'SMTP_SECURE'),
    auth: user ? { user, pass: runtimeConfig.get('smtp_pass', 'SMTP_PASS') } : undefined,
  });
}

async function sendMail({ to, subject, html, text, attachments, replyTo }) {
  const from = runtimeConfig.get('mail_from', 'MAIL_FROM') || 'no-reply@example.com';
  return getTransporter().sendMail({ from, to, subject, html, text, attachments, replyTo });
}

async function notifyAdmin(subject, html) {
  const to = runtimeConfig.get('admin_notify_email', 'ADMIN_NOTIFY_EMAIL');
  if (!to) return null;
  return sendMail({ to, subject: `[Classifieds] ${subject}`, html });
}

module.exports = { sendMail, notifyAdmin };
