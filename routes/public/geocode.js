const express = require('express');
const { geocodeCandidates } = require('../../services/geocode');

const router = express.Router();

// GET /api/geocode?q=<typed location> -> { results: [{lat, lng, label}] }
// The lenient server-side geocoder (gazetteer + own posts + network
// fallbacks, see services/geocode.js) for the site's location boxes, so
// the browser doesn't have to replicate that logic or need perfect spelling.
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 120);
    if (!q) return res.json({ results: [] });
    const results = await geocodeCandidates(q);
    res.json({ results: results.map((r) => ({ lat: r.lat, lng: r.lng, label: r.label })) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
