// Shared by the admin "+ New Post" page (routes/admin/posts.js's /create)
// and the bulk-posting tool (routes/public/bulkPost.js) - both create posts
// the exact same way: no payment, no character limits enforced server-side,
// images pre-approved since whoever is using either tool is trusted the
// same way an admin is. body/files mirror what multer + express give a
// route handler (req.body, req.files).
const db = require('../db');
const { DAY_MS, insertPost, attachImages, attachSimchaSurprises, recordPayment } = require('./postLifecycle');
const { formatPostAdmin } = require('./postFormat');
const { findCategory, findListingCategory } = require('./taxonomy');
const { validateCategoryFields, parseAmountOrText } = require('./postValidation');
const { normalizeUrl } = require('../utils/validate');
const { validatePhone } = require('../utils/phone');
const { processAndSaveImage } = require('../middleware/upload');
const { CURRENCY_CODES } = require('../utils/constants');

class AdminPostCreateError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function normalizeAdminPhone(raw) {
  if (!raw) return raw;
  const parsed = validatePhone(raw, 'US');
  return parsed.valid ? parsed.e164 : raw;
}

function imagesFor(postId) {
  return db.prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order').all(postId);
}

// autoApprove: true for the admin "+ New Post" page (a real, logged-in admin
// is trusted to publish their own website links/photos immediately) - false
// for the bulk-posting tool, whose password is a far more casually-shared,
// lower-trust credential (see middleware/bulkAuth.js) and is specifically
// meant for fast, high-volume entry where mistakes are more likely to slip
// through unnoticed. Bulk-created content now goes through the same
// Moderation Queue review as public submissions instead of skipping it.
async function createAdminPost(body, files, creatorEmail, { autoApprove = true } = {}) {
  const type = body.type === 'simcha' ? 'simcha' : body.type === 'listing' ? 'listing' : 'classified';
  let fields = {};
  try {
    fields = body.fields ? JSON.parse(body.fields) : {};
  } catch (e) {
    throw new AdminPostCreateError(400, 'fields must be valid JSON');
  }

  const title = String(body.title || '').trim();
  if (type !== 'simcha' && !title) throw new AdminPostCreateError(400, 'Title is required');

  const catDef = type === 'classified' ? findCategory(body.category) : type === 'listing' ? findListingCategory(body.category) : null;
  if (type !== 'simcha' && !catDef) throw new AdminPostCreateError(400, 'Invalid category');

  if (type === 'classified') {
    const fieldErrors = [];
    fields = validateCategoryFields(body.category, fields, fieldErrors, catDef);
    if (fieldErrors.length) throw new AdminPostCreateError(400, 'Validation failed', fieldErrors);
  } else if (type === 'listing') {
    const nextFields = {};
    if (catDef.hasPrice) {
      const { amount, text } = parseAmountOrText(fields.price);
      if (amount !== null && amount < 0) throw new AdminPostCreateError(400, 'Validation failed', ['price must be a positive number']);
      nextFields.price = amount;
      nextFields.priceText = text;
      if (amount !== null) nextFields.currency = CURRENCY_CODES.includes(fields.currency) ? fields.currency : 'USD';
    }
    fields = nextFields;
  }

  const uploaded = [];
  for (const file of files || []) {
    if (type !== 'simcha' && !catDef.hasImages) throw new AdminPostCreateError(400, `${catDef.label} does not support images`);
    uploaded.push({ filename: await processAndSaveImage(file.buffer), originalName: file.originalname });
  }

  const posterEmail = String(body.posterEmail || creatorEmail || '').toLowerCase();
  if (!posterEmail) throw new AdminPostCreateError(400, 'A poster email is required');

  const contact = {};
  if (body.contactPhone) contact.phone = normalizeAdminPhone(body.contactPhone);
  if (body.contactPhoneExt) contact.phoneExt = body.contactPhoneExt;
  if (body.contactEmail) contact.email = body.contactEmail;
  if (body.contactUrl) contact.url = normalizeUrl(body.contactUrl);

  const taxonomyId = body.taxonomyId ? Number(body.taxonomyId) : null;
  const payload = {
    category: type === 'simcha' ? 'simcha' : body.category,
    taxonomyId,
    title,
    description: body.description || '',
    fields,
    locationText: body.locationText || null,
    locationCity: body.locationCity || null,
    locationState: body.locationState || null,
    locationLat: body.locationLat ? Number(body.locationLat) : null,
    locationLng: body.locationLng ? Number(body.locationLng) : null,
    locationPlaceId: null,
    posterFirstName: body.posterFirstName || null,
    posterLastName: body.posterLastName || null,
    posterEmail,
    posterPhone: body.posterPhone ? normalizeAdminPhone(body.posterPhone) : null,
    contact,
    pricingTierId: body.pricingTierId ? Number(body.pricingTierId) : null,
    wantsStrike: !!body.wantsStrike,
    wantsOversized: false,
  };

  if (type === 'simcha') {
    const taxonomy = taxonomyId ? db.prepare('SELECT name FROM taxonomies WHERE id = ?').get(taxonomyId) : null;
    payload.title = taxonomy ? taxonomy.name : title || 'Simcha';
  }

  const post = insertPost({ type, category: payload.category, payload, hasImages: uploaded.length > 0 });
  attachImages(post.id, uploaded);
  if (autoApprove) {
    db.prepare('UPDATE post_images SET approved = 1 WHERE post_id = ?').run(post.id);
    // Admin-entered links skip the same moderation queue admin-uploaded
    // images already skip above - whoever is using this tool is trusted, so
    // it shouldn't need a second self-approval step before it shows up publicly.
    if (contact.url) db.prepare('UPDATE posts SET contact_url_approved = 1 WHERE id = ?').run(post.id);
  }

  if (type === 'simcha' && body.surpriseEmail) {
    attachSimchaSurprises(post.id, [{ email: body.surpriseEmail, senderDisplayName: payload.posterFirstName || '' }], payload.posterFirstName);
  }

  const durationDays = Number(body.durationDays) || 30;
  const now = Date.now();
  // Scheduling a future go-live is available to either caller of this
  // function (not exposed to the public wizard). expires_at is computed off
  // scheduledAt (not "now") so it reflects the actual go-live time
  // regardless of how long the post sits scheduled - the publish cron just
  // flips status/published_at and leaves it as-is.
  const scheduledAt = body.scheduledAt ? Number(body.scheduledAt) : null;
  if (scheduledAt && scheduledAt > now) {
    const expiresAt = scheduledAt + durationDays * DAY_MS;
    db.prepare('UPDATE posts SET status = ?, scheduled_at = ?, expires_at = ?, updated_at = ? WHERE id = ?').run(
      'scheduled', scheduledAt, expiresAt, now, post.id
    );
  } else {
    const expiresAt = now + durationDays * DAY_MS;
    db.prepare('UPDATE posts SET status = ?, published_at = ?, expires_at = ?, boosted_at = ?, updated_at = ? WHERE id = ?').run(
      'live', now, expiresAt, now, now, post.id
    );
  }
  recordPayment({ postId: post.id, kind: 'listing', amountCents: 0, payerEmail: posterEmail, status: 'paid' });

  const finalPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
  return formatPostAdmin(finalPost, imagesFor(post.id));
}

module.exports = { createAdminPost, AdminPostCreateError };
