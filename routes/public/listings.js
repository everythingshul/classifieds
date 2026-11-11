const express = require('express');
const db = require('../../db');
const { formatPostPublic } = require('../../services/postFormat');
const { runBrowseQuery, parseGeo } = require('../../services/searchQuery');
const { getListingCategoryKeys } = require('../../services/taxonomy');

const router = express.Router();

function imagesForPosts(postIds) {
  if (!postIds.length) return new Map();
  const placeholders = postIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM post_images WHERE post_id IN (${placeholders}) ORDER BY sort_order`).all(...postIds);
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r.post_id)) map.set(r.post_id, []);
    map.get(r.post_id).push(r);
  });
  return map;
}

function categoryCounts() {
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) AS c FROM posts
       WHERE type = 'listing' AND (status = 'live' OR status = 'expired') AND (status != 'live' OR expires_at IS NULL OR expires_at > ?)
       GROUP BY category`
    )
    .all(now);
  const map = Object.fromEntries(getListingCategoryKeys().map((k) => [k, 0]));
  rows.forEach((r) => { map[r.category] = r.c; });
  return map;
}

router.get('/category-counts', (req, res) => {
  res.json(categoryCounts());
});

// GET /api/listings  (view-all when no category given, or filtered to one category)
router.get('/', (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(60, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const now = Date.now();

    // Expired posts stay in the browse grid too (stamped, contact stripped -
    // see formatPostPublic/cards.js), sorted after live ones.
    const where = ["type = 'listing'", "(status = 'live' OR status = 'expired')", "(status != 'live' OR expires_at IS NULL OR expires_at > ?)"];
    const params = [now];

    if (req.query.category) {
      if (!getListingCategoryKeys().includes(req.query.category)) {
        return res.status(400).json({ error: 'Unknown category' });
      }
      where.push('category = ?');
      params.push(req.query.category);
    }
    if (req.query.state) {
      where.push('location_state = ?');
      params.push(req.query.state);
    }
    if (req.query.minPrice) {
      where.push("json_extract(fields, '$.price') >= ?");
      params.push(Number(req.query.minPrice));
    }
    if (req.query.maxPrice) {
      where.push("json_extract(fields, '$.price') <= ?");
      params.push(Number(req.query.maxPrice));
    }

    let orderBy = 'is_featured_strike DESC, boosted_at DESC';
    if (req.query.sort === 'price_asc') orderBy = "json_extract(fields, '$.price') ASC";
    if (req.query.sort === 'price_desc') orderBy = "json_extract(fields, '$.price') DESC";

    // Text search (q), the City filter and "near me" all live in
    // services/searchQuery.js - shared with classifieds, simchas and Chesky.
    const { posts, total } = runBrowseQuery({ where, params, q: req.query.q, city: req.query.city, geo: parseGeo(req.query), orderBy, page, pageSize });

    const imgMap = imagesForPosts(posts.map((p) => p.id));

    res.json({
      posts: posts.map((p) => formatPostPublic(p, imgMap.get(p.id) || [])),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      categoryCounts: categoryCounts(),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:publicId', (req, res, next) => {
  try {
    const post = db.prepare("SELECT * FROM posts WHERE public_id = ? AND type = 'listing'").get(req.params.publicId);
    // Expired posts stay reachable (see routes/public/classifieds.js's
    // detail route for the full rationale).
    if (!post || !['live', 'expired'].includes(post.status)) return res.status(404).json({ error: 'Post not found' });
    const images = db.prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order').all(post.id);
    res.json(formatPostPublic(post, images));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
