const express = require('express');
const db = require('../../db');
const { formatPostPublic } = require('../../services/postFormat');
const { distanceMiles } = require('../../utils/geo');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(60, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const now = Date.now();

    const where = ["type = 'simcha'", "status = 'live'", '(expires_at IS NULL OR expires_at > ?)'];
    const params = [now];

    if (req.query.taxonomyId) {
      where.push('taxonomy_id = ?');
      params.push(Number(req.query.taxonomyId));
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
    if (req.query.dateFrom) {
      where.push("json_extract(fields, '$.simchaDate') >= ?");
      params.push(req.query.dateFrom);
    }
    if (req.query.dateTo) {
      where.push("json_extract(fields, '$.simchaDate') <= ?");
      params.push(req.query.dateTo);
    }

    const whereSql = where.join(' AND ');
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
    const radius = req.query.radius ? Number(req.query.radius) : null;
    const useGeo = lat !== null && lng !== null && radius;

    let posts, total;
    if (useGeo) {
      const all = db.prepare(`SELECT * FROM posts WHERE ${whereSql} ORDER BY boosted_at DESC LIMIT 5000`).all(...params);
      const withDist = all
        .map((p) => ({ post: p, dist: distanceMiles(lat, lng, p.location_lat, p.location_lng) }))
        .filter((x) => x.dist !== null && x.dist <= radius)
        .sort((a, b) => a.dist - b.dist);
      total = withDist.length;
      posts = withDist.slice((page - 1) * pageSize, page * pageSize).map((x) => x.post);
    } else {
      total = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE ${whereSql}`).get(...params).c;
      posts = db
        .prepare(`SELECT * FROM posts WHERE ${whereSql} ORDER BY boosted_at DESC LIMIT ? OFFSET ?`)
        .all(...params, pageSize, (page - 1) * pageSize);
    }

    res.json({
      posts: posts.map((p) => formatPostPublic(p)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:publicId', (req, res, next) => {
  try {
    const post = db.prepare("SELECT * FROM posts WHERE public_id = ? AND type = 'simcha'").get(req.params.publicId);
    if (!post || post.status !== 'live') return res.status(404).json({ error: 'Post not found' });
    db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(post.id);
    post.view_count += 1;
    res.json(formatPostPublic(post));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
