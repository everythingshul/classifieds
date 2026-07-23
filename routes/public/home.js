const express = require('express');
const db = require('../../db');
const { getHomeCalendarData } = require('../../utils/hebrewCalendar');
const { formatPostPublic } = require('../../services/postFormat');
const { getSetting } = require('../../services/pricing');
const { DEFAULT_BROOKLYN_LOCATION } = require('../../utils/constants');

const router = express.Router();

function imagesForPosts(postIds) {
  if (!postIds.length) return new Map();
  const placeholders = postIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM post_images WHERE post_id IN (${placeholders}) ORDER BY sort_order`)
    .all(...postIds);
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r.post_id)) map.set(r.post_id, []);
    map.get(r.post_id).push(r);
  });
  return map;
}

router.get('/', async (req, res, next) => {
  try {
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
    const label = req.query.label ? String(req.query.label).slice(0, 100) : undefined;

    const calendar = await getHomeCalendarData({
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      label,
      defaultLocation: getSetting('default_location', DEFAULT_BROOKLYN_LOCATION),
    });

    const now = Date.now();
    const recentClassifieds = db
      .prepare(
        `SELECT * FROM posts WHERE type = 'classified' AND status = 'live' AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY is_featured_strike DESC, boosted_at DESC LIMIT 10`
      )
      .all(now);
    const recentSimchas = db
      .prepare(
        `SELECT * FROM posts WHERE type = 'simcha' AND status = 'live' AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY boosted_at DESC LIMIT 10`
      )
      .all(now);

    const imgMap = imagesForPosts(recentClassifieds.map((p) => p.id));

    res.json({
      calendar,
      recentClassifieds: recentClassifieds.map((p) => formatPostPublic(p, imgMap.get(p.id) || [])),
      recentSimchas: recentSimchas.map((p) => formatPostPublic(p)),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
