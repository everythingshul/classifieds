const express = require('express');
const db = require('../../db');

const router = express.Router();

// Fire-and-forget page view logging, keyed by an anonymous per-browser
// visitor id (see public/js/analytics.js). No auth, no PII - just enough to
// power the admin analytics dashboard's unique/recurring visitor counts and
// per-page traffic breakdowns.
router.post('/pageview', (req, res) => {
  const path = String(req.body.path || '').slice(0, 500);
  const visitorId = String(req.body.visitorId || '').slice(0, 100);
  if (!path || !visitorId) return res.status(400).json({ error: 'path and visitorId are required' });
  db.prepare('INSERT INTO analytics_events (type, path, visitor_id, created_at) VALUES (?, ?, ?, ?)').run(
    'pageview', path, visitorId, Date.now()
  );
  res.status(204).end();
});

module.exports = router;
