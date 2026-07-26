const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { formatPostAdmin } = require('../../services/postFormat');
const { computeExpiry, DAY_MS, sendInvoiceForPost, insertPost, attachImages, attachSimchaSurprises, recordPayment } = require('../../services/postLifecycle');
const { sendMail } = require('../../utils/mailer');
const { POST_STATUSES } = require('../../utils/constants');
const runtimeConfig = require('../../services/runtimeConfig');
const appUrl = () => runtimeConfig.get('app_url', 'APP_URL') || '';
const { upload, processAndSaveImage } = require('../../middleware/upload');
const { findCategory } = require('../../services/categories');

const router = express.Router();
router.use(requireAdmin);

function imagesFor(postId) {
  return db.prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order').all(postId);
}

// Admin-created posts skip payment entirely and go straight live with any
// uploaded images pre-approved (admin is trusted, unlike public submissions).
router.post('/create', upload.array('images', 6), async (req, res, next) => {
  try {
    const type = req.body.type === 'simcha' ? 'simcha' : 'classified';
    let fields = {};
    try {
      fields = req.body.fields ? JSON.parse(req.body.fields) : {};
    } catch (e) {
      return res.status(400).json({ error: 'fields must be valid JSON' });
    }

    const title = String(req.body.title || '').trim();
    if (type === 'classified' && !title) return res.status(400).json({ error: 'Title is required' });

    const catDef = type === 'classified' ? findCategory(req.body.category) : null;
    if (type === 'classified' && !catDef) return res.status(400).json({ error: 'Invalid category' });

    const uploaded = [];
    for (const file of req.files || []) {
      if (type === 'classified' && !catDef.hasImages) return res.status(400).json({ error: `${catDef.label} does not support images` });
      uploaded.push({ filename: await processAndSaveImage(file.buffer), originalName: file.originalname });
    }

    const posterEmail = String(req.body.posterEmail || req.admin.email || '').toLowerCase();
    if (!posterEmail) return res.status(400).json({ error: 'A poster email is required' });

    const contact = {};
    if (req.body.contactPhone) contact.phone = req.body.contactPhone;
    if (req.body.contactPhoneExt) contact.phoneExt = req.body.contactPhoneExt;
    if (req.body.contactEmail) contact.email = req.body.contactEmail;
    if (req.body.contactUrl) contact.url = req.body.contactUrl;

    const taxonomyId = req.body.taxonomyId ? Number(req.body.taxonomyId) : null;
    const payload = {
      category: type === 'classified' ? req.body.category : 'simcha',
      taxonomyId,
      title,
      description: req.body.description || '',
      fields,
      locationText: req.body.locationText || null,
      locationCity: req.body.locationCity || null,
      locationState: req.body.locationState || null,
      locationLat: req.body.locationLat ? Number(req.body.locationLat) : null,
      locationLng: req.body.locationLng ? Number(req.body.locationLng) : null,
      locationPlaceId: null,
      posterFirstName: req.body.posterFirstName || null,
      posterLastName: req.body.posterLastName || null,
      posterEmail,
      posterPhone: req.body.posterPhone || null,
      contact,
      pricingTierId: req.body.pricingTierId ? Number(req.body.pricingTierId) : null,
      wantsStrike: !!req.body.wantsStrike,
      wantsOversized: false,
    };

    if (type === 'simcha') {
      const taxonomy = taxonomyId ? db.prepare('SELECT name FROM taxonomies WHERE id = ?').get(taxonomyId) : null;
      payload.title = taxonomy ? taxonomy.name : title || 'Simcha';
    }

    const post = insertPost({ type, category: payload.category, payload, hasImages: uploaded.length > 0 });
    attachImages(post.id, uploaded);
    db.prepare('UPDATE post_images SET approved = 1 WHERE post_id = ?').run(post.id);

    if (type === 'simcha' && req.body.surpriseEmail) {
      attachSimchaSurprises(post.id, [{ email: req.body.surpriseEmail, senderDisplayName: payload.posterFirstName || '' }], payload.posterFirstName);
    }

    const durationDays = Number(req.body.durationDays) || 30;
    const now = Date.now();
    const expiresAt = now + durationDays * DAY_MS;
    db.prepare('UPDATE posts SET status = ?, published_at = ?, expires_at = ?, boosted_at = ?, updated_at = ? WHERE id = ?').run(
      'live', now, expiresAt, now, now, post.id
    );
    recordPayment({ postId: post.id, kind: 'listing', amountCents: 0, payerEmail: posterEmail, status: 'paid' });

    const finalPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
    res.status(201).json(formatPostAdmin(finalPost, imagesFor(post.id)));
  } catch (e) {
    next(e);
  }
});

