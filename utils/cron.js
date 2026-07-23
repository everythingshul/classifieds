const cron = require('node-cron');
const db = require('../db');

function expireStalePosts() {
  const now = Date.now();
  const info = db
    .prepare("UPDATE posts SET status = 'expired', updated_at = ? WHERE status = 'live' AND expires_at IS NOT NULL AND expires_at < ?")
    .run(now, now);
  if (info.changes > 0) console.log(`[cron] expired ${info.changes} post(s)`);
}

function start() {
  expireStalePosts();
  cron.schedule('*/15 * * * *', expireStalePosts);
}

module.exports = { start, expireStalePosts };
