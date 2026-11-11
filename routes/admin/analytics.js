const express = require('express');
const { requireAdmin } = require('../../middleware/adminAuth');
const report = require('../../services/analyticsReport');

const router = express.Router();
router.use(requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;

function range(req) {
  const to = Number(req.query.to) || Date.now() + 1;
  const from = req.query.from !== undefined && req.query.from !== '' ? Number(req.query.from) : to - 7 * DAY_MS;
  return { from: Number.isFinite(from) ? from : to - 7 * DAY_MS, to };
}

// GET /api/admin/analytics?from&to&tz&b&cmp - everything the dashboard's
// range-based tabs show. tz is minutes east of UTC; b is the comma-separated
// list of chart bucket start times, chosen by the browser.
router.get('/', (req, res, next) => {
  try {
    const { from, to } = range(req);
    const bounds = String(req.query.b || '').split(',').filter(Boolean).map(Number);
    res.json(report.computeStats({ from, to, tz: Number(req.query.tz) || 0, compare: req.query.cmp !== '0', bounds }));
  } catch (e) { next(e); }
});

router.get('/live', (req, res, next) => {
  try { res.json(report.liveStats()); } catch (e) { next(e); }
});

router.get('/sessions', (req, res, next) => {
  try { const { from, to } = range(req); res.json({ sessions: report.recentSessions(from, to) }); } catch (e) { next(e); }
});

router.get('/session', (req, res, next) => {
  try {
    const t = report.sessionTimeline(String(req.query.sid || ''));
    if (!t) return res.status(404).json({ error: 'Visit not found' });
    res.json(t);
  } catch (e) { next(e); }
});

router.get('/export', (req, res, next) => {
  try {
    const { from, to } = range(req);
    const kind = req.query.kind === 'events' ? 'events' : 'sessions';
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="jlistings-${kind === 'events' ? 'events' : 'visits'}.csv"`);
    res.send(report.exportCsv(kind, from, to));
  } catch (e) { next(e); }
});

router.post('/reset', (req, res, next) => {
  try { report.resetStats(); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
