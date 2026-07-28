const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { orderTaxonomyTree } = require('../../services/taxonomySort');

const router = express.Router();
router.use(requireAdmin);

const GROUPS = new Set(['job', 'real_estate', 'simcha', 'job_type', 'pay_period']);
// Every classifieds/listing category (built-in or admin-added) gets its own
// derived taxonomy group ("cat:<key>" / "lst:<key>") so sub-categories can be
// managed for any of them, not just the handful with a fixed group above.
const DERIVED_GROUP_RE = /^(cat|lst):[a-z0-9-]+$/;
function isValidGroup(grp) {
  return GROUPS.has(grp) || DERIVED_GROUP_RE.test(grp || '');
}

router.get('/', (req, res) => {
  const grp = req.query.grp;
  const rows = grp
    ? db.prepare('SELECT * FROM taxonomies WHERE grp = ? ORDER BY parent_id, sort_order').all(grp)
    : db.prepare('SELECT * FROM taxonomies ORDER BY grp, parent_id, sort_order').all();
  res.json(orderTaxonomyTree(rows));
});

router.post('/', (req, res) => {
  const { grp, parentId, name, nameHe, sortOrder } = req.body;
  if (!isValidGroup(grp)) return res.status(400).json({ error: 'Invalid group' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const info = db
    .prepare('INSERT INTO taxonomies (grp, parent_id, name, name_he, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)')
    .run(grp, parentId || null, name.trim(), nameHe || null, sortOrder || 0);
  res.status(201).json(db.prepare('SELECT * FROM taxonomies WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM taxonomies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { name, nameHe, sortOrder, active, parentId } = req.body;
  db.prepare('UPDATE taxonomies SET name = ?, name_he = ?, sort_order = ?, active = ?, parent_id = ? WHERE id = ?').run(
    name !== undefined ? name : row.name,
    nameHe !== undefined ? nameHe : row.name_he,
    sortOrder !== undefined ? sortOrder : row.sort_order,
    active !== undefined ? (active ? 1 : 0) : row.active,
    parentId !== undefined ? parentId : row.parent_id,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM taxonomies WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE taxonomy_id = ?').get(req.params.id).c;
  if (inUse > 0) {
    db.prepare('UPDATE taxonomies SET active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ deactivated: true, reason: 'In use by existing posts; deactivated instead of deleted.' });
  }
  db.prepare('DELETE FROM taxonomies WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
