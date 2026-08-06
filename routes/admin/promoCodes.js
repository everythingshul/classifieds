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

router.post('/', (req, res) => {
  const { code, percentOff, amountOffCents, maxUses, expiresAt, appliesTo } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'Code is required' });
  if (!percentOff && !amountOffCents) return res.status(400).json({ error: 'Set either a percent-off or amount-off discount' });
  try {
    const info = db
      .prepare(
        `INSERT INTO promo_codes (code, percent_off, amount_off_cents, max_uses, expires_at, applies_to, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        code.trim().toUpperCase(),
        percentOff ? Number(percentOff) : null,
        amountOffCents ? Number(amountOffCents) : null,
        maxUses ? Number(maxUses) : null,
        expiresAt ? Number(expiresAt) : null,
        normalizeAppliesTo(appliesTo),
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
  const { active, appliesTo } = req.body;
  db.prepare('UPDATE promo_codes SET active = ?, applies_to = ? WHERE id = ?').run(
    active !== undefined ? (active ? 1 : 0) : row.active,
    appliesTo !== undefined ? normalizeAppliesTo(appliesTo) : row.applies_to,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM promo_codes WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
