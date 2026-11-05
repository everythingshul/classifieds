const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => {
  const byStatus = db.prepare("SELECT status, COUNT(*) AS c FROM posts WHERE status != 'pending_payment' GROUP BY status").all();
  const byType = db.prepare("SELECT type, COUNT(*) AS c FROM posts WHERE status = 'live' GROUP BY type").all();
  const pendingApproval = db.prepare("SELECT COUNT(*) AS c FROM posts WHERE status = 'pending_approval'").get().c;
  // Net of refunds, so this reflects money actually kept rather than gross
  // amount ever charged. Kept separate per currency (rather than summed
  // together) since a blended USD+GBP total would misrepresent both.
  const grossRevenue = db.prepare("SELECT SUM(amount_cents) AS total FROM post_payments WHERE status = 'paid' AND currency = 'usd'").get().total || 0;
  const totalRefunded = db.prepare("SELECT SUM(refunded_cents) AS total FROM post_payments WHERE status = 'paid' AND currency = 'usd'").get().total || 0;
  const revenue = grossRevenue - totalRefunded;
  const grossRevenueGbp = db.prepare("SELECT SUM(amount_cents) AS total FROM post_payments WHERE status = 'paid' AND currency = 'gbp'").get().total || 0;
  const totalRefundedGbp = db.prepare("SELECT SUM(refunded_cents) AS total FROM post_payments WHERE status = 'paid' AND currency = 'gbp'").get().total || 0;
  const revenueGbp = grossRevenueGbp - totalRefundedGbp;
  const totalViews = db.prepare('SELECT SUM(view_count) AS v FROM posts').get().v || 0;
  const totalClicks = db.prepare('SELECT SUM(click_count) AS c FROM posts').get().c || 0;
  const topViewed = db.prepare('SELECT id, public_id, title, type, category, view_count, click_count FROM posts ORDER BY view_count DESC LIMIT 10').all();
  const confirmedSubscribers = db.prepare("SELECT COUNT(*) AS c FROM email_subscriptions WHERE status = 'confirmed'").get().c;
  res.json({
    byStatus, byType, pendingApproval,
    revenueCents: revenue, grossRevenueCents: grossRevenue, refundedCents: totalRefunded,
    revenueCentsGbp: revenueGbp, grossRevenueCentsGbp: grossRevenueGbp, refundedCentsGbp: totalRefundedGbp,
    totalViews, totalClicks, topViewed, confirmedSubscribers,
  });
});

module.exports = router;
