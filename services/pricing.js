const db = require('../db');

function getPricingTier(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM pricing_tiers WHERE id = ? AND active = 1').get(id);
}

function getTiersForCategory(category) {
  return db
    .prepare('SELECT * FROM pricing_tiers WHERE active = 1 AND (category = ? OR category IS NULL) ORDER BY sort_order')
    .all(category);
}

function getAddon(key) {
  const row = db.prepare('SELECT * FROM addon_pricing WHERE key = ?').get(key);
  if (!row) return null;
  return { ...row, config: row.config ? JSON.parse(row.config) : {} };
}

function getSettingJson(key, fallback) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

function getClassifiedCharLimits() {
  return getSettingJson('classified_char_limits', { title: 80, description: 200 });
}
function getSimchaCharLimits() {
  return getSettingJson('simcha_char_limits', { description: 200 });
}
function getOversizedCharLimits() {
  return getSettingJson('oversized_char_limits', { title: 140, description: 500 });
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

// Builds the priced line items for a new classified post: the duration tier plus
// any selected add-ons (strike/featured, oversized). Categories flagged "free"
// (Lost & Found, or any admin-added free custom category) always cost $0.
function buildClassifiedCharges({ category, categoryDef, pricingTierId, wantsStrike, wantsOversized }) {
  const lineItems = [];
  let tier = null;

  if (categoryDef?.free) {
    tier = db.prepare('SELECT * FROM pricing_tiers WHERE category = ? AND active = 1 LIMIT 1').get(category)
      || { name: 'Standard (Free)', duration_days: 30, price_cents: 0 };
  } else {
    tier = getPricingTier(pricingTierId);
    if (!tier || (tier.category && tier.category !== category)) {
      throw Object.assign(new Error('Invalid pricing tier for this category'), { status: 400 });
    }
  }
  if (!tier) throw Object.assign(new Error('No pricing tier available'), { status: 400 });
  lineItems.push({ kind: 'listing', label: `${tier.name} listing`, amount_cents: tier.price_cents });

  if (wantsStrike) {
    const strike = getAddon('strike');
    if (strike) lineItems.push({ kind: 'strike', label: strike.config.label || 'Featured / Striking listing', amount_cents: strike.price_cents });
  }
  if (wantsOversized) {
    const oversized = getAddon('oversized');
    if (oversized) lineItems.push({ kind: 'oversized', label: oversized.config.label || 'Oversized post', amount_cents: oversized.price_cents });
  }

  const totalCents = lineItems.reduce((s, i) => s + i.amount_cents, 0);
  return { tier, lineItems, totalCents };
}

function buildSimchaCharges() {
  const tier = db.prepare("SELECT * FROM pricing_tiers WHERE category = 'simcha' AND active = 1 LIMIT 1").get();
  const lineItems = [{ kind: 'listing', label: tier ? tier.name : 'Simcha posting', amount_cents: tier ? tier.price_cents : 0 }];
  const totalCents = lineItems.reduce((s, i) => s + i.amount_cents, 0);
  return { tier, lineItems, totalCents };
}

module.exports = {
  getPricingTier,
  getTiersForCategory,
  getAddon,
  getClassifiedCharLimits,
  getSimchaCharLimits,
  getOversizedCharLimits,
  getSetting,
  buildClassifiedCharges,
  buildSimchaCharges,
};
