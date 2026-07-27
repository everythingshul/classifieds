const express = require('express');
const db = require('../../db');
const runtimeConfig = require('../../services/runtimeConfig');

const router = express.Router();

const STATIC_PATHS = ['/', '/classifieds', '/listings', '/simchas', '/terms', '/refund-policy'];

router.get('/sitemap.xml', (req, res) => {
  const base = (runtimeConfig.get('app_url', 'APP_URL') || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const now = Date.now();

  const posts = db
    .prepare(
      `SELECT public_id, type, updated_at FROM posts
       WHERE status = 'live' AND (expires_at IS NULL OR expires_at > ?)`
    )
    .all(now);

  const urlSegment = (type) => (type === 'simcha' ? 'simchas' : type === 'listing' ? 'listings' : 'classifieds');

  const staticEntries = STATIC_PATHS.map((p) => `  <url><loc>${base}${p}</loc></url>`);
  const postEntries = posts.map(
    (p) => `  <url><loc>${base}/${urlSegment(p.type)}/${p.public_id}</loc><lastmod>${new Date(p.updated_at).toISOString().slice(0, 10)}</lastmod></url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...postEntries].join('\n')}
</urlset>`;

  res.set('Content-Type', 'application/xml');
  res.send(xml);
});

module.exports = router;
