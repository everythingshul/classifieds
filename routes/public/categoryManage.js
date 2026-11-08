const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { signCategoryToken, checkCategoryPassword, requireCategoryAccess } = require('../../middleware/categoryAuth');
const { getAllListingCategories, getListingCategoryKeys, createListingCategory } = require('../../services/taxonomy');

const router = express.Router();

// No username, just one shared password - rate-limit by IP same as the
// admin login form and the bulk-posting tool's own /auth, since there's no
// per-account lockout possible here.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post('/auth', authLimiter, (req, res) => {
  if (!checkCategoryPassword(req.body.password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.json({ token: signCategoryToken() });
});

// Everything below requires the scoped token (or a real admin session) -
// see middleware/categoryAuth.js. Deliberately narrow, same spirit as the
// bulk-posting tool: this credential can list business listings, change
// their category, and add new listing categories - nothing else. No
// contact info, no poster PII, no other post field, no other admin data.
router.use(requireCategoryAccess);

// All current business listings, minimal fields only.
router.get('/listings', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, public_id, title, category, status, created_at
       FROM posts WHERE type = 'listing'
       ORDER BY created_at DESC
       LIMIT 1000`
    )
    .all();
  const labelByKey = new Map(getAllListingCategories({ includeInactive: true }).map((c) => [c.key, c.label]));
  res.json(
    rows.map((r) => ({
      id: r.id,
      publicId: r.public_id,
      title: r.title,
      category: r.category,
      categoryLabel: labelByKey.get(r.category) || r.category,
      status: r.status,
      createdAt: r.created_at,
    }))
  );
});

router.get('/categories', (req, res) => {
  res.json(getAllListingCategories({ includeInactive: true }));
});

router.post('/categories', (req, res) => {
  try {
    res.status(201).json(createListingCategory(req.body));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Mass re-categorize: { postIds: [1,2,...], category: 'key' }. One id is
// just the N=1 case of the same thing, so there's no separate single-edit
// endpoint. category must be a real, currently-known listing category key,
// and the WHERE clause is scoped to type = 'listing' - this credential
// can't touch classifieds/simchas or change any field but category.
router.put('/listings/category', (req, res) => {
  const { postIds, category } = req.body;
  if (!Array.isArray(postIds) || !postIds.length || postIds.some((id) => !Number.isInteger(id))) {
    return res.status(400).json({ error: 'postIds must be a non-empty array of post ids' });
  }
  if (!category || !getListingCategoryKeys().includes(category)) {
    return res.status(400).json({ error: 'Unknown listing category' });
  }
  const stmt = db.prepare("UPDATE posts SET category = ?, updated_at = ? WHERE id = ? AND type = 'listing'");
  const now = Date.now();
  const results = postIds.map((id) => ({ id, ok: stmt.run(category, now, id).changes > 0 }));
  res.json({ results, updated: results.filter((r) => r.ok).length });
});

module.exports = router;
