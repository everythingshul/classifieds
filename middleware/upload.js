const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Only JPG, PNG or WEBP images are allowed'));
    cb(null, true);
  },
});

// Every post image goes to a moderation queue before it's visible (see posts.status /
// post_images.approved) - required both to enforce the no-photos-of-people content
// policy (a human call, not something we can reliably automate) and general moderation.
// We still strip EXIF/GPS metadata and re-encode here for privacy and consistent sizing.
async function processAndSaveImage(fileBuffer) {
  const filename = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  const dest = path.join(UPLOAD_DIR, filename);
  await sharp(fileBuffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest);
  return filename;
}

// Banners (admin-uploaded ad/promo images) skip the post-image pipeline
// entirely - they're admin-authored (no moderation queue needed) and must
// support animated GIFs, which re-encoding through sharp above would
// flatten to a single static frame. This just validates the type and
// writes the raw bytes straight to disk, same UPLOAD_DIR as everything else.
const BANNER_MIME_EXT = { 'image/gif': 'gif', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!BANNER_MIME_EXT[file.mimetype]) return cb(new Error('Only GIF, JPG, PNG or WEBP images are allowed'));
    cb(null, true);
  },
});

function saveBannerImage(file) {
  const ext = BANNER_MIME_EXT[file.mimetype];
  const filename = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
  return filename;
}

// Chesky chat voice notes: same raw-write approach as banners (no re-encoding -
// just validated bytes to disk), served back from the existing /uploads static mount.
const VOICE_MIME_EXT = { 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };

function saveVoiceNote(buffer, mime) {
  const ext = VOICE_MIME_EXT[mime];
  if (!ext) return null;
  const filename = `voice-${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return filename;
}

module.exports = { upload, processAndSaveImage, UPLOAD_DIR, bannerUpload, saveBannerImage, saveVoiceNote, VOICE_MIME_EXT };
