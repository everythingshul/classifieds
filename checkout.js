const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

// Surfaced on the admin dashboard on login so reported posts don't get missed.
router.get('/', (req, res) => {
  const reports = db
    .prepare(
      `SELECT r.*, p.title AS post_title, p.public_id AS post_public_id, p.type AS post_type, p.status AS post_status
       FROM reports r JOIN posts p ON p.id = r.post_id
       ORDER BY r.created_at DESC LIMIT 100`
    )
    .all();
  res.json({ reports });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
