require('dotenv').config();
if (!process.env.TZ) process.env.TZ = 'UTC';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { UPLOAD_DIR } = require('./middleware/upload');
const { getPostPreview, getEditorialPreview } = require('./services/socialPreview');

const indexHtmlTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const SOCIAL_META_RE = /<!-- SOCIAL_META_START -->[\s\S]*?<!-- SOCIAL_META_END -->/;

// Detail-page links (classifieds/listings/simchas/editorials) shared on social
// media are fetched by crawlers that never run JavaScript, so the client-side
// setPageTitle() call is invisible to them - splice the actual post's title/
// description/image into the shell server-side before sending it, instead of
// always serving the same generic site-wide meta tags for every shared link.
function sendShellWithPreview(res, lookup) {
  let html = indexHtmlTemplate;
  try {
    const meta = lookup();
    if (meta) html = indexHtmlTemplate.replace(SOCIAL_META_RE, meta);
  } catch (e) {
    // Falls back to the generic shell below - a broken preview lookup should
    // never take the page itself down.
  }
  res.set('Content-Type', 'text/html');
  res.send(html);
}

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // the static frontend loads Google Maps + Stripe from admin-configured origins
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors());
app.use(cookieParser());

// Stripe needs the raw body to verify webhook signatures, so mount it before json().
app.use('/api/webhook', express.raw({ type: 'application/json' }), require('./routes/public/webhook'));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use(require('./routes/public/sitemap'));
app.use(require('./routes/public/favicon'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/config', require('./routes/public/config'));
app.use('/api/home', require('./routes/public/home'));
app.use('/api/classifieds', require('./routes/public/classifieds'));
app.use('/api/listings', require('./routes/public/listings'));
app.use('/api/simchas', require('./routes/public/simchas'));
app.use('/api/posts', require('./routes/public/posts'));
app.use('/api/contact', require('./routes/public/contact'));
app.use('/api/analytics', require('./routes/public/analytics'));
app.use('/api/editorials', require('./routes/public/editorials'));

app.use('/api/admin/auth', require('./routes/admin/auth'));
app.use('/api/admin/taxonomies', require('./routes/admin/taxonomies'));
app.use('/api/admin/custom-categories', require('./routes/admin/customCategories'));
app.use('/api/admin/listing-categories', require('./routes/admin/listingCategories'));
app.use('/api/admin/promo-codes', require('./routes/admin/promoCodes'));
app.use('/api/admin/reports', require('./routes/admin/reports'));
app.use('/api/admin/contact-messages', require('./routes/admin/contactMessages'));
app.use('/api/admin/notifications', require('./routes/admin/notifications'));
app.use('/api/admin/pricing', require('./routes/admin/pricing'));
app.use('/api/admin/settings', require('./routes/admin/settings'));
app.use('/api/admin/posts', require('./routes/admin/posts'));
app.use('/api/admin/crm', require('./routes/admin/crm'));
app.use('/api/admin/stats', require('./routes/admin/stats'));
app.use('/api/admin/analytics', require('./routes/admin/analytics'));
app.use('/api/admin/editorials', require('./routes/admin/editorials'));

app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Client-side routed pages (classified/listing/simcha detail, view-all, etc.)
// all serve the same shell - detail pages (an id as the very next path
// segment, e.g. /classifieds/abc123, not /classifieds/search or a bare list
// page) get their post's own social preview meta spliced in first.
const DETAIL_PREFIXES = {
  '/classifieds/': (id, urlPath) => getPostPreview(id, 'classified', urlPath),
  '/listings/': (id, urlPath) => getPostPreview(id, 'listing', urlPath),
  '/simchas/': (id, urlPath) => getPostPreview(id, 'simcha', urlPath),
  '/editorials/': (id, urlPath) => id === 'submit' ? null : getEditorialPreview(id, urlPath),
};
app.get(['/classifieds/*', '/listings/*', '/simchas/*', '/editorials/*'], (req, res) => {
  const prefix = Object.keys(DETAIL_PREFIXES).find((p) => req.path.startsWith(p));
  const id = prefix ? req.path.slice(prefix.length).split('/')[0] : null;
  sendShellWithPreview(res, id ? () => DETAIL_PREFIXES[prefix](id, req.path) : () => null);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  sendShellWithPreview(res, () => null);
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.expose ? err.message : status === 500 ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`JListings listening on port ${PORT}`);
  require('./utils/cron').start();
});
