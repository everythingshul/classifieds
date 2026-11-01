// Admin-managed clickable ad/promo banners - see db/schema.sql's banners
// table comment for the full picture. This module is just the page-zone
// list (shared between the admin picker and public zone matching) and the
// public-facing JSON shape.

const db = require('../db');

// Every place a banner can be targeted to. Kept to the site's actual page
// *types* (matching the main nav) rather than every individual route, so
// the admin picker is a short, meaningful checkbox list instead of an
// unwieldy list of every URL on the site.
const PAGE_ZONES = [
  { key: 'home', label: 'Home' },
  { key: 'classifieds', label: 'Classifieds' },
  { key: 'listings', label: 'Listings' },
  { key: 'simchas', label: 'Simchas' },
  { key: 'editorials', label: 'Editorials' },
  { key: 'post', label: 'Post an Ad' },
  { key: 'search', label: 'Search Results' },
  { key: 'bookmarks', label: 'Bookmarks' },
];
const PAGE_ZONE_KEYS = new Set(PAGE_ZONES.map((z) => z.key));

function parsePages(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter((p) => PAGE_ZONE_KEYS.has(p)) : [];
  } catch (e) {
    return [];
  }
}

function formatBannerPublic(row) {
  return {
    id: row.public_id,
    imageUrl: `/uploads/${row.image_filename}`,
    linkUrl: row.link_url,
  };
}

function formatBannerAdmin(row, stats = {}) {
  return {
    id: row.id,
    publicId: row.public_id,
    imageUrl: `/uploads/${row.image_filename}`,
    linkUrl: row.link_url,
    position: row.position,
    pages: parsePages(row.pages),
    allPages: !!row.all_pages,
    active: !!row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    views: stats.views || 0,
    clicks: stats.clicks || 0,
  };
}

function bannersForZone(zone) {
  const rows = db.prepare('SELECT * FROM banners WHERE active = 1 ORDER BY sort_order, id').all();
  const matching = rows.filter((b) => b.all_pages || parsePages(b.pages).includes(zone));
  return {
    top: matching.filter((b) => b.position === 'top').map(formatBannerPublic),
    sidebar: matching.filter((b) => b.position === 'sidebar').map(formatBannerPublic),
  };
}

module.exports = { PAGE_ZONES, PAGE_ZONE_KEYS, parsePages, formatBannerPublic, formatBannerAdmin, bannersForZone };
