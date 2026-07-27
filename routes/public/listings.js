const express = require('express');
const db = require('../../db');
const { formatPostPublic } = require('../../services/postFormat');
const { distanceMiles } = require('../../utils/geo');
const { getListingCategoryKeys } = require('../../services/listingCategories');

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
       WHERE type = 'listing' AND status = 'live' AND (expires_at IS NULL OR expires_at > ?)
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

    const where = ["type = 'listing'", "status = 'live'", '(expires_at IS NULL OR expires_at > ?)'];
    const params = [now];

    if (req.query.category) {
      if (!getListingCategoryKeys().includes(req.query.category)) {
        return res.status(400).json({ error: 'Unknown category' });
      }
      where.push('category = ?');
      params.push(req.query.category);
    }
    if (req.query.q) {
      where.push('(title LIKE ? OR description LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like);
    }
    if (req.query.city) {
      where.push('location_city LIKE ?');
      params.push(`%${req.query.city}%`);
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

    const whereSql = where.join(' AND ');
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
    const radius = req.query.radius ? Number(req.query.radius) : null;
    const useGeo = lat !== null && lng !== null && radius;

    let posts, total;
    if (useGeo) {
      const all = db
        .prepare(`SELECT * FROM posts WHERE ${whereSql} ORDER BY is_featured_strike DESC, boosted_at DESC LIMIT 5000`)
        .all(...params);
      const withDist = all
        .map((p) => ({ post: p, dist: distanceMiles(lat, lng, p.location_lat, p.location_lng) }))
        .filter((x) => x.dist !== null && x.dist <= radius)
        .sort((a, b) => a.dist - b.dist);
      total = withDist.length;
      posts = withDist.slice((page - 1) * pageSize, page * pageSize).map((x) => x.post);
    } else {
      total = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE ${whereSql}`).get(...params).c;
      let orderBy = 'is_featured_strike DESC, boosted_at DESC';
      if (req.query.sort === 'price_asc') orderBy = "json_extract(fields, '$.price') ASC";
      if (req.query.sort === 'price_desc') orderBy = "json_extract(fields, '$.price') DESC";
      posts = db
        .prepare(`SELECT * FROM posts WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
        .all(...params, pageSize, (page - 1) * pageSize);
    }

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
    if (!post || post.status !== 'live') return res.status(404).json({ error: 'Post not found' });
    const images = db.prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order').all(post.id);
    res.json(formatPostPublic(post, images));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
