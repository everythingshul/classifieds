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

module.exports = { upload, processAndSaveImage, UPLOAD_DIR };
