const express = require('express');
const db = require('../../db');
const { simchasEnabled } = require('../../services/features');
const { getHomeCalendarData } = require('../../utils/hebrewCalendar');
const { formatPostPublic } = require('../../services/postFormat');
const { formatEditorialPublic } = require('../../services/editorial');
const { getSetting } = require('../../services/pricing');
const { DEFAULT_BROOKLYN_LOCATION, DEFAULT_LONDON_LOCATION } = require('../../utils/constants');
const { currencyForHost } = require('../../services/currency');

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
    const rawLabel = req.query.label ? String(req.query.label).slice(0, 100) : undefined;
    // Defends against clients that build their query string from an object
    // with an unset field (e.g. `new URLSearchParams({label: undefined})`
    // literally serializes to "label=undefined") - never show that as a
    // location name.
    const label = rawLabel && rawLabel !== 'undefined' && rawLabel !== 'null' ? rawLabel : undefined;

    // jlistings.co.uk (and any other .co.uk domain this app serves) defaults
    // to London rather than the admin's globally-configured default - only
    // when the visitor truly has no location of their own (no lat/lng sent).
    const isUkDomain = currencyForHost(req.hostname) === 'gbp';
    const defaultLocation = isUkDomain ? DEFAULT_LONDON_LOCATION : getSetting('default_location', DEFAULT_BROOKLYN_LOCATION);

    const calendar = await getHomeCalendarData({
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      label,
      defaultLocation,
    });

    const now = Date.now();
    // Featured/Striking posts jump to the top on the classifieds/listings
    // browse pages and within their category, but the home page shows recent
    // activity without that priority - so no is_featured_strike ordering here.
    const recentClassifieds = db
      .prepare(
        `SELECT * FROM posts WHERE type = 'classified' AND status = 'live' AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY boosted_at DESC LIMIT 10`
      )
      .all(now);
    const recentListings = db
      .prepare(
        `SELECT * FROM posts WHERE type = 'listing' AND status = 'live' AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY boosted_at DESC LIMIT 10`
      )
      .all(now);
    const recentSimchas = !simchasEnabled() ? [] : db
      .prepare(
        `SELECT * FROM posts WHERE type = 'simcha' AND status = 'live' AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY boosted_at DESC LIMIT 10`
      )
      .all(now);

    const imgMap = imagesForPosts([...recentClassifieds, ...recentListings].map((p) => p.id));

    // A small teaser strip under the weather widget - just enough to draw
    // eyes to the new section, not a full feed (that's what /editorials is for).
    const recentEditorials = db
      .prepare("SELECT * FROM editorials WHERE status = 'live' ORDER BY published_at DESC LIMIT 3")
      .all();
    const editorialImages = recentEditorials.length
      ? db.prepare(`SELECT * FROM editorial_images WHERE editorial_id IN (${recentEditorials.map(() => '?').join(',')}) ORDER BY sort_order`).all(...recentEditorials.map((e) => e.id))
      : [];
    const editorialImgMap = new Map();
    editorialImages.forEach((img) => {
      if (!editorialImgMap.has(img.editorial_id)) editorialImgMap.set(img.editorial_id, []);
      editorialImgMap.get(img.editorial_id).push(img);
    });

    res.json({
      calendar,
      recentClassifieds: recentClassifieds.map((p) => formatPostPublic(p, imgMap.get(p.id) || [])),
      recentListings: recentListings.map((p) => formatPostPublic(p, imgMap.get(p.id) || [])),
      recentSimchas: recentSimchas.map((p) => formatPostPublic(p)),
      recentEditorials: recentEditorials.map((e) => formatEditorialPublic(e, editorialImgMap.get(e.id) || [])),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
