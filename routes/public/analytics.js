const express = require('express');
const db = require('../../db');
const { ingest } = require('../../services/analyticsIngest');

const router = express.Router();

// POST /api/analytics/t - a batch of visit events from public/js/analytics.js.
// Sent as text/plain so navigator.sendBeacon can deliver it while the page
// is closing.
router.post('/t', express.text({ type: '*/*', limit: '16kb' }), (req, res) => {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).end(); }
  }
  res.status(ingest(req, body)).end();
});

// The older page view call. Browsers still holding the previous cached
// script keep posting here for up to an hour after a deploy.
router.post('/pageview', (req, res) => {
  const path = String(req.body.path || '').slice(0, 500);
  const visitorId = String(req.body.visitorId || '').slice(0, 100);
  if (!path || !visitorId) return res.status(400).json({ error: 'path and visitorId are required' });
  db.prepare('INSERT INTO analytics_events (type, path, visitor_id, domain, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'pageview', path, visitorId, String(req.get('host') || '').toLowerCase(), Date.now()
  );
  res.status(204).end();
});

module.exports = router;
