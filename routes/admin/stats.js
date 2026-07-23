const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => {
  const byStatus = db.prepare('SELECT status, COUNT(*) AS c FROM posts GROUP BY status').all();
  const byType = db.prepare("SELECT type, COUNT(*) AS c FROM posts WHERE status = 'live' GROUP BY type").all();
  const pendingApproval = db.prepare("SELECT COUNT(*) AS c FROM posts WHERE status = 'pending_approval'").get().c;
  const revenue = db.prepare("SELECT SUM(amount_cents) AS total FROM post_payments WHERE status = 'paid'").get().total || 0;
  const totalViews = db.prepare('SELECT SUM(view_count) AS v FROM posts').get().v || 0;
  const topViewed = db.prepare('SELECT id, public_id, title, type, category, view_count FROM posts ORDER BY view_count DESC LIMIT 10').all();
  res.json({ byStatus, byType, pendingApproval, revenueCents: revenue, totalViews, topViewed });
});

module.exports = router;
