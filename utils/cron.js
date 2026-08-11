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

function start() {
  expireStalePosts();
  deleteAbandonedCheckouts();
  publishScheduledPosts();
  publishScheduledEditorials();
  cron.schedule('*/15 * * * *', expireStalePosts);
  cron.schedule('0 * * * *', deleteAbandonedCheckouts);
  cron.schedule('*/5 * * * *', publishScheduledPosts);
  cron.schedule('*/5 * * * *', publishScheduledEditorials);
}

module.exports = { start, expireStalePosts, deleteAbandonedCheckouts, publishScheduledPosts, publishScheduledEditorials };
