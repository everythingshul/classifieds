// A once-a-day summary email for the admin: yesterday's new posts,
// traffic (including the per-domain breakdown from the admin Analytics
// page), revenue, new subscribers/messages, and anything waiting on
// moderation - so there's no need to open the dashboard every morning
// just to see whether anything needs attention. Separate from the public
// subscriber digest (services/emailDigest.js) - this one is admin-only
// and has nothing to do with what a subscriber chose to follow.
const db = require('../db');
const runtimeConfig = require('../services/runtimeConfig');
const { emailShell, escapeHtml, siteName } = require('./emailLayout');
const { appUrl } = require('./appUrl');
const { sendMail } = require('../utils/mailer');
const { formatCents } = require('../utils/money');
const { digestTimezone, currentHourInSiteTz } = require('./emailDigest');

const DAY_MS = 24 * 60 * 60 * 1000;
const SEND_HOUR = 7; // site-local time, matches "every morning"

function adminEmail() {
  let to = runtimeConfig.get('admin_notify_email', 'ADMIN_NOTIFY_EMAIL');
  if (!to) {
    const admin = db.prepare('SELECT email FROM admin_users ORDER BY id LIMIT 1').get();
    to = admin?.email;
  }
  return to;
}

function todayInSiteTz() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: digestTimezone() }).format(new Date()); // en-CA -> YYYY-MM-DD
}

const TYPE_LABEL = { classified: 'Classified', listing: 'Listing', simcha: 'Simcha' };

function buildStats(from, to) {
  const newPosts = db.prepare('SELECT type, COUNT(*) AS c FROM posts WHERE created_at BETWEEN ? AND ? GROUP BY type').all(from, to);
  const pageviews = db.prepare("SELECT COUNT(*) AS c FROM analytics_events WHERE type = 'pageview' AND created_at BETWEEN ? AND ?").get(from, to).c;
  const uniqueVisitors = db.prepare('SELECT COUNT(DISTINCT visitor_id) AS c FROM analytics_events WHERE created_at BETWEEN ? AND ?').get(from, to).c;
  // USD only - see routes/admin/analytics.js for why currencies aren't blended.
  const revenueCents = (
    (db.prepare("SELECT SUM(amount_cents) AS t FROM post_payments WHERE status = 'paid' AND currency = 'usd' AND created_at BETWEEN ? AND ?").get(from, to).t || 0) -
    (db.prepare("SELECT SUM(refunded_cents) AS t FROM post_payments WHERE status = 'paid' AND currency = 'usd' AND created_at BETWEEN ? AND ?").get(from, to).t || 0)
  );
  const revenueCentsGbp = (
    (db.prepare("SELECT SUM(amount_cents) AS t FROM post_payments WHERE status = 'paid' AND currency = 'gbp' AND created_at BETWEEN ? AND ?").get(from, to).t || 0) -
    (db.prepare("SELECT SUM(refunded_cents) AS t FROM post_payments WHERE status = 'paid' AND currency = 'gbp' AND created_at BETWEEN ? AND ?").get(from, to).t || 0)
  );
  const newSubscribers = db.prepare('SELECT COUNT(*) AS c FROM email_subscriptions WHERE created_at BETWEEN ? AND ?').get(from, to).c;
  const newContactMessages = db.prepare('SELECT COUNT(*) AS c FROM contact_messages WHERE created_at BETWEEN ? AND ?').get(from, to).c;
  const byDomain = db
    .prepare(
      `SELECT COALESCE(NULLIF(domain, ''), '(unknown)') AS domain, COUNT(*) AS events, COUNT(DISTINCT visitor_id) AS uniqueVisitors
       FROM analytics_events WHERE created_at BETWEEN ? AND ? GROUP BY domain ORDER BY events DESC LIMIT 10`
    )
    .all(from, to);
  const pendingPosts = db.prepare("SELECT COUNT(*) AS c FROM posts WHERE status = 'pending_approval'").get().c;
  const pendingEditorials = db.prepare("SELECT COUNT(*) AS c FROM editorials WHERE status = 'pending_approval'").get().c;
  const pendingComments = db.prepare("SELECT COUNT(*) AS c FROM editorial_comments WHERE status = 'pending_approval'").get().c;
  return { newPosts, pageviews, uniqueVisitors, revenueCents, revenueCentsGbp, newSubscribers, newContactMessages, byDomain, pendingPosts, pendingEditorials, pendingComments };
}

function statRow(label, value) {
  return `<tr><td style="padding:5px 0;font-size:13.5px;color:#62666b">${escapeHtml(label)}</td><td style="padding:5px 0;font-size:13.5px;color:#232323;text-align:right;font-weight:700">${value}</td></tr>`;
}

