const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all());
});

const VALID_SECTIONS = ['classified', 'listing', 'simcha'];
// Normalizes to null (meaning "all sections") whenever every section is
// selected or none was specified, rather than storing a redundant explicit
// list - both mean the same thing to promoAppliesTo().
function normalizeAppliesTo(appliesTo) {
  if (!Array.isArray(appliesTo)) return null;
  const scopes = appliesTo.filter((s) => VALID_SECTIONS.includes(s));
  if (!scopes.length || scopes.length === VALID_SECTIONS.length) return null;
  return JSON.stringify(scopes);
}

// Line-item kinds a promo can be scoped to - matches the `kind` values
// services/pricing.js's charge builders produce. Boost is charged through
// its own separate checkout flow and never flows through promo codes today,
// so it isn't a valid target here.
const VALID_FEATURES = ['listing', 'strike', 'oversized'];
// Included features: same "select all / select none" collapses to null
// (meaning "every feature") as normalizeAppliesTo above.
function normalizeIncludedFeatures(features) {
  if (!Array.isArray(features)) return null;
  const f = features.filter((k) => VALID_FEATURES.includes(k));
  if (!f.length || f.length === VALID_FEATURES.length) return null;
  return JSON.stringify(f);
}
// Excluded features: unlike included, selecting "all" is a real, meaningful
// configuration (exclude everything), so only an empty selection collapses
// to null (meaning "exclude nothing").
function normalizeExcludedFeatures(features) {
  if (!Array.isArray(features)) return null;
  const f = features.filter((k) => VALID_FEATURES.includes(k));
  return f.length ? JSON.stringify(f) : null;
}

router.post('/', (req, res) => {
  const { code, percentOff, amountOffCents, maxUses, expiresAt, appliesTo, includedFeatures, excludedFeatures } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'Code is required' });
  if (!percentOff && !amountOffCents) return res.status(400).json({ error: 'Set either a percent-off or amount-off discount' });
  try {
    const info = db
      .prepare(
        `INSERT INTO promo_codes (code, percent_off, amount_off_cents, max_uses, expires_at, applies_to, included_features, excluded_features, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        code.trim().toUpperCase(),
        percentOff ? Number(percentOff) : null,
        amountOffCents ? Number(amountOffCents) : null,
        maxUses ? Number(maxUses) : null,
        expiresAt ? Number(expiresAt) : null,
        normalizeAppliesTo(appliesTo),
        normalizeIncludedFeatures(includedFeatures),
        normalizeExcludedFeatures(excludedFeatures),
        Date.now()
      );
    res.status(201).json(db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'That code already exists' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;

  const code = b.code !== undefined && String(b.code).trim() ? String(b.code).trim().toUpperCase() : row.code;
  const percentOff = b.percentOff !== undefined ? (b.percentOff ? Number(b.percentOff) : null) : row.percent_off;
  const amountOffCents = b.amountOffCents !== undefined ? (b.amountOffCents ? Number(b.amountOffCents) : null) : row.amount_off_cents;
  if (!percentOff && !amountOffCents) return res.status(400).json({ error: 'Set either a percent-off or amount-off discount' });

  try {
    db.prepare(
      `UPDATE promo_codes SET
        code = ?, percent_off = ?, amount_off_cents = ?, max_uses = ?, expires_at = ?,
        applies_to = ?, included_features = ?, excluded_features = ?, active = ?
       WHERE id = ?`
    ).run(
      code,
      percentOff,
      amountOffCents,
      b.maxUses !== undefined ? (b.maxUses ? Number(b.maxUses) : null) : row.max_uses,
      b.expiresAt !== undefined ? (b.expiresAt ? Number(b.expiresAt) : null) : row.expires_at,
      b.appliesTo !== undefined ? normalizeAppliesTo(b.appliesTo) : row.applies_to,
      b.includedFeatures !== undefined ? normalizeIncludedFeatures(b.includedFeatures) : row.included_features,
      b.excludedFeatures !== undefined ? normalizeExcludedFeatures(b.excludedFeatures) : row.excluded_features,
      b.active !== undefined ? (b.active ? 1 : 0) : row.active,
      req.params.id
    );
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'That code already exists' });
    throw e;
  }
  res.json(db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM promo_codes WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
