const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { upload, processAndSaveImage } = require('../../middleware/upload');
const {
  formatEditorialAdmin,
  formatCommentAdmin,
  notifyPosterApproved,
  notifyPosterRejected,
  validateEditorialSubmission,
  insertEditorial,
  attachEditorialImages,
  attachEditorialVideos,
} = require('../../services/editorial');
const { ValidationError } = require('../../services/postValidation');
const { sanitizeRichText } = require('../../utils/htmlSanitize');
const { getSetting } = require('../../services/pricing');
const { sendMail } = require('../../utils/mailer');
const runtimeConfig = require('../../services/runtimeConfig');
const appUrl = () => runtimeConfig.get('app_url', 'APP_URL') || '';

const router = express.Router();
router.use(requireAdmin);

function imagesFor(editorialId) {
  return db.prepare('SELECT * FROM editorial_images WHERE editorial_id = ? ORDER BY sort_order').all(editorialId);
}
function videosFor(editorialId) {
  return db.prepare('SELECT * FROM editorial_videos WHERE editorial_id = ? ORDER BY sort_order').all(editorialId);
}

router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const where = [];
  const params = [];
  if (req.query.status) {
    where.push('status = ?');
    params.push(req.query.status);
  }
  if (req.query.q) {
    where.push('(title LIKE ? OR pen_name LIKE ? OR poster_email LIKE ? OR public_id = ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like, like, req.query.q);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM editorials ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * FROM editorials ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  res.json({
    editorials: rows.map((r) => formatEditorialAdmin(r, imagesFor(r.id), videosFor(r.id))),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

// Admin-authored editorials skip the moderation queue entirely - they go
// straight to 'live' (or 'scheduled', if a future date is given), the same
// way an admin-created post skips pending_approval.
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

    const now = Date.now();
    const scheduledAt = req.body.scheduledAt ? Number(req.body.scheduledAt) : null;
    const opts = scheduledAt && scheduledAt > now
      ? { status: 'scheduled', scheduledAt }
      : { status: 'live', publishedAt: now };

    const editorial = insertEditorial(payload, opts);
    attachEditorialImages(editorial.id, uploaded);
    attachEditorialVideos(editorial.id, payload.videoUrls);

    res.status(201).json(formatEditorialAdmin(editorial, imagesFor(editorial.id), videosFor(editorial.id)));
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: 'Validation failed', details: e.errors });
    next(e);
  }
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM editorials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const comments = db.prepare('SELECT * FROM editorial_comments WHERE editorial_id = ? ORDER BY created_at DESC').all(row.id);
  res.json({ ...formatEditorialAdmin(row, imagesFor(row.id), videosFor(row.id)), comments: comments.map(formatCommentAdmin) });
});

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM editorials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  // A scheduledAt in the future implies status 'scheduled' regardless of what
  // status was posted, so the cron job (not this save) is what actually
  // publishes it - mirrors how admin post scheduling works.
  const scheduledAt = b.scheduledAt !== undefined ? (b.scheduledAt ? Number(b.scheduledAt) : null) : row.scheduled_at;
  const status = scheduledAt && scheduledAt > Date.now() ? 'scheduled' : (b.status ?? row.status);
  db.prepare(
    `UPDATE editorials SET
      title = ?, body = ?, pen_name = ?, status = ?, is_featured = ?, admin_notes = ?, rejection_reason = ?, scheduled_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    b.title ?? row.title,
    b.body !== undefined ? sanitizeRichText(b.body) : row.body,
    b.penName ?? row.pen_name,
    status,
    b.isFeatured !== undefined ? (b.isFeatured ? 1 : 0) : row.is_featured,
    b.adminNotes ?? row.admin_notes,
    b.rejectionReason ?? row.rejection_reason,
    status === 'scheduled' ? scheduledAt : row.scheduled_at,
    Date.now(),
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM editorials WHERE id = ?').get(req.params.id);
  res.json(formatEditorialAdmin(updated, imagesFor(updated.id), videosFor(updated.id)));
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM editorials WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const scheduledAt = req.body.scheduledAt ? Number(req.body.scheduledAt) : null;
    if (scheduledAt && scheduledAt > Date.now()) {
      db.prepare("UPDATE editorials SET status = 'scheduled', scheduled_at = ?, updated_at = ? WHERE id = ?").run(scheduledAt, Date.now(), row.id);
    } else {
      db.prepare("UPDATE editorials SET status = 'live', published_at = ?, updated_at = ? WHERE id = ?").run(Date.now(), Date.now(), row.id);
    }
    const updated = db.prepare('SELECT * FROM editorials WHERE id = ?').get(row.id);
    if (updated.status === 'live') notifyPosterApproved(updated).catch(() => {});
    res.json(formatEditorialAdmin(updated, imagesFor(updated.id), videosFor(updated.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM editorials WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const reason = String(req.body.reason || '').slice(0, 1000);
    db.prepare("UPDATE editorials SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?").run(reason, Date.now(), row.id);
    const updated = db.prepare('SELECT * FROM editorials WHERE id = ?').get(row.id);
    notifyPosterRejected(updated).catch(() => {});
    res.json(formatEditorialAdmin(updated, imagesFor(updated.id), videosFor(updated.id)));
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM editorials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (req.query.hard === '1') {
    db.prepare('DELETE FROM editorials WHERE id = ?').run(req.params.id);
    return res.json({ deleted: true, hard: true });
  }
  db.prepare("UPDATE editorials SET status = 'removed', updated_at = ? WHERE id = ?").run(Date.now(), req.params.id);
  res.json({ deleted: true, hard: false });
});

router.post('/:id/images', upload.array('images', 6), async (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM editorials WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const existingCount = imagesFor(row.id).length;
    if (existingCount + (req.files || []).length > 6) return res.status(400).json({ error: 'Maximum 6 images per editorial' });
    const now = Date.now();
    const stmt = db.prepare('INSERT INTO editorial_images (editorial_id, filename, sort_order, created_at) VALUES (?, ?, ?, ?)');
    let sort = existingCount;
    for (const file of req.files || []) {
      const filename = await processAndSaveImage(file.buffer);
      stmt.run(row.id, filename, sort++, now);
    }
    res.json({ images: imagesFor(row.id).map((i) => ({ id: i.id, url: `/uploads/${i.filename}` })) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id/images/:imageId', (req, res) => {
  db.prepare('DELETE FROM editorial_images WHERE id = ? AND editorial_id = ?').run(req.params.imageId, req.params.id);
  res.json({ deleted: true });
});

// -- Comment moderation --

router.get('/:id/comments', (req, res) => {
  const comments = db.prepare('SELECT * FROM editorial_comments WHERE editorial_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(comments.map(formatCommentAdmin));
});

router.post('/comments/:commentId/approve', async (req, res, next) => {
  try {
    const comment = db.prepare('SELECT * FROM editorial_comments WHERE id = ?').get(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Not found' });
    db.prepare("UPDATE editorial_comments SET status = 'live' WHERE id = ?").run(comment.id);
    const editorial = db.prepare('SELECT * FROM editorials WHERE id = ?').get(comment.editorial_id);
    if (editorial) {
      sendMail({
        to: comment.email,
        subject: `Your comment on "${editorial.title}" is live`,
        html: `<p>Your comment has been approved and is now visible.</p><p><a href="${appUrl()}/editorials/${editorial.public_id}">View it here</a></p>`,
      }).catch(() => {});
    }
    res.json(formatCommentAdmin(db.prepare('SELECT * FROM editorial_comments WHERE id = ?').get(comment.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/comments/:commentId/reject', (req, res) => {
  const comment = db.prepare('SELECT * FROM editorial_comments WHERE id = ?').get(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE editorial_comments SET status = 'rejected' WHERE id = ?").run(comment.id);
  res.json(formatCommentAdmin(db.prepare('SELECT * FROM editorial_comments WHERE id = ?').get(comment.id)));
});

router.delete('/comments/:commentId', (req, res) => {
  db.prepare('DELETE FROM editorial_comments WHERE id = ?').run(req.params.commentId);
  res.json({ deleted: true });
});

module.exports = router;
