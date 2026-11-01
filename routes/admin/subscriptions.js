const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { availableTopics, sendConfirmationEmail } = require('../../services/emailDigest');

const router = express.Router();
router.use(requireAdmin);

function topicLabelMap() {
  const map = new Map();
  availableTopics().forEach((t) => map.set(t.value, t.label));
  return map;
}

function formatSubscription(row, labelMap) {
  let categories = [];
  try {
    categories = JSON.parse(row.categories || '[]');
  } catch (e) {
    categories = [];
  }
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    sendHour: row.send_hour,
    categories,
    categoryLabels: categories.map((c) => labelMap.get(c) || c),
    confirmedAt: row.confirmed_at,
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at,
  };
}

router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));

  const where = [];
  const params = [];
  if (req.query.status) {
    where.push('status = ?');
    params.push(req.query.status);
  }
  if (req.query.q) {
    where.push('email LIKE ?');
    params.push(`%${req.query.q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM email_subscriptions ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * FROM email_subscriptions ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);

  const counts = db.prepare('SELECT status, COUNT(*) AS c FROM email_subscriptions GROUP BY status').all();

  const labelMap = topicLabelMap();
  res.json({
    subscriptions: rows.map((r) => formatSubscription(r, labelMap)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.c])),
  });
});

router.post('/:id/unsubscribe', (req, res) => {
  const row = db.prepare('SELECT * FROM email_subscriptions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE email_subscriptions SET status = 'unsubscribed', updated_at = ? WHERE id = ?").run(Date.now(), row.id);
  res.json(formatSubscription(db.prepare('SELECT * FROM email_subscriptions WHERE id = ?').get(row.id), topicLabelMap()));
});

// Re-sends the double opt-in email - useful when a signup's confirmation
// email bounced/got lost and the subscriber asks for another, without
// making them fill out the form again.
router.post('/:id/resend-confirmation', async (req, res) => {
  const row = db.prepare('SELECT * FROM email_subscriptions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'This subscription is not pending confirmation' });
  try {
    await sendConfirmationEmail(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM email_subscriptions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
