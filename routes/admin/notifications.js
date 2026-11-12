const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => {
  const reports = db.prepare('SELECT COUNT(*) AS c FROM reports').get().c;
  const contactMessages = db.prepare('SELECT COUNT(*) AS c FROM contact_messages WHERE archived = 0').get().c;
  const pendingApproval = db.prepare("SELECT COUNT(*) AS c FROM posts WHERE status = 'pending_approval'").get().c;
  // Matches the Moderation Queue's own filter (needsUrlApproval) - must
  // exclude pending_payment (abandoned/never-finished checkouts, which fill
  // in the website field before paying) and rejected posts, or the badge
  // shows a count that never appears in the actual queue.
  const pendingUrlApproval = db.prepare("SELECT COUNT(*) AS c FROM posts WHERE contact_url IS NOT NULL AND contact_url != '' AND contact_url_approved = 0 AND status IN ('live', 'pending_approval')").get().c;
  const pendingEditorials = db.prepare("SELECT COUNT(*) AS c FROM editorials WHERE status = 'pending_approval'").get().c;
  const pendingEditorialComments = db.prepare("SELECT COUNT(*) AS c FROM editorial_comments WHERE status = 'pending_approval'").get().c;
  const unreadChats = db.prepare("SELECT COUNT(*) AS c FROM chat_conversations WHERE unread = 1 AND status = 'open'").get().c;
  const locationQueue = db.prepare("SELECT COUNT(*) AS c FROM location_queue WHERE status = 'open'").get().c;
  res.json({ locationQueue, reports, contactMessages, pendingApproval, pendingUrlApproval, pendingEditorials, pendingEditorialComments, unreadChats });
});

module.exports = router;
