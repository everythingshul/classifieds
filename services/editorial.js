// Editorials: validation, formatting, and lifecycle (insert/notify) grouped
// into one service module since they're all part of the same feature area.

const db = require('../db');
const { newPublicId } = require('../utils/ids');
const { sendMail, notifyAdmin } = require('../utils/mailer');
const { ValidationError } = require('./postValidation');
const { isValidEmail, isValidUrl } = require('../utils/validate');
const { validatePhone } = require('../utils/phone');
const runtimeConfig = require('./runtimeConfig');

const appUrl = () => runtimeConfig.get('app_url', 'APP_URL') || '';

// -- Validation --

// Same rationale as services/postValidation.js's normalizeLineEndings:
// browsers convert \n to \r\n serializing a textarea into multipart/form-data,
// which would otherwise inflate the server-side length past what the poster
// saw and was shown as their limit.
function normalizeLineEndings(v) {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n') : v;
}

function requireString(v, field, errors, { max, min } = {}) {
  v = normalizeLineEndings(v);
  if (typeof v !== 'string' || !v.trim()) {
    errors.push(`${field} is required`);
    return '';
  }
  const trimmed = v.trim();
  if (max && trimmed.length > max) errors.push(`${field} must be ${max} characters or fewer (currently ${trimmed.length})`);
  if (min && trimmed.length < min) errors.push(`${field} must be at least ${min} characters`);
  return trimmed;
}

// Only a small set of known, embeddable video hosts are accepted - anything
// else would just be a dead/unembeddable link on the detail page.
const VIDEO_HOST_RE = /^(www\.)?(youtube\.com|youtu\.be|vimeo\.com)$/i;
function validateVideoUrl(raw) {
  if (!raw || !String(raw).trim()) return null;
  const url = String(raw).trim();
  if (!isValidUrl(url)) return { error: 'must be a valid URL' };
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (!VIDEO_HOST_RE.test(u.hostname)) return { error: 'must be a YouTube or Vimeo link' };
    return { url: u.href };
  } catch (e) {
    return { error: 'must be a valid URL' };
  }
}

function validateEditorialSubmission(body, charLimits) {
  const errors = [];
  const title = requireString(body.title, 'title', errors, { max: charLimits.title });
  const editorialBody = requireString(body.body, 'body', errors, { max: charLimits.body, min: 40 });
  const penName = requireString(body.penName, 'pen name', errors, { max: 60 });
  const posterFirstName = requireString(body.posterFirstName, 'first name', errors, { max: 60 });
  const posterLastName = requireString(body.posterLastName, 'last name', errors, { max: 60 });
  const posterEmail = String(body.posterEmail || '').trim().toLowerCase();
  if (!isValidEmail(posterEmail)) errors.push('a valid email is required');
  const notesToAdmin = body.notesToAdmin ? normalizeLineEndings(String(body.notesToAdmin)).trim().slice(0, 1000) : null;

  let posterPhone = null;
  if (body.posterPhone) {
    const p = validatePhone(body.posterPhone, body.posterPhoneCountry || 'US');
    if (!p.valid) errors.push('phone number is not valid');
    else posterPhone = p.e164;
  }

  const videoUrls = [];
  const rawVideoUrls = Array.isArray(body.videoUrls) ? body.videoUrls : [];
  for (const raw of rawVideoUrls.slice(0, 3)) {
    const result = validateVideoUrl(raw);
    if (!result) continue;
    if (result.error) errors.push(`video URL ${result.error}`);
    else videoUrls.push(result.url);
  }

  if (errors.length) throw new ValidationError(errors);

  return {
    title,
    body: editorialBody,
    penName,
    posterFirstName,
    posterLastName,
    posterEmail,
    posterPhone,
    notesToAdmin,
    videoUrls,
  };
}

function validateEditorialComment(body) {
  const errors = [];
  const penName = requireString(body.penName, 'pen name', errors, { max: 60 });
  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) errors.push('a valid email is required');
  const commentBody = requireString(body.body, 'comment', errors, { max: 2000, min: 2 });
  if (errors.length) throw new ValidationError(errors);
  return { penName, email, body: commentBody };
}

// -- Formatting --

function formatEditorialPublic(ed, images = [], videos = []) {
  return {
    id: ed.public_id,
    title: ed.title,
    body: ed.body,
    penName: ed.pen_name,
    isFeatured: !!ed.is_featured,
    publishedAt: ed.published_at,
    images: images.map((i) => `/uploads/${i.filename}`),
    videoUrls: videos.map((v) => v.url),
  };
}

