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

async function sendViaBrevo({ apiKey, from, to, subject, html, text, attachments, replyTo, headers }) {
  const body = {
    sender: parseFromAddress(from),
    to: toRecipientList(to),
    subject,
    htmlContent: html || undefined,
    textContent: text || undefined,
    replyTo: replyTo ? parseFromAddress(replyTo) : undefined,
    headers: headers && Object.keys(headers).length ? headers : undefined,
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

// Builds the "From" header's display name independently of the From email
// address, so the sender name doesn't have to be hand-typed into a
// "Name <email>" string - set via mail_from_name/MAIL_FROM_NAME (e.g. in
// render.yaml), falling back to a name already embedded in mail_from, then
// to the configured site name, so existing setups keep working unchanged.
function buildFrom() {
  const raw = runtimeConfig.get('mail_from', 'MAIL_FROM') || 'no-reply@example.com';
  const { name: embeddedName, email } = parseFromAddress(raw);
  const { siteName } = require('../services/emailLayout');
  const name = runtimeConfig.get('mail_from_name', 'MAIL_FROM_NAME') || embeddedName || siteName();
  return name ? `"${String(name).replace(/"/g, '')}" <${email}>` : email;
}

async function sendMail({ to, subject, html, text, attachments, replyTo, headers }) {
  const from = buildFrom();
  const provider = runtimeConfig.get('mail_provider', 'MAIL_PROVIDER') || 'smtp';
  // Falls back to the configured Reply-To address so every outgoing email
  // (invoices, notifications, etc.) uses it automatically without every
  // call site having to pass it explicitly - callers can still override.
  if (!replyTo) replyTo = runtimeConfig.get('mail_reply_to', 'MAIL_REPLY_TO') || undefined;

  if (provider === 'brevo') {
    const apiKey = runtimeConfig.get('brevo_api_key', 'BREVO_API_KEY');
    if (!apiKey) {
      console.log('[mailer] Brevo selected but no API key set, would have sent:', { to, subject });
      return { messageId: 'dry-run' };
    }
    return sendViaBrevo({ apiKey, from, to, subject, html, text, attachments, replyTo, headers });
  }

  return getTransporter().sendMail({ from, to, subject, html, text, attachments, replyTo, headers });
}

async function notifyAdmin(subject, bodyHtml, opts = {}) {
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
  const { emailShell, siteName } = require('../services/emailLayout');
  return sendMail({
    to,
    subject: `[${siteName()}] ${subject}`,
    html: emailShell({ eyebrow: 'Admin Alert', heading: subject, bodyHtml, ctaText: opts.ctaText, ctaUrl: opts.ctaUrl }),
  });
}

module.exports = { sendMail, notifyAdmin };
