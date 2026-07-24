const db = require('../db');

function getActivePromo(code) {
  if (!code) return null;
  const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? AND active = 1').get(String(code).trim().toUpperCase());
  if (!promo) return null;
  if (promo.expires_at && promo.expires_at < Date.now()) return null;
  if (promo.max_uses && promo.used_count >= promo.max_uses) return null;
  return promo;
}

function applyDiscount(totalCents, promo) {
  if (!promo) return totalCents;
  if (promo.percent_off) return Math.max(0, Math.round(totalCents * (1 - promo.percent_off / 100)));
  if (promo.amount_off_cents) return Math.max(0, totalCents - promo.amount_off_cents);
  return totalCents;
}

function recordUse(promo) {
  if (!promo) return;
  db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(promo.id);
}

module.exports = { getActivePromo, applyDiscount, recordUse };
