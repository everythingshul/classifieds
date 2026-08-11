// Category/taxonomy helpers for Classifieds, Listings, and generic taxonomy
// trees, grouped into one module since they're all small, related lookups
// over the same kind of admin-editable category data.

const db = require('../db');
const { CLASSIFIED_CATEGORIES } = require('../utils/constants');

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'category';
}

// -- Classifieds categories --

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
    taxonomyGroup: `cat:${row.key}`,
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

function uniqueSlug(base) {
  const existing = new Set(getClassifiedCategoryKeys());
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// Flat, admin-editable option lists (job type, pay period) stored as
// taxonomies rows. Values are the display name itself (e.g. "Part Time"),
// not an id, since that's what's stored in a post's `fields` JSON.
function getOptionNames(grp) {
  return db.prepare('SELECT name FROM taxonomies WHERE grp = ? AND active = 1 ORDER BY sort_order').all(grp).map((r) => r.name);
}

// -- Listings categories --

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
    taxonomyGroup: `lst:${row.key}`,
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

// -- Generic taxonomy tree ordering --

// Re-orders a flat taxonomy list (parent_id, sort_order) into hierarchical
// order: each parent immediately followed by its own children, recursively,
// rather than a plain `ORDER BY parent_id` which groups all of one group's
// children after every parent in that group instead of nesting them under
// the parent they actually belong to.
function orderTaxonomyTree(rows) {
  const byParent = new Map();
  rows.forEach((row) => {
    const key = row.parent_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  });

  const out = [];
  function walk(parentId) {
    const children = byParent.get(parentId) || [];
    children.forEach((row) => {
      out.push(row);
      walk(row.id);
    });
  }
  walk(null);

  // Any row whose declared parent_id doesn't match a real parent in this
  // set (e.g. filtered out or inactive) would otherwise be silently
  // dropped by walk() - append it so nothing goes missing.
  const seen = new Set(out.map((r) => r.id));
  rows.forEach((row) => { if (!seen.has(row.id)) out.push(row); });

  return out;
}

module.exports = {
  getAllClassifiedCategories,
  getCustomCategories,
  getClassifiedCategoryKeys,
  findCategory,
  slugify,
  uniqueSlug,
  getOptionNames,
  getAllListingCategories,
  getListingCategoryKeys,
  findListingCategory,
  uniqueListingSlug,
  orderTaxonomyTree,
};
