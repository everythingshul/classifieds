const cron = require('node-cron');
const db = require('../db');

const HOUR_MS = 60 * 60 * 1000;

function expireStalePosts() {
  const now = Date.now();
  const info = db
    .prepare("UPDATE posts SET status = 'expired', updated_at = ? WHERE status = 'live' AND expires_at IS NOT NULL AND expires_at < ?")
    .run(now, now);
  if (info.changes > 0) console.log(`[cron] expired ${info.changes} post(s)`);
}

// Admin-scheduled posts (any post type, created directly from the backend)
// go live on their own once their scheduled_at time arrives - expires_at was
// already computed off scheduledAt at creation time, so nothing else needs updating.
function publishScheduledPosts() {
  const now = Date.now();
  const info = db
    .prepare("UPDATE posts SET status = 'live', published_at = ?, boosted_at = ?, updated_at = ? WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?")
    .run(now, now, now, now);
  if (info.changes > 0) console.log(`[cron] published ${info.changes} scheduled post(s)`);
}

// Checkouts that were started but never completed are noise, not real posts -
// they're already hidden from admin views, and get deleted outright once old
// enough that the poster clearly isn't coming back to finish paying.
function deleteAbandonedCheckouts() {
  const cutoff = Date.now() - 48 * HOUR_MS;
  const info = db.prepare("DELETE FROM posts WHERE status = 'pending_payment' AND created_at < ?").run(cutoff);
  if (info.changes > 0) console.log(`[cron] deleted ${info.changes} abandoned checkout(s)`);
}

// Same scheduling mechanism as posts (see publishScheduledPosts above),
// applied to admin-scheduled editorials. Sends the "you're live" email here
// (rather than at approve/create time) since that's the moment it's actually
// true - requiring editorial.js only when there's actually a row to notify
// about, to avoid a require cycle at module load.
function publishScheduledEditorials() {
  const now = Date.now();
  const rows = db.prepare("SELECT * FROM editorials WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?").all(now);
  if (!rows.length) return;
  const stmt = db.prepare("UPDATE editorials SET status = 'live', published_at = ?, updated_at = ? WHERE id = ?");
  const { notifyPosterApproved } = require('../services/editorial');
  rows.forEach((row) => {
    stmt.run(now, now, row.id);
    notifyPosterApproved({ ...row, status: 'live', published_at: now }).catch(() => {});
  });
  console.log(`[cron] published ${rows.length} scheduled editorial(s)`);
}

// Sends each confirmed subscriber their daily digest once the current hour
// (in the site's own configured timezone, not the server process's) matches
// the hour they chose. The >=20h-since-last-send guard is what makes this
// safe to call more than once within the same hour (an early-morning
// restart/deploy re-running start()'s immediate call, a cron overlap,
// etc.) without risking a duplicate send.
function sendDueDigests() {
  const { currentHourInSiteTz, collectDigestSections, digestEmailHtml, digestEmailText, unsubscribeUrl, siteName } = require('../services/emailDigest');
  const { sendMail } = require('./mailer');
  const { newPublicId } = require('./ids');
  const hour = currentHourInSiteTz();
  const cutoff = Date.now() - 20 * HOUR_MS;
  const subs = db
    .prepare("SELECT * FROM email_subscriptions WHERE status = 'confirmed' AND send_hour = ? AND (last_sent_at IS NULL OR last_sent_at < ?)")
    .all(hour, cutoff);
  if (!subs.length) return;
  console.log(`[cron] processing ${subs.length} digest(s) due this hour`);
  subs.forEach((sub) => {
    let sections;
    try {
      sections = collectDigestSections(sub);
    } catch (e) {
      console.error('[cron] Error building digest for', sub.email, '-', e.message);
      return;
    }
    if (!sections.length) {
      // Nothing new since last time - still bump last_sent_at so tomorrow's
      // window starts fresh, but skip sending an empty "nothing happened"
      // email: pure noise, and needless sends hurt engagement/complaint
      // rate (and therefore deliverability) for no reader benefit.
      db.prepare('UPDATE email_subscriptions SET last_sent_at = ? WHERE id = ?').run(Date.now(), sub.id);
      return;
    }
    const itemCount = sections.reduce((n, s) => n + s.items.length, 0);
    // Generated before sending (not after) because the open-tracking pixel
    // and click-tracking links need to be embedded in the email content
    // itself - the email_sends row is only written once the send actually
    // succeeds, so a failed send never leaves a row claiming to be sent.
    const sendToken = newPublicId(20);
    sendMail({
      to: sub.email,
      subject: `${siteName()}: ${itemCount} new post${itemCount === 1 ? '' : 's'} today`,
      html: digestEmailHtml(sub, sections, sendToken),
      text: digestEmailText(sub, sections),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl(sub)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })
      .then(() => {
        const now = Date.now();
        db.prepare('UPDATE email_subscriptions SET last_sent_at = ? WHERE id = ?').run(now, sub.id);
        db.prepare('INSERT INTO email_sends (public_id, subscription_id, item_count, sent_at) VALUES (?, ?, ?, ?)')
          .run(sendToken, sub.id, itemCount, now);
      })
      .catch((e) => console.error('[cron] Failed to send digest to', sub.email, '-', e.message));
  });
}

function start() {
  expireStalePosts();
  deleteAbandonedCheckouts();
  publishScheduledPosts();
  publishScheduledEditorials();
  sendDueDigests();
  cron.schedule('*/15 * * * *', expireStalePosts);
  cron.schedule('0 * * * *', deleteAbandonedCheckouts);
  cron.schedule('*/5 * * * *', publishScheduledPosts);
  cron.schedule('*/5 * * * *', publishScheduledEditorials);
  cron.schedule('5 * * * *', sendDueDigests);
}

module.exports = { start, expireStalePosts, deleteAbandonedCheckouts, publishScheduledPosts, publishScheduledEditorials, sendDueDigests };
