const db = require('../db');
const { slugify } = require('./categories');

// Listings is a fully separate section from Classifieds - it starts with zero
// categories and every one is admin-defined, using the generic form shape
// (description, location, optional price, optional images).
function getAllListingCategories({ includeInactive = false } = {}) {
  const rows = includeInactive
    ? db.prepare('SELECT * FROM listing_categories ORDER BY sort_order').all()
    : db.prepare('SELECT * FROM listing_categories WHERE active = 1 ORDER BY sort_order').all();
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    labelHe: row.label_he,
    hasImages: !!row.has_images,
    hasPrice: !!row.has_price,
    free: !!row.free,
    id: row.id,
    active: !!row.active,
  }));
}

function getListingCategoryKeys() {
  return getAllListingCategories({ includeInactive: true }).map((c) => c.key);
}

function findListingCategory(key) {
  return getAllListingCategories({ includeInactive: true }).find((c) => c.key === key);
}

function uniqueListingSlug(base) {
  const existing = new Set(getListingCategoryKeys());
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

module.exports = { getAllListingCategories, getListingCategoryKeys, findListingCategory, uniqueListingSlug, slugify };
