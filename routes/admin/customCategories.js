const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { getAllClassifiedCategories, slugify, uniqueSlug } = require('../../services/categories');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => {
  res.json(getAllClassifiedCategories({ includeInactive: true }));
});

router.post('/', (req, res) => {
  const { label, labelHe, hasImages, hasPrice, free } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Name is required' });
  const key = uniqueSlug(slugify(label));
  const info = db
    .prepare(
      `INSERT INTO custom_categories (key, label, label_he, has_images, has_price, free, sort_order, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(key, label.trim(), labelHe || null, hasImages ? 1 : 0, hasPrice ? 1 : 0, free ? 1 : 0, 100, Date.now());
  res.status(201).json(db.prepare('SELECT * FROM custom_categories WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM custom_categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { label, labelHe, hasImages, hasPrice, free, active } = req.body;
  db.prepare(
    'UPDATE custom_categories SET label = ?, label_he = ?, has_images = ?, has_price = ?, free = ?, active = ? WHERE id = ?'
  ).run(
    label !== undefined ? label : row.label,
    labelHe !== undefined ? labelHe : row.label_he,
    hasImages !== undefined ? (hasImages ? 1 : 0) : row.has_images,
    hasPrice !== undefined ? (hasPrice ? 1 : 0) : row.has_price,
    free !== undefined ? (free ? 1 : 0) : row.free,
    active !== undefined ? (active ? 1 : 0) : row.active,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM custom_categories WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM custom_categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const inUse = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE category = ?').get(row.key).c;
  if (inUse > 0) {
    db.prepare('UPDATE custom_categories SET active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ deactivated: true, reason: 'In use by existing posts; deactivated instead of deleted.' });
  }
  db.prepare('DELETE FROM custom_categories WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
