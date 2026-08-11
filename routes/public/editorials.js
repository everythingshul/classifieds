const express = require('express');
const db = require('../../db');
const { upload, processAndSaveImage } = require('../../middleware/upload');
const { ValidationError } = require('../../services/postValidation');
const {
  validateEditorialSubmission,
  validateEditorialComment,
  formatEditorialPublic,
  formatCommentPublic,
  insertEditorial,
  attachEditorialImages,
  attachEditorialVideos,
  notifyAdminNewEditorial,
  notifyAdminNewComment,
} = require('../../services/editorial');
const { getSetting } = require('../../services/pricing');
const { sanitizeRichText } = require('../../utils/htmlSanitize');

const router = express.Router();

function imagesFor(editorialId) {
  return db.prepare('SELECT * FROM editorial_images WHERE editorial_id = ? ORDER BY sort_order').all(editorialId);
}
function videosFor(editorialId) {
  return db.prepare('SELECT * FROM editorial_videos WHERE editorial_id = ? ORDER BY sort_order').all(editorialId);
}

router.get('/instructions', (req, res) => {
  res.json({ html: sanitizeRichText(getSetting('editorial_instructions_html', '')) });
});

// List: live editorials only. `featured` is a separate top-N slice (not
// filtered out of `posts`) so the browse page can show a featured strip
// alongside the regular feed without a second round trip.
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 12));

  const total = db.prepare("SELECT COUNT(*) AS c FROM editorials WHERE status = 'live'").get().c;
  const rows = db
    .prepare("SELECT * FROM editorials WHERE status = 'live' ORDER BY published_at DESC LIMIT ? OFFSET ?")
    .all(pageSize, (page - 1) * pageSize);
  const featuredRows = db
    .prepare("SELECT * FROM editorials WHERE status = 'live' AND is_featured = 1 ORDER BY published_at DESC LIMIT 3")
    .all();

  res.json({
    posts: rows.map((r) => formatEditorialPublic(r, imagesFor(r.id), videosFor(r.id))),
    featured: featuredRows.map((r) => formatEditorialPublic(r, imagesFor(r.id), videosFor(r.id))),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.get('/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM editorials WHERE public_id = ? AND status = 'live'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const comments = db
    .prepare("SELECT * FROM editorial_comments WHERE editorial_id = ? AND status = 'live' ORDER BY created_at ASC")
    .all(row.id);
  res.json({
    ...formatEditorialPublic(row, imagesFor(row.id), videosFor(row.id)),
    comments: comments.map(formatCommentPublic),
  });
});

router.post('/', upload.array('images', 6), async (req, res, next) => {
  try {
    let body = req.body;
    if (req.body.videoUrls) {
      try {
        body = { ...req.body, videoUrls: JSON.parse(req.body.videoUrls) };
      } catch (e) {
        return res.status(400).json({ error: 'videoUrls must be valid JSON' });
      }
    }
    const charLimits = getSetting('editorial_char_limits', { title: 150, body: 20000 });
    const payload = validateEditorialSubmission(body, charLimits);

    const uploaded = [];
    for (const file of req.files || []) uploaded.push(await processAndSaveImage(file.buffer));

    const editorial = insertEditorial(payload);
    attachEditorialImages(editorial.id, uploaded);
    attachEditorialVideos(editorial.id, payload.videoUrls);

    notifyAdminNewEditorial(editorial).catch(() => {});
    res.status(201).json({ id: editorial.public_id, status: editorial.status });
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: 'Validation failed', details: e.errors });
    next(e);
  }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    const editorial = db.prepare("SELECT * FROM editorials WHERE public_id = ? AND status = 'live'").get(req.params.id);
    if (!editorial) return res.status(404).json({ error: 'Not found' });
    const payload = validateEditorialComment(req.body);
    const now = Date.now();
    db.prepare(
      "INSERT INTO editorial_comments (editorial_id, pen_name, email, body, status, created_at) VALUES (?, ?, ?, ?, 'pending_approval', ?)"
    ).run(editorial.id, payload.penName, payload.email, payload.body, now);
    const comment = { pen_name: payload.penName, body: payload.body };
    notifyAdminNewComment(editorial, comment).catch(() => {});
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: 'Validation failed', details: e.errors });
    next(e);
  }
});

// Batched by public_id (matches /api/posts/impressions,/clicks) so a whole
// card grid can register in one request instead of one per card.
router.post('/impressions', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 100) : [];
  if (!ids.length) return res.json({ ok: true });
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE editorials SET view_count = view_count + 1 WHERE public_id IN (${placeholders}) AND status = 'live'`).run(...ids);
  res.json({ ok: true });
});

router.post('/clicks', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 100) : [];
  if (!ids.length) return res.json({ ok: true });
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE editorials SET click_count = click_count + 1 WHERE public_id IN (${placeholders}) AND status = 'live'`).run(...ids);
  res.json({ ok: true });
});

module.exports = router;
