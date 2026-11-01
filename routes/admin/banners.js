const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { bannerUpload, saveBannerImage } = require('../../middleware/upload');
const { newPublicId } = require('../../utils/ids');
const { PAGE_ZONE_KEYS, PAGE_ZONES, formatBannerAdmin } = require('../../services/banners');

const router = express.Router();
router.use(requireAdmin);

function statsFor(bannerIds) {
  if (!bannerIds.length) return {};
  const placeholders = bannerIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT banner_id, type, COUNT(*) AS c FROM analytics_events
       WHERE banner_id IN (${placeholders}) AND type IN ('banner_view', 'banner_click')
       GROUP BY banner_id, type`
    )
    .all(...bannerIds);
  const map = {};
  rows.forEach((r) => {
    map[r.banner_id] = map[r.banner_id] || { views: 0, clicks: 0 };
    if (r.type === 'banner_view') map[r.banner_id].views = r.c;
    else map[r.banner_id].clicks = r.c;
  });
  return map;
}

router.get('/zones', (req, res) => res.json({ zones: PAGE_ZONES }));

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM banners ORDER BY sort_order, id').all();
  const stats = statsFor(rows.map((r) => r.id));
  res.json({ banners: rows.map((r) => formatBannerAdmin(r, stats[r.id])) });
});

function parseBannerBody(req) {
  const linkUrl = String(req.body.linkUrl || '').trim();
  const position = req.body.position === 'sidebar' ? 'sidebar' : 'top';
  const allPages = req.body.allPages === '1' || req.body.allPages === 'true';
  let pages = [];
  try {
    pages = JSON.parse(req.body.pages || '[]');
  } catch (e) {
    pages = [];
  }
  pages = Array.isArray(pages) ? pages.filter((p) => PAGE_ZONE_KEYS.has(p)) : [];
  const errors = [];
  if (!linkUrl) errors.push('A link URL is required');
  if (!allPages && !pages.length) errors.push('Choose at least one page, or turn on "All pages"');
  return { linkUrl, position, allPages, pages, errors };
}

router.post('/', bannerUpload.single('image'), (req, res) => {
  const { linkUrl, position, allPages, pages, errors } = parseBannerBody(req);
  if (!req.file) errors.push('An image is required');
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  const filename = saveBannerImage(req.file);
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO banners (public_id, image_filename, link_url, position, pages, all_pages, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
    )
    .run(newPublicId(12), filename, linkUrl, position, JSON.stringify(pages), allPages ? 1 : 0, now, now);
  res.status(201).json(formatBannerAdmin(db.prepare('SELECT * FROM banners WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', bannerUpload.single('image'), (req, res) => {
  const row = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { linkUrl, position, allPages, pages, errors } = parseBannerBody(req);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  const filename = req.file ? saveBannerImage(req.file) : row.image_filename;
  db.prepare(
    `UPDATE banners SET image_filename = ?, link_url = ?, position = ?, pages = ?, all_pages = ?, updated_at = ? WHERE id = ?`
  ).run(filename, linkUrl, position, JSON.stringify(pages), allPages ? 1 : 0, Date.now(), row.id);
  res.json(formatBannerAdmin(db.prepare('SELECT * FROM banners WHERE id = ?').get(row.id)));
});

router.put('/:id/active', (req, res) => {
  const row = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE banners SET active = ?, updated_at = ? WHERE id = ?').run(req.body.active ? 1 : 0, Date.now(), row.id);
  res.json(formatBannerAdmin(db.prepare('SELECT * FROM banners WHERE id = ?').get(row.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