function formatEditorialAdmin(ed, images = [], videos = []) {
  return {
    id: ed.id,
    publicId: ed.public_id,
    title: ed.title,
    body: ed.body,
    penName: ed.pen_name,
    poster: {
      firstName: ed.poster_first_name,
      lastName: ed.poster_last_name,
      email: ed.poster_email,
      phone: ed.poster_phone,
    },
    notesToAdmin: ed.notes_to_admin,
    status: ed.status,
    rejectionReason: ed.rejection_reason,
    isFeatured: !!ed.is_featured,
    viewCount: ed.view_count,
    clickCount: ed.click_count,
    adminNotes: ed.admin_notes,
    publishedAt: ed.published_at,
    createdAt: ed.created_at,
    updatedAt: ed.updated_at,
    images: images.map((i) => ({ id: i.id, url: `/uploads/${i.filename}` })),
    videoUrls: videos.map((v) => v.url),
  };
}

function formatCommentPublic(c) {
  return { id: c.id, penName: c.pen_name, body: c.body, createdAt: c.created_at };
}

function formatCommentAdmin(c) {
  return {
    id: c.id,
    editorialId: c.editorial_id,
    penName: c.pen_name,
    email: c.email,
    body: c.body,
    status: c.status,
    createdAt: c.created_at,
  };
}

// -- Lifecycle (insert + notify) --

function insertEditorial(payload) {
  const now = Date.now();
  const publicId = newPublicId();
  const info = db
    .prepare(
      `INSERT INTO editorials (
        public_id, title, body, pen_name, poster_first_name, poster_last_name, poster_email, poster_phone,
        notes_to_admin, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)`
    )
    .run(
      publicId,
      payload.title,
      payload.body,
      payload.penName,
      payload.posterFirstName,
      payload.posterLastName,
      payload.posterEmail,
      payload.posterPhone || null,
      payload.notesToAdmin || null,
      now,
      now
    );
  return db.prepare('SELECT * FROM editorials WHERE id = ?').get(info.lastInsertRowid);
}

function attachEditorialImages(editorialId, filenames) {
  if (!filenames || !filenames.length) return;
  const now = Date.now();
  const stmt = db.prepare('INSERT INTO editorial_images (editorial_id, filename, sort_order, created_at) VALUES (?, ?, ?, ?)');
  filenames.forEach((f, i) => stmt.run(editorialId, f, i, now));
}

function attachEditorialVideos(editorialId, urls) {
  if (!urls || !urls.length) return;
  const now = Date.now();
  const stmt = db.prepare('INSERT INTO editorial_videos (editorial_id, url, sort_order, created_at) VALUES (?, ?, ?, ?)');
  urls.forEach((u, i) => stmt.run(editorialId, u, i, now));
}

async function notifyAdminNewEditorial(editorial) {
  const url = `${appUrl()}/admin/#/editorials?q=${editorial.public_id}`;
  try {
    await notifyAdmin(
      'New editorial awaiting approval',
      `<p><b>${editorial.title}</b> was submitted by ${editorial.poster_first_name} ${editorial.poster_last_name} (pen name: ${editorial.pen_name}).</p>
       <p><a href="${url}">Review it in the admin portal</a></p>`
    );
  } catch (e) {
    console.error('[editorial] Failed to notify admin of new editorial', editorial.public_id, '-', e.message);
  }
}

async function notifyPosterApproved(editorial) {
  const url = `${appUrl()}/editorials/${editorial.public_id}`;
  try {
    await sendMail({
      to: editorial.poster_email,
      subject: `Your editorial "${editorial.title}" is live!`,
      html: `<p>Great news - your editorial has been approved and is now live.</p><p><a href="${url}">${url}</a></p>`,
    });
  } catch (e) {
    console.error('[editorial] Failed to send approval email for editorial', editorial.public_id, '-', e.message);
  }
}

async function notifyPosterRejected(editorial) {
  try {
    await sendMail({
      to: editorial.poster_email,
      subject: `About your editorial submission: "${editorial.title}"`,
      html: `<p>Thanks for submitting your editorial. Unfortunately it wasn't approved for publishing${editorial.rejection_reason ? `: ${editorial.rejection_reason}` : '.'}</p>`,
    });
  } catch (e) {
    console.error('[editorial] Failed to send rejection email for editorial', editorial.public_id, '-', e.message);
  }
}

async function notifyAdminNewComment(editorial, comment) {
  const url = `${appUrl()}/admin/#/editorials?q=${editorial.public_id}`;
  try {
    await notifyAdmin(
      'New comment awaiting approval',
      `<p><b>${comment.pen_name}</b> commented on "${editorial.title}":</p>
       <p>${comment.body}</p>
       <p><a href="${url}">Review it in the admin portal</a></p>`
    );
  } catch (e) {
    console.error('[editorial] Failed to notify admin of new comment on editorial', editorial.public_id, '-', e.message);
  }
}

module.exports = {
  validateEditorialSubmission,
  validateEditorialComment,
  validateVideoUrl,
  formatEditorialPublic,
  formatEditorialAdmin,
  formatCommentPublic,
  formatCommentAdmin,
  insertEditorial,
  attachEditorialImages,
  attachEditorialVideos,
  notifyAdminNewEditorial,
  notifyPosterApproved,
  notifyPosterRejected,
  notifyAdminNewComment,
};
