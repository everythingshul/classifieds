const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { formatPostAdmin } = require('../../services/postFormat');

const router = express.Router();
router.use(requireAdmin);

// Searches by post title/description OR customer identity (email, phone, name).
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ customers: [] });
  const like = `%${q}%`;
  const posts = db
    .prepare(
      `SELECT * FROM posts WHERE
        poster_email LIKE ? OR poster_phone LIKE ? OR poster_first_name LIKE ? OR poster_last_name LIKE ?
        OR title LIKE ? OR public_id LIKE ?
       ORDER BY created_at DESC LIMIT 500`
    )
    .all(like, like, like, like, like, like);

  const byEmail = new Map();
  posts.forEach((p) => {
    const key = p.poster_email;
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email: p.poster_email,
        firstName: p.poster_first_name,
        lastName: p.poster_last_name,
        phone: p.poster_phone,
        posts: [],
        totalPaidCents: 0,
      });
    }
    byEmail.get(key).posts.push(formatPostAdmin(p));
  });

  const emails = [...byEmail.keys()];
  if (emails.length) {
    const placeholders = emails.map(() => '?').join(',');
    const payments = db
      .prepare(`SELECT payer_email, SUM(amount_cents) AS total FROM post_payments WHERE status = 'paid' AND payer_email IN (${placeholders}) GROUP BY payer_email`)
      .all(...emails);
    payments.forEach((row) => {
      if (byEmail.has(row.payer_email)) byEmail.get(row.payer_email).totalPaidCents = row.total;
    });
  }

  res.json({ customers: [...byEmail.values()] });
});

router.get('/customer/:email', (req, res) => {
  const email = String(req.params.email).toLowerCase();
  const posts = db.prepare('SELECT * FROM posts WHERE poster_email = ? ORDER BY created_at DESC').all(email);
  const payments = db.prepare('SELECT * FROM post_payments WHERE payer_email = ? ORDER BY created_at DESC').all(email);
  res.json({ email, posts: posts.map((p) => formatPostAdmin(p)), payments });
});

module.exports = router;
