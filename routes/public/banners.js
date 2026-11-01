const express = require('express');
const db = require('../../db');
const { PAGE_ZONE_KEYS, bannersForZone } = require('../../services/banners');

const router = express.Router();

router.get('/', (req, res) => {
  const zone = String(req.query.zone || '');
  if (!PAGE_ZONE_KEYS.has(zone)) return res.json({ top: [], sidebar: [] });
  res.json(bannersForZone(zone));
});

// Mirrors routes/public/posts.js's impressions/clicks registration - same
// fire-and-forget pattern, logged into the same analytics_events table
// (banner_id set, type 'banner_view'/'banner_click') so banner performance
// shows up in the same admin Analytics dashboard as everything else.
function logBannerEvents(type, ids, visitorId) {
  if (!visitorId || !ids?.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const banners = db.prepare(`SELECT id FROM banners WHERE public_id IN (${placeholders})`).all(...ids);
  if (!banners.length) return;
  const now = Date.now();
  const stmt = db.prepare('INSERT INTO analytics_events (type, banner_id, visitor_id, created_at) VALUES (?, ?, ?, ?)');
  banners.forEach((b) => stmt.run(type, b.id, visitorId, now));
}

router.post('/impressions', (req, res) => {
  const { ids, visitorId } = req.body;
  logBannerEvents('banner_view', Array.isArray(ids) ? ids : [], visitorId);
  res.json({ ok: true });
});

router.post('/clicks', (req, res) => {
  const { ids, visitorId } = req.body;
  logBannerEvents('banner_click', Array.isArray(ids) ? ids : [], visitorId);
  res.json({ ok: true });
});

module.exports = router;
