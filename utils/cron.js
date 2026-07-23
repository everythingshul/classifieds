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

// Checkouts that were started but never completed are noise, not real posts -
// they're already hidden from admin views, and get deleted outright once old
// enough that the poster clearly isn't coming back to finish paying.
function deleteAbandonedCheckouts() {
  const cutoff = Date.now() - 48 * HOUR_MS;
  const info = db.prepare("DELETE FROM posts WHERE status = 'pending_payment' AND created_at < ?").run(cutoff);
  if (info.changes > 0) console.log(`[cron] deleted ${info.changes} abandoned checkout(s)`);
}

function start() {
  expireStalePosts();
  deleteAbandonedCheckouts();
  cron.schedule('*/15 * * * *', expireStalePosts);
  cron.schedule('0 * * * *', deleteAbandonedCheckouts);
}

module.exports = { start, expireStalePosts, deleteAbandonedCheckouts };
