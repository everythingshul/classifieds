const db = require('../db');

function getPricingTier(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM pricing_tiers WHERE id = ? AND active = 1').get(id);
}

function getTiersForCategory(category) {
  return db
    .prepare("SELECT * FROM pricing_tiers WHERE active = 1 AND post_type = 'classified' AND (category = ? OR category IS NULL) ORDER BY sort_order")
    .all(category);
}

function getListingTiersForCategory(category) {
  return db
    .prepare("SELECT * FROM pricing_tiers WHERE active = 1 AND post_type = 'listing' AND (category = ? OR category IS NULL) ORDER BY sort_order")
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
function getListingCharLimits() {
  return getSettingJson('listing_char_limits', { title: 80, description: 200 });
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

// Picks the amount for a priced row (a pricing tier or an addon_pricing row)
// in the requested currency. GBP is only used when every row involved in
// this charge has a GBP price configured - a Stripe Checkout Session can't
// mix currencies across its line items, so if even one row's GBP price
// hasn't been set by the admin yet, the whole order falls back to USD rather
// than silently charging some items in the wrong currency or guessing a
// conversion rate.
function resolveCurrency(rows, currency) {
  if (currency !== 'gbp') return 'usd';
  const allConfigured = rows.every((r) => r.price_cents_gbp !== null && r.price_cents_gbp !== undefined);
  return allConfigured ? 'gbp' : 'usd';
}
function amountFor(row, resolvedCurrency) {
  return resolvedCurrency === 'gbp' ? row.price_cents_gbp : row.price_cents;
}

// Builds the priced line items for a new classified post: the duration tier plus
// any selected add-ons (strike/featured, oversized). Categories flagged "free"
// (Lost & Found, or any admin-added free custom category) always cost $0.
function buildClassifiedCharges({ category, categoryDef, pricingTierId, wantsStrike, wantsOversized, currency = 'usd' }) {
  let tier = null;

  if (categoryDef?.free) {
    tier = db.prepare("SELECT * FROM pricing_tiers WHERE category = ? AND post_type = 'classified' AND active = 1 LIMIT 1").get(category)
      || { name: 'Standard (Free)', duration_days: 30, price_cents: 0, price_cents_gbp: 0 };
  } else {
    tier = getPricingTier(pricingTierId);
    if (!tier || tier.post_type !== 'classified' || (tier.category && tier.category !== category)) {
      throw Object.assign(new Error('Invalid pricing tier for this category'), { status: 400 });
    }
  }
  if (!tier) throw Object.assign(new Error('No pricing tier available'), { status: 400 });

  const strike = wantsStrike ? getAddon('classified_strike') : null;
  const oversized = wantsOversized ? getAddon('classified_oversized') : null;
  const resolvedCurrency = resolveCurrency([tier, strike, oversized].filter(Boolean), currency);

  const lineItems = [{ kind: 'listing', label: `${tier.name} listing`, amount_cents: amountFor(tier, resolvedCurrency) }];
  if (strike) lineItems.push({ kind: 'strike', label: strike.config.label || 'Featured / Striking listing', amount_cents: amountFor(strike, resolvedCurrency) });
  if (oversized) lineItems.push({ kind: 'oversized', label: oversized.config.label || 'Oversized post', amount_cents: amountFor(oversized, resolvedCurrency) });

  const totalCents = lineItems.reduce((s, i) => s + i.amount_cents, 0);
  return { tier, lineItems, totalCents, currency: resolvedCurrency };
}

// Mirrors buildClassifiedCharges but scoped to Listings' own pricing tiers
// (post_type = 'listing'), kept fully separate per the site's design.
function buildListingCharges({ category, categoryDef, pricingTierId, wantsStrike, wantsOversized, currency = 'usd' }) {
  let tier = null;

  if (categoryDef?.free) {
    tier = db.prepare("SELECT * FROM pricing_tiers WHERE category = ? AND post_type = 'listing' AND active = 1 LIMIT 1").get(category)
      || { name: 'Standard (Free)', duration_days: 30, price_cents: 0, price_cents_gbp: 0 };
  } else {
    tier = getPricingTier(pricingTierId);
    if (!tier || tier.post_type !== 'listing' || (tier.category && tier.category !== category)) {
      throw Object.assign(new Error('Invalid pricing tier for this category'), { status: 400 });
    }
  }
  if (!tier) throw Object.assign(new Error('No pricing tier available'), { status: 400 });

  const strike = wantsStrike ? getAddon('listing_strike') : null;
  const oversized = wantsOversized ? getAddon('listing_oversized') : null;
  const resolvedCurrency = resolveCurrency([tier, strike, oversized].filter(Boolean), currency);

  const lineItems = [{ kind: 'listing', label: `${tier.name} listing`, amount_cents: amountFor(tier, resolvedCurrency) }];
  if (strike) lineItems.push({ kind: 'strike', label: strike.config.label || 'Featured / Striking listing', amount_cents: amountFor(strike, resolvedCurrency) });
  if (oversized) lineItems.push({ kind: 'oversized', label: oversized.config.label || 'Oversized post', amount_cents: amountFor(oversized, resolvedCurrency) });

  const totalCents = lineItems.reduce((s, i) => s + i.amount_cents, 0);
  return { tier, lineItems, totalCents, currency: resolvedCurrency };
}

function buildSimchaCharges({ currency = 'usd' } = {}) {
  const tier = db.prepare("SELECT * FROM pricing_tiers WHERE post_type = 'simcha' AND active = 1 ORDER BY sort_order LIMIT 1").get();
  const resolvedCurrency = tier ? resolveCurrency([tier], currency) : 'usd';
  const amount = tier ? amountFor(tier, resolvedCurrency) : 0;
  const lineItems = [{ kind: 'listing', label: tier ? tier.name : 'Simcha posting', amount_cents: amount }];
  const totalCents = amount;
  return { tier, lineItems, totalCents, currency: resolvedCurrency };
}

module.exports = {
  getPricingTier,
  getTiersForCategory,
  getListingTiersForCategory,
  getAddon,
  getClassifiedCharLimits,
  getSimchaCharLimits,
  getOversizedCharLimits,
  getListingCharLimits,
  getSetting,
  buildClassifiedCharges,
  buildListingCharges,
  buildSimchaCharges,
};
