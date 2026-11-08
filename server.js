require('dotenv').config();
if (!process.env.TZ) process.env.TZ = 'UTC';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { UPLOAD_DIR } = require('./middleware/upload');
const { getPostPreview, getEditorialPreview } = require('./services/socialPreview');
const requestContext = require('./services/requestContext');

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

// Makes the current request's own Host available (via AsyncLocalStorage, see
// services/requestContext.js) to every appUrl() call during this request -
// including deep in services that never receive `req` - so links built for
// the sitemap, social previews, emails etc. can reflect whichever domain the
// visitor actually used instead of one hardcoded domain. Mounted before
// every route, including the sitemap.
app.use(requestContext.middleware);

app.use(
  helmet({
    contentSecurityPolicy: false, // the static frontend loads Google Maps + Stripe from admin-configured origins
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
// gzip/brotli every response this process sends (JSON API responses as well
// as the plain-script JS/CSS bundle, which isn't pre-minified or bundled) -
// the single highest-leverage, lowest-risk thing to do for page-load speed.
app.use(compression());
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
// JS/CSS/images get a real cache lifetime (no content-hashed filenames here,
// so an hour balances fewer repeat requests against how soon a deploy's
// changes show up) - index.html always revalidates instead, so a deploy's
// actual page shell is never stuck stale in a visitor's cache.
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
    },
  })
);

app.use('/api/config', require('./routes/public/config'));
app.use('/api/home', require('./routes/public/home'));
app.use('/api/classifieds', require('./routes/public/classifieds'));
app.use('/api/listings', require('./routes/public/listings'));
app.use('/api/simchas', require('./routes/public/simchas'));
app.use('/api/posts', require('./routes/public/posts'));
app.use('/api/contact', require('./routes/public/contact'));
app.use('/api/analytics', require('./routes/public/analytics'));
app.use('/api/editorials', require('./routes/public/editorials'));
app.use('/api/subscriptions', require('./routes/public/subscriptions'));
app.use('/api/banners', require('./routes/public/banners'));
app.use('/api/bulk-post', require('./routes/public/bulkPost'));
app.use('/api/category-manage', require('./routes/public/categoryManage'));
app.use('/api/chat', require('./routes/public/chat'));

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
app.use('/api/admin/subscriptions', require('./routes/admin/subscriptions'));
app.use('/api/admin/banners', require('./routes/admin/banners'));
app.use('/api/admin/chat', require('./routes/admin/chat'));

app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Hidden bulk-posting tool - deliberately not linked anywhere in the public
// site's nav (only reachable by knowing this URL, or via the admin portal's
// own "Bulk Add" link). See routes/public/bulkPost.js for its API.
app.get('/tabadd137', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tabadd137.html'));
});

// Hidden listing-category management tool - same idea, its own separate
// password, not linked in the public nav. See routes/public/categoryManage.js.
app.get('/catmap924', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'catmap924.html'));
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
