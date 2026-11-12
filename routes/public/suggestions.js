const express = require('express');
const db = require('../../db');
const { formatPostPublic } = require('../../services/postFormat');
const { runBrowseQuery } = require('../../services/searchQuery');
const { matchByText } = require('../../services/locations');
const { getAllClassifiedCategories } = require('../../services/taxonomy');
const { distanceMiles } = require('../../utils/geo');
const { hiddenTypesSql } = require('../../services/features');

const router = express.Router();
const NEAR_MILES = 12;
const PER_SECTION = 6;

function imagesForPosts(postIds) {
  const map = new Map();
  if (!postIds.length) return map;
  db.prepare(`SELECT * FROM post_images WHERE post_id IN (${postIds.map(() => '?').join(',')}) ORDER BY sort_order`).all(...postIds)
    .forEach((r) => { if (!map.has(r.post_id)) map.set(r.post_id, []); map.get(r.post_id).push(r); });
  return map;
}

const list = (v, max) => [].concat(v || []).map((s) => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, max);

// GET /api/suggestions?c=job-offers&c=items-for-sale&p=Lakewood&t=plumber&lat=&lng=
// What the visitor has looked at lives only in their own browser
// (public/js/interests.js); it is sent here, scored, and forgotten. Nothing
// is stored against them. Order of c/p/t is most-interested first.
router.get('/', (req, res, next) => {
  try {
    const now = Date.now();
    const cats = list(req.query.c, 3);
    const terms = list(req.query.t, 3);
    const places = list(req.query.p, 3).map((text) => matchByText(text)).filter(Boolean).map((m) => m.location);
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
    const hasGeo = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);
    const seen = new Set(list(req.query.x, 60));
    const catLabel = Object.fromEntries(getAllClassifiedCategories().map((c) => [c.key, c.label]));
    const placeName = (l) => l.name.split(',')[0];

    const live = `type = 'classified' AND status = 'live' AND (expires_at IS NULL OR expires_at > ${now}) AND ${hiddenTypesSql()}`;
    const sections = [];
    const take = (rows) => {
      const out = [];
      for (const r of rows) {
        if (seen.has(r.public_id)) continue;
        seen.add(r.public_id);
        out.push(r);
        if (out.length >= PER_SECTION) break;
      }
      return out;
    };
    const add = (title, reason, rows) => { const posts = take(rows); if (posts.length) sections.push({ title, reason, posts }); };

    const nearPlace = (rows, loc) => rows.filter((r) => r.location_id === loc.id || (distanceMiles(loc.lat, loc.lng, r.location_lat, r.location_lng) ?? 1e9) <= NEAR_MILES);

    // 1. The category they care about, in the area they care about.
    const topPlace = places[0] || null;
    if (cats[0] && topPlace) {
      const rows = db.prepare(`SELECT * FROM posts WHERE ${live} AND category = ? ORDER BY boosted_at DESC LIMIT 400`).all(cats[0]);
      add(`${catLabel[cats[0]] || 'New posts'} in ${placeName(topPlace)}`, 'You were looking here', nearPlace(rows, topPlace));
    }
    // 2. What they searched for, closest to where they want it.
    terms.slice(0, 2).forEach((t) => {
      const { posts } = runBrowseQuery({ where: [live], params: [], q: t, city: '', geo: null, orderBy: 'boosted_at DESC', page: 1, pageSize: 40 });
      const ranked = topPlace ? [...posts].sort((a, b) => (distanceMiles(topPlace.lat, topPlace.lng, a.location_lat, a.location_lng) ?? 1e9) - (distanceMiles(topPlace.lat, topPlace.lng, b.location_lat, b.location_lng) ?? 1e9)) : posts;
      add(`More for "${t}"`, 'Because you searched for it', ranked);
    });
    // 3. A second place they looked at.
    if (places[1]) {
      const rows = db.prepare(`SELECT * FROM posts WHERE ${live} ORDER BY boosted_at DESC LIMIT 400`).all();
      add(`New in ${placeName(places[1])}`, 'Another area you looked at', nearPlace(rows, places[1]));
    }
    // 4. Their other categories.
    cats.slice(1).forEach((c) => {
      const rows = db.prepare(`SELECT * FROM posts WHERE ${live} AND category = ? ORDER BY boosted_at DESC LIMIT 60`).all(c);
      add(`More ${catLabel[c] || 'posts'}`, 'You looked at these before', topPlace ? nearPlace(rows, topPlace).concat(rows) : rows);
    });
    // 5. Right where they are now, when the browser shared it.
    if (hasGeo) {
      const rows = db.prepare(`SELECT * FROM posts WHERE ${live} AND location_lat IS NOT NULL ORDER BY boosted_at DESC LIMIT 400`).all()
        .filter((r) => (distanceMiles(lat, lng, r.location_lat, r.location_lng) ?? 1e9) <= NEAR_MILES);
      add('Near you', 'Based on your location', rows);
    }

    const flat = sections.flatMap((s) => s.posts);
    const imgMap = imagesForPosts(flat.map((p) => p.id));
    res.json({ sections: sections.slice(0, 4).map((s) => ({ title: s.title, reason: s.reason, posts: s.posts.map((p) => formatPostPublic(p, imgMap.get(p.id) || [])) })) });
  } catch (e) { next(e); }
});

module.exports = router;
