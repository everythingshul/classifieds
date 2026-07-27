const nodemailer = require('nodemailer');
const runtimeConfig = require('../services/runtimeConfig');

// Parses "Name <email@x.com>" or a bare "email@x.com" into { name, email }.
function parseFromAddress(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(.*)<(.+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '') || undefined, email: m[2].trim() };
  return { email: s };
}

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

function toRecipientList(to) {
  return String(to)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

async function sendViaBrevo({ apiKey, from, to, subject, html, text, attachments, replyTo }) {
  const body = {
    sender: parseFromAddress(from),
    to: toRecipientList(to),
    subject,
    htmlContent: html || undefined,
    textContent: text || undefined,
    replyTo: replyTo ? parseFromAddress(replyTo) : undefined,
  };
  if (attachments && attachments.length) {
    body.attachment = attachments.map((a) => ({
      name: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(a.content).toString('base64'),
    }));
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${errText}`);
  }
  return res.json();
}

async function sendMail({ to, subject, html, text, attachments, replyTo }) {
  const from = runtimeConfig.get('mail_from', 'MAIL_FROM') || 'no-reply@example.com';
  const provider = runtimeConfig.get('mail_provider', 'MAIL_PROVIDER') || 'smtp';

  if (provider === 'brevo') {
    const apiKey = runtimeConfig.get('brevo_api_key', 'BREVO_API_KEY');
    if (!apiKey) {
      console.log('[mailer] Brevo selected but no API key set, would have sent:', { to, subject });
      return { messageId: 'dry-run' };
    }
    return sendViaBrevo({ apiKey, from, to, subject, html, text, attachments, replyTo });
  }

  return getTransporter().sendMail({ from, to, subject, html, text, attachments, replyTo });
}

async function notifyAdmin(subject, html) {
  // Falls back to the first admin account's login email if no separate
  // notification address is configured, so report/moderation alerts still
  // reach someone by default instead of silently going nowhere.
  let to = runtimeConfig.get('admin_notify_email', 'ADMIN_NOTIFY_EMAIL');
  if (!to) {
    const db = require('../db');
    const admin = db.prepare('SELECT email FROM admin_users ORDER BY id LIMIT 1').get();
    to = admin?.email;
  }
  if (!to) {
    console.warn('[mailer] notifyAdmin: no admin_notify_email set and no admin account found - alert not sent:', subject);
    return null;
  }
  return sendMail({ to, subject: `[JListings] ${subject}`, html });
}

module.exports = { sendMail, notifyAdmin };
