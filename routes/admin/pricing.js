const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { getClassifiedCategoryKeys, getListingCategoryKeys } = require('../../services/taxonomy');

const router = express.Router();
router.use(requireAdmin);

router.get('/tiers', (req, res) => {
  res.json(db.prepare('SELECT * FROM pricing_tiers ORDER BY category, sort_order').all());
});

// A GBP price is nullable - null means "not configured", which checkout
// treats as "fall back to the USD price in USD" (see services/pricing.js).
// Distinguishes "field not sent" (leave as-is) from "sent empty/null"
// (explicitly clear it back to not-configured).
function resolveGbpPrice(priceCentsGbp, existing) {
  if (priceCentsGbp === undefined) return existing;
  if (priceCentsGbp === null || priceCentsGbp === '') return null;
  return Number(priceCentsGbp);
}

router.post('/tiers', (req, res) => {
  const { category, name, durationDays, priceCents, priceCentsGbp, sortOrder, postType } = req.body;
  const type = postType === 'listing' ? 'listing' : postType === 'simcha' ? 'simcha' : 'classified';
  // Simcha has exactly one implicit category (there's no separate simcha
  // sub-category concept), so it's always forced to 'simcha' server-side
  // regardless of what's sent - it's the only category that type ever uses.
  const resolvedCategory = type === 'simcha' ? 'simcha' : category;
  if (type !== 'simcha' && resolvedCategory && resolvedCategory !== 'simcha') {
    const validKeys = type === 'listing' ? getListingCategoryKeys() : getClassifiedCategoryKeys();
    if (!validKeys.includes(resolvedCategory)) return res.status(400).json({ error: 'Invalid category' });
  }
  if (!name || !durationDays) return res.status(400).json({ error: 'name and durationDays are required' });
  const info = db
    .prepare('INSERT INTO pricing_tiers (category, post_type, name, duration_days, price_cents, price_cents_gbp, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
    .run(resolvedCategory || null, type, name, Number(durationDays), Number(priceCents) || 0, resolveGbpPrice(priceCentsGbp, null), Number(sortOrder) || 0);
  res.status(201).json(db.prepare('SELECT * FROM pricing_tiers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/tiers/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM pricing_tiers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { name, durationDays, priceCents, priceCentsGbp, sortOrder, active, category } = req.body;
  db.prepare(
    'UPDATE pricing_tiers SET name = ?, duration_days = ?, price_cents = ?, price_cents_gbp = ?, sort_order = ?, active = ?, category = ? WHERE id = ?'
  ).run(
    name ?? row.name,
    durationDays !== undefined ? Number(durationDays) : row.duration_days,
    priceCents !== undefined ? Number(priceCents) : row.price_cents,
    resolveGbpPrice(priceCentsGbp, row.price_cents_gbp),
    sortOrder !== undefined ? Number(sortOrder) : row.sort_order,
    active !== undefined ? (active ? 1 : 0) : row.active,
    category !== undefined ? category : row.category,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM pricing_tiers WHERE id = ?').get(req.params.id));
});

router.delete('/tiers/:id', (req, res) => {
  db.prepare('UPDATE pricing_tiers SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ deactivated: true });
});

router.get('/addons', (req, res) => {
  const rows = db.prepare('SELECT * FROM addon_pricing').all();
  res.json(rows.map((r) => ({ ...r, config: r.config ? JSON.parse(r.config) : {} })));
});

router.put('/addons/:key', (req, res) => {
  const row = db.prepare('SELECT * FROM addon_pricing WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { priceCents, priceCentsGbp, config } = req.body;
  db.prepare('UPDATE addon_pricing SET price_cents = ?, price_cents_gbp = ?, config = ? WHERE key = ?').run(
    priceCents !== undefined ? Number(priceCents) : row.price_cents,
    resolveGbpPrice(priceCentsGbp, row.price_cents_gbp),
    config !== undefined ? JSON.stringify(config) : row.config,
    req.params.key
  );
  const updated = db.prepare('SELECT * FROM addon_pricing WHERE key = ?').get(req.params.key);
  res.json({ ...updated, config: updated.config ? JSON.parse(updated.config) : {} });
});

module.exports = router;
