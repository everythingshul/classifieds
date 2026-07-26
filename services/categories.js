const db = require('../db');
const { CLASSIFIED_CATEGORIES } = require('../utils/constants');

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'category';
}

function uniqueSlug(base) {
  const existing = new Set(getClassifiedCategoryKeys());
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function getCustomCategories({ includeInactive = false } = {}) {
  const rows = includeInactive
    ? db.prepare('SELECT * FROM custom_categories ORDER BY sort_order').all()
    : db.prepare('SELECT * FROM custom_categories WHERE active = 1 ORDER BY sort_order').all();
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    labelHe: row.label_he,
    hasImages: !!row.has_images,
    hasPrice: !!row.has_price,
    free: !!row.free,
    taxonomyGroup: null,
    isSystem: false,
    id: row.id,
    active: !!row.active,
  }));
}

// The 9 built-in categories plus any admin-added ones, merged into one list.
function getAllClassifiedCategories({ includeInactive = false } = {}) {
  return [...CLASSIFIED_CATEGORIES, ...getCustomCategories({ includeInactive })];
}

function getClassifiedCategoryKeys() {
  return getAllClassifiedCategories({ includeInactive: true }).map((c) => c.key);
}

function findCategory(key) {
  return getAllClassifiedCategories({ includeInactive: true }).find((c) => c.key === key);
}

// Flat, admin-editable option lists (job type, pay period) stored as
// taxonomies rows. Values are the display name itself (e.g. "Part Time"),
// not an id, since that's what's stored in a post's `fields` JSON.
function getOptionNames(grp) {
  return db.prepare('SELECT name FROM taxonomies WHERE grp = ? AND active = 1 ORDER BY sort_order').all(grp).map((r) => r.name);
}

module.exports = { getAllClassifiedCategories, getCustomCategories, getClassifiedCategoryKeys, findCategory, slugify, uniqueSlug, getOptionNames };
