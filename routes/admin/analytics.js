const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;

// SQLite day bucket from a millisecond epoch column - used for both the
// timeseries and the "recurring visitor" (active on >1 distinct day) check.
const DAY_EXPR = "date(created_at / 1000, 'unixepoch')";

function computeTotals(from, to) {
  return {
    pageviews: db.prepare("SELECT COUNT(*) AS c FROM analytics_events WHERE type = 'pageview' AND created_at BETWEEN ? AND ?").get(from, to).c,
    postViews: db.prepare("SELECT COUNT(*) AS c FROM analytics_events WHERE type = 'post_view' AND created_at BETWEEN ? AND ?").get(from, to).c,
    postClicks: db.prepare("SELECT COUNT(*) AS c FROM analytics_events WHERE type = 'post_click' AND created_at BETWEEN ? AND ?").get(from, to).c,
    uniqueVisitors: db.prepare('SELECT COUNT(DISTINCT visitor_id) AS c FROM analytics_events WHERE created_at BETWEEN ? AND ?').get(from, to).c,
    recurringVisitors: db.prepare(`
      SELECT COUNT(*) AS c FROM (
        SELECT visitor_id FROM analytics_events WHERE created_at BETWEEN ? AND ?
        GROUP BY visitor_id HAVING COUNT(DISTINCT ${DAY_EXPR}) > 1
      )
    `).get(from, to).c,
  };
}

router.get('/', (req, res) => {
  const to = req.query.to ? Number(req.query.to) : Date.now();
  const from = req.query.from ? Number(req.query.from) : to - 30 * DAY_MS;

  const totals = computeTotals(from, to);

  // Same-length window immediately preceding this one, so each stat card
  // can show a "vs previous period" delta rather than a bare number with
  // no sense of whether that's trending up or down.
  const spanMs = Math.max(1, to - from);
  const prevTo = from - 1;
  const prevFrom = prevTo - spanMs;
  const previousTotals = computeTotals(prevFrom, prevTo);

  // New = this is the first time we've ever seen this visitor_id at all.
  // Returning = they had at least one event before this period started.
  // "returning" is a reserved SQLite keyword (RETURNING clause), so the SQL
  // aliases avoid it even though the JS/JSON field name is fine.
  const newVsReturningRow = db.prepare(`
    SELECT
      SUM(CASE WHEN EXISTS (SELECT 1 FROM analytics_events e2 WHERE e2.visitor_id = v.visitor_id AND e2.created_at < ?) THEN 1 ELSE 0 END) AS returning_count,
      SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM analytics_events e2 WHERE e2.visitor_id = v.visitor_id AND e2.created_at < ?) THEN 1 ELSE 0 END) AS new_count
    FROM (SELECT DISTINCT visitor_id FROM analytics_events WHERE created_at BETWEEN ? AND ?) v
  `).get(from, from, from, to);
  const newVsReturning = { returning: newVsReturningRow.returning_count, new: newVsReturningRow.new_count };

  const timeseries = db.prepare(`
    SELECT ${DAY_EXPR} AS date,
      SUM(CASE WHEN type = 'pageview' THEN 1 ELSE 0 END) AS pageviews,
      SUM(CASE WHEN type = 'post_view' THEN 1 ELSE 0 END) AS postViews,
      SUM(CASE WHEN type = 'post_click' THEN 1 ELSE 0 END) AS postClicks,
      COUNT(DISTINCT visitor_id) AS uniqueVisitors
    FROM analytics_events
    WHERE created_at BETWEEN ? AND ?
    GROUP BY date
    ORDER BY date
  `).all(from, to);

  const byPostType = db.prepare(`
    SELECT post_type AS type, COUNT(*) AS c FROM analytics_events
    WHERE type = 'post_view' AND created_at BETWEEN ? AND ? AND post_type IS NOT NULL
    GROUP BY post_type ORDER BY c DESC
  `).all(from, to);

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) AS c FROM analytics_events
    WHERE type = 'post_view' AND created_at BETWEEN ? AND ? AND category IS NOT NULL
    GROUP BY category ORDER BY c DESC LIMIT 8
  `).all(from, to);

  const topPages = db.prepare(`
    SELECT path, COUNT(*) AS c FROM analytics_events
    WHERE type = 'pageview' AND created_at BETWEEN ? AND ?
    GROUP BY path ORDER BY c DESC LIMIT 10
  `).all(from, to);

  const topPosts = db.prepare(`
    SELECT p.id, p.public_id AS publicId, p.title, p.type, p.category,
      SUM(CASE WHEN e.type = 'post_view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN e.type = 'post_click' THEN 1 ELSE 0 END) AS clicks
    FROM analytics_events e
    JOIN posts p ON p.id = e.post_id
    WHERE e.type IN ('post_view', 'post_click') AND e.created_at BETWEEN ? AND ?
    GROUP BY p.id ORDER BY views DESC LIMIT 10
  `).all(from, to);

  res.json({ from, to, totals, previousTotals, newVsReturning, timeseries, byPostType, byCategory, topPages, topPosts });
});

module.exports = router;