function digestHtml(stats, periodLabel) {
  const totalNewPosts = stats.newPosts.reduce((n, r) => n + r.c, 0);
  const postsBreakdown = stats.newPosts.length
    ? stats.newPosts.map((r) => `${r.c} ${TYPE_LABEL[r.type] || r.type}`).join(', ')
    : null;
  const pendingTotal = stats.pendingPosts + stats.pendingEditorials + stats.pendingComments;

  const domainRows = stats.byDomain.length
    ? stats.byDomain.map((d) => `
        <tr>
          <td style="padding:6px 10px;font-size:13px;color:#232323;border-bottom:1px solid #e4e1d8">${escapeHtml(d.domain)}</td>
          <td style="padding:6px 10px;font-size:13px;color:#232323;text-align:right;border-bottom:1px solid #e4e1d8">${d.events}</td>
          <td style="padding:6px 10px;font-size:13px;color:#232323;text-align:right;border-bottom:1px solid #e4e1d8">${d.uniqueVisitors}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:8px 10px;font-size:13px;color:#62666b">No traffic recorded.</td></tr>`;

  const bodyHtml = `
    <p style="margin:0 0 18px">${periodLabel}:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      ${statRow('New posts', totalNewPosts ? `${totalNewPosts}${postsBreakdown ? ` (${escapeHtml(postsBreakdown)})` : ''}` : '0')}
      ${statRow('Pageviews', stats.pageviews)}
      ${statRow('Unique visitors', stats.uniqueVisitors)}
      ${statRow('Revenue (USD)', formatCents(stats.revenueCents))}
      ${stats.revenueCentsGbp ? statRow('Revenue (GBP)', formatCents(stats.revenueCentsGbp, 'gbp')) : ''}
      ${statRow('New subscribers', stats.newSubscribers)}
      ${statRow('New contact messages', stats.newContactMessages)}
    </table>
    ${pendingTotal ? `
    <div style="background:#fdecec;border:1px solid #a13d3d;padding:12px 16px;margin-bottom:20px">
      <span style="font-size:13.5px;color:#a13d3d;font-weight:700">${pendingTotal} item${pendingTotal === 1 ? '' : 's'} waiting on you</span>
      <div style="font-size:13px;color:#62666b;margin-top:4px">
        ${[stats.pendingPosts ? `${stats.pendingPosts} post${stats.pendingPosts === 1 ? '' : 's'}` : null, stats.pendingEditorials ? `${stats.pendingEditorials} editorial${stats.pendingEditorials === 1 ? '' : 's'}` : null, stats.pendingComments ? `${stats.pendingComments} comment${stats.pendingComments === 1 ? '' : 's'}` : null].filter(Boolean).join(', ')} pending approval.
      </div>
    </div>` : ''}
    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#b08d3f;margin-bottom:8px;text-transform:uppercase">Traffic by Domain</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e1d8">
      <tr style="background:#1f3b57">
        <td style="padding:7px 10px;font-size:11px;font-weight:700;letter-spacing:.03em;color:#ffffff">DOMAIN</td>
        <td style="padding:7px 10px;font-size:11px;font-weight:700;letter-spacing:.03em;color:#ffffff;text-align:right">EVENTS</td>
        <td style="padding:7px 10px;font-size:11px;font-weight:700;letter-spacing:.03em;color:#ffffff;text-align:right">VISITORS</td>
      </tr>
      ${domainRows}
    </table>`;

  return emailShell({
    eyebrow: 'Daily Digest',
    heading: "Yesterday on your site",
    bodyHtml,
    ctaText: 'Open Analytics Dashboard',
    ctaUrl: `${appUrl()}/admin/#/analytics`,
  });
}

async function sendAdminDigest() {
  const to = adminEmail();
  if (!to) {
    console.warn('[adminDigest] No admin_notify_email set and no admin account found - digest not sent');
    return;
  }
  const to24h = Date.now();
  const from24h = to24h - DAY_MS;
  const stats = buildStats(from24h, to24h);
  await sendMail({
    to,
    subject: `${siteName()}: your daily digest`,
    html: digestHtml(stats, 'In the last 24 hours'),
  });
}

// Called from utils/cron.js's existing hourly tick - fires once, the first
// time this function is called after SEND_HOUR ticks over in the site's own
// timezone each day. The stored date guard (not just "ran this hour") is
// what makes it safe to call on every tick without risking a duplicate send
// if the process restarts mid-hour.
function sendDueAdminDigest() {
  if (currentHourInSiteTz() !== SEND_HOUR) return;
  const today = todayInSiteTz();
  const lastSent = runtimeConfig.get('admin_digest_last_sent_date', 'ADMIN_DIGEST_LAST_SENT_DATE');
  if (lastSent === today) return;
  sendAdminDigest()
    .then(() => {
      db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
        'admin_digest_last_sent_date',
        JSON.stringify(today)
      );
    })
    .catch((e) => console.error('[adminDigest] Failed to send -', e.message));
}

module.exports = { sendAdminDigest, sendDueAdminDigest, buildStats, digestHtml };
