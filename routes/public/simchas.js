const express = require('express');
const db = require('../../db');
const { formatPostPublic } = require('../../services/postFormat');
const { runBrowseQuery, parseGeo } = require('../../services/searchQuery');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(60, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const now = Date.now();

    // Expired posts stay in the browse grid too (stamped, contact stripped -
    // see formatPostPublic/cards.js), sorted after live ones.
    const where = ["type = 'simcha'", "(status = 'live' OR status = 'expired')", "(status != 'live' OR expires_at IS NULL OR expires_at > ?)"];
    const params = [now];

    if (req.query.taxonomyId) {
      where.push('taxonomy_id = ?');
      params.push(Number(req.query.taxonomyId));
    }
    if (req.query.dateFrom) {
      where.push("json_extract(fields, '$.simchaDate') >= ?");
      params.push(req.query.dateFrom);
    }
    if (req.query.dateTo) {
      where.push("json_extract(fields, '$.simchaDate') <= ?");
      params.push(req.query.dateTo);
    }

    // Text search (q), the City filter and "near me" all live in
    // services/searchQuery.js - shared with classifieds, listings and Chesky.
    const { posts, total } = runBrowseQuery({ where, params, q: req.query.q, city: req.query.city, geo: parseGeo(req.query), orderBy: 'boosted_at DESC', page, pageSize });

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
    // Expired posts stay reachable (see routes/public/classifieds.js's
    // detail route for the full rationale).
    if (!post || !['live', 'expired'].includes(post.status)) return res.status(404).json({ error: 'Post not found' });
    res.json(formatPostPublic(post));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
