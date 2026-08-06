require('dotenv').config();
if (!process.env.TZ) process.env.TZ = 'UTC';

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { UPLOAD_DIR } = require('./middleware/upload');

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
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/config', require('./routes/public/config'));
app.use('/api/home', require('./routes/public/home'));
app.use('/api/classifieds', require('./routes/public/classifieds'));
app.use('/api/listings', require('./routes/public/listings'));
app.use('/api/simchas', require('./routes/public/simchas'));
app.use('/api/posts', require('./routes/public/posts'));
app.use('/api/contact', require('./routes/public/contact'));
app.use('/api/analytics', require('./routes/public/analytics'));

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

app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Client-side routed pages (classified/listing/simcha detail, view-all, etc.) all serve the same shell.
app.get(['/classifieds/*', '/listings/*', '/simchas/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
