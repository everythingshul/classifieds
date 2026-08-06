const fs = require('fs');
const path = require('path');
const express = require('express');
const sharp = require('sharp');

const router = express.Router();

const LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'img', 'logo.png');
const SIZE = 256;

// SVG favicons that reference an external <image href> don't reliably render in
// browsers' favicon pipeline (it showed up blank/white in practice), so instead
// we bake the logo onto a real white square as actual pixels here, server-side,
// and serve that. Cached by the logo file's mtime so an admin re-uploading the
// logo picks up automatically without a restart.
let cache = null; // { mtimeMs, buffer }

async function getFaviconBuffer() {
  let stat;
  try {
    stat = fs.statSync(LOGO_PATH);
  } catch (e) {
    return null;
  }
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.buffer;

  const pad = Math.round(SIZE * 0.1);
  const inner = SIZE - pad * 2;
  const logo = await sharp(LOGO_PATH)
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();
  const buffer = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();

  cache = { mtimeMs: stat.mtimeMs, buffer };
  return buffer;
}

router.get(['/favicon-white.png', '/img/favicon-white.png'], async (req, res) => {
  try {
    const buf = await getFaviconBuffer();
    if (!buf) return res.status(404).end();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (e) {
    res.status(500).end();
  }
});

module.exports = router;