router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));

  const where = [];
  const params = [];
  if (req.query.status) {
    where.push('status = ?');
    params.push(req.query.status);
  } else {
    // Abandoned checkouts (never paid) are noise - hide them unless an admin
    // explicitly filters for that status. They're auto-deleted after 48h anyway.
    where.push("status != 'pending_payment'");
  }
  if (req.query.type) { where.push('type = ?'); params.push(req.query.type); }
  if (req.query.category) { where.push('category = ?'); params.push(req.query.category); }
  if (req.query.q) {
    where.push('(title LIKE ? OR description LIKE ? OR poster_email LIKE ? OR poster_phone LIKE ? OR poster_first_name LIKE ? OR poster_last_name LIKE ? OR public_id LIKE ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like, like, like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM posts ${whereSql}`).get(...params).c;
  const posts = db
    .prepare(`SELECT * FROM posts ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);

  res.json({
    posts: posts.map((p) => formatPostAdmin(p, imagesFor(p.id))),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.get('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  const payments = db.prepare('SELECT * FROM post_payments WHERE post_id = ? ORDER BY created_at DESC').all(post.id);
  const reports = db.prepare('SELECT * FROM reports WHERE post_id = ? ORDER BY created_at DESC').all(post.id);
  res.json({ ...formatPostAdmin(post, imagesFor(post.id)), payments, reports });
});

router.put('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  if (b.status && !POST_STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });

  db.prepare(
    `UPDATE posts SET
      title = ?, description = ?, fields = ?,
      location_text = ?, location_city = ?, location_state = ?, location_lat = ?, location_lng = ?,
      contact_phone = ?, contact_phone_ext = ?, contact_email = ?, contact_url = ?, contact_url_approved = ?,
      taxonomy_id = ?, status = ?, admin_notes = ?, is_featured_strike = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    b.title ?? post.title,
    b.description ?? post.description,
    b.fields !== undefined ? JSON.stringify(b.fields) : post.fields,
    b.locationText ?? post.location_text,
    b.locationCity ?? post.location_city,
    b.locationState ?? post.location_state,
    b.locationLat !== undefined ? b.locationLat : post.location_lat,
    b.locationLng !== undefined ? b.locationLng : post.location_lng,
    b.contactPhone ?? post.contact_phone,
    b.contactPhoneExt ?? post.contact_phone_ext,
    b.contactEmail ?? post.contact_email,
    b.contactUrl ?? post.contact_url,
    b.contactUrlApproved !== undefined ? (b.contactUrlApproved ? 1 : 0) : post.contact_url_approved,
    b.taxonomyId !== undefined ? b.taxonomyId : post.taxonomy_id,
    b.status ?? post.status,
    b.adminNotes ?? post.admin_notes,
    b.isFeaturedStrike !== undefined ? (b.isFeaturedStrike ? 1 : 0) : post.is_featured_strike,
    Date.now(),
    req.params.id
  );
  res.json(formatPostAdmin(db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id), imagesFor(req.params.id)));
});

router.delete('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (req.query.hard === '1') {
    db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
    return res.json({ deleted: true, hard: true });
  }
  db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run('removed', Date.now(), req.params.id);
  res.json({ deleted: true, hard: false });
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE post_images SET approved = 1 WHERE post_id = ?').run(post.id);
    const now = Date.now();
    const expiresAt = computeExpiry(post);
    db.prepare('UPDATE posts SET status = ?, published_at = ?, expires_at = ?, boosted_at = COALESCE(boosted_at, ?), updated_at = ? WHERE id = ?').run(
      'live', now, expiresAt, now, now, post.id
    );
    const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
    await sendMail({
      to: updated.poster_email,
      subject: `Your listing is now live: ${updated.title}`,
      html: `<p>Great news - your listing "${updated.title}" has been approved and is now live.</p><p><a href="${appUrl()}/${updated.type === 'simcha' ? 'simchas' : 'classifieds'}/${updated.public_id}">View it here</a></p>`,
    }).catch(() => {});
    res.json(formatPostAdmin(updated, imagesFor(post.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const reason = String(req.body.reason || '').slice(0, 1000);
    db.prepare('UPDATE posts SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?').run('rejected', reason, Date.now(), post.id);
    await sendMail({
      to: post.poster_email,
      subject: `Your listing was not approved: ${post.title}`,
      html: `<p>Unfortunately your listing "${post.title}" was not approved.</p>${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}<p>Please contact us with any questions.</p>`,
    }).catch(() => {});
    res.json(formatPostAdmin(db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id), imagesFor(post.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/boost', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE posts SET boosted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), post.id);
  res.json(formatPostAdmin(db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id), imagesFor(post.id)));
});

router.post('/:id/extend', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  const days = Number(req.body.days) || 0;
  const base = post.expires_at && post.expires_at > Date.now() ? post.expires_at : Date.now();
  const newExpiry = base + days * DAY_MS;
  db.prepare('UPDATE posts SET expires_at = ?, updated_at = ? WHERE id = ?').run(newExpiry, Date.now(), post.id);
  res.json(formatPostAdmin(db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id), imagesFor(post.id)));
});

router.post('/:id/save-forever', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE posts SET saved_forever = 1, expires_at = NULL, updated_at = ? WHERE id = ?').run(Date.now(), post.id);
  res.json(formatPostAdmin(db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id), imagesFor(post.id)));
});

router.post('/:id/images/:imageId/approve', (req, res) => {
  db.prepare('UPDATE post_images SET approved = 1 WHERE id = ? AND post_id = ?').run(req.params.imageId, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id/images/:imageId', (req, res) => {
  db.prepare('DELETE FROM post_images WHERE id = ? AND post_id = ?').run(req.params.imageId, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
