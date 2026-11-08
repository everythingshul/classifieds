const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { isValidEmail } = require('../../utils/validate');
const { newPublicId } = require('../../utils/ids');
const { validTopicValues, sendConfirmationEmail, escapeHtml, siteName, sectionsFromRefs } = require('../../services/emailDigest');
const { appUrl } = require('../../services/appUrl');

const router = express.Router();

// Tighter than the general API limiter - a signup endpoint that fans out to
// a confirmation email is exactly the kind of thing bot/spam-trap abuse
// targets, and that abuse is what tanks sender reputation for everyone
// else's digest, not just the abuser's.
const subscribeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

function findByEmail(email) {
  return db.prepare('SELECT * FROM email_subscriptions WHERE email = ?').get(email);
}
function findByToken(token) {
  return db.prepare('SELECT * FROM email_subscriptions WHERE public_id = ?').get(token);
}

// Looked up by the token in a "manage preferences" link, never by bare
// email - see services/emailDigest.js's manageUrl comment.
router.get('/manage', (req, res) => {
  const sub = findByToken(String(req.query.token || ''));
  if (!sub || sub.status === 'unsubscribed') return res.status(404).json({ error: 'Not found' });
  res.json({ email: sub.email, categories: JSON.parse(sub.categories || '[]'), sendHour: sub.send_hour, status: sub.status });
});

// Backs the "View All" link a digest email shows once there's more than
// fits in the preview (see services/emailDigest.js's EMAIL_PREVIEW_MAX) -
// reads the exact list of what that email contained straight off the
// link's `ids` (no re-querying by category/date, nothing saved per-send).
router.get('/digest-all', (req, res) => {
  const sub = findByToken(String(req.query.token || ''));
  if (!sub || sub.status === 'unsubscribed') return res.status(404).json({ error: 'Not found' });
  const ids = String(req.query.ids || '').split(',').filter(Boolean);
  res.json({ sections: sectionsFromRefs(ids) });
});

router.post('/', subscribeLimiter, async (req, res, next) => {
  try {
    const token = req.body.token ? String(req.body.token) : null;
    const email = String(req.body.email || '').trim().toLowerCase();
    const categories = Array.isArray(req.body.categories) ? req.body.categories : [];
    const sendHour = Number(req.body.sendHour);

    const errors = [];
    if (!token && !isValidEmail(email)) errors.push('A valid email address is required');
    const valid = validTopicValues();
    const cleanCategories = [...new Set(categories.filter((c) => valid.has(c)))];
    if (!cleanCategories.length) errors.push('Choose at least one topic to follow');
    if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) errors.push('Choose a valid time of day');
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const now = Date.now();
    // Editing an existing subscription via its "manage preferences" link -
    // update in place. Already-confirmed subscribers never need to
    // re-confirm just for changing their topics/time.
    if (token) {
      const existing = findByToken(token);
      if (!existing) return res.status(404).json({ error: 'Subscription not found' });
      db.prepare('UPDATE email_subscriptions SET categories = ?, send_hour = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(cleanCategories), sendHour, now, existing.id);
      return res.json({ ok: true, status: 'updated' });
    }

    const existing = findByEmail(email);
    if (existing && existing.status === 'confirmed') {
      db.prepare('UPDATE email_subscriptions SET categories = ?, send_hour = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(cleanCategories), sendHour, now, existing.id);
      return res.json({ ok: true, status: 'updated' });
    }

    let sub;
    if (existing) {
      // Was 'pending' or 'unsubscribed' - either way nothing has been
      // permissioned yet, so this still needs a fresh confirm click.
      db.prepare('UPDATE email_subscriptions SET categories = ?, send_hour = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(cleanCategories), sendHour, 'pending', now, existing.id);
      sub = findByEmail(email);
    } else {
      db.prepare(
        'INSERT INTO email_subscriptions (public_id, email, categories, send_hour, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(newPublicId(24), email, JSON.stringify(cleanCategories), sendHour, 'pending', now, now);
      sub = findByEmail(email);
    }

    try {
      await sendConfirmationEmail(sub);
    } catch (e) {
      console.error('[subscriptions] Failed to send confirmation email -', e.message);
    }
    res.json({ ok: true, status: 'pending' });
  } catch (e) {
    next(e);
  }
});

function tinyPage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - ${escapeHtml(siteName())}</title>
    <style>body{font-family:Arial,sans-serif;background:#faf8f4;color:#232323;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
    .box{background:#fff;border:1px solid #e4e1d8;max-width:420px;padding:32px;text-align:center}
    a{color:#1f3b57}</style></head>
    <body><div class="box"><h1 style="font-size:20px;color:#1f3b57">${escapeHtml(title)}</h1><p>${message}</p><p><a href="/">Return to ${escapeHtml(siteName())}</a></p></div></body></html>`;
}

// Opening this link is the entire confirmation step - deliberately not
// wired into the SPA so it works even if the visitor's email client strips
// query params oddly or the site's JS bundle fails to load.
router.get('/confirm', (req, res) => {
  const sub = findByToken(String(req.query.token || ''));
  if (!sub) return res.status(404).send(tinyPage('Link not found', 'This confirmation link is invalid or has expired.'));
  if (sub.status !== 'unsubscribed') {
    db.prepare("UPDATE email_subscriptions SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ?")
      .run(Date.now(), Date.now(), sub.id);
  }
  res.send(tinyPage('You’re confirmed!', 'You’ll start receiving your daily email updates at the time you chose.'));
});

// One-click unsubscribe (RFC 8058): mail clients that support it POST here
// directly from the inbox, no page load or extra click required - this
// must succeed immediately on that single request. The GET variant covers
// a manual click on the same link (or the link in the digest's own footer).
function doUnsubscribe(req, res) {
  const token = String(req.query.token || req.body?.token || '');
  const sub = findByToken(token);
  if (sub) db.prepare("UPDATE email_subscriptions SET status = 'unsubscribed', updated_at = ? WHERE id = ?").run(Date.now(), sub.id);
  if (req.method === 'POST') return res.status(200).end();
  res.send(tinyPage('Unsubscribed', 'You won’t receive any more email updates. You can resubscribe any time from the Email Updates page.'));
}
router.get('/unsubscribe', doUnsubscribe);
router.post('/unsubscribe', doUnsubscribe); // body already parsed by server.js's global express.urlencoded()

// 1x1 transparent GIF, served for every digest's embedded tracking pixel -
// the request itself (regardless of response content) is the "open" event.
// Most mail clients only load images once per message, but open_count still
// increments past the first so re-opens on another device are visible too.
const TRACKING_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

function findSend(token) {
  return db.prepare('SELECT * FROM email_sends WHERE public_id = ?').get(token);
}

router.get('/track-open', (req, res) => {
  const send = findSend(String(req.query.send || ''));
  if (send) {
    const now = Date.now();
    db.prepare('UPDATE email_sends SET opened_at = COALESCE(opened_at, ?), open_count = open_count + 1 WHERE id = ?').run(now, send.id);
  }
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store');
  res.send(TRACKING_PIXEL);
});

// Logs the click, then redirects on to the real URL - restricted to this
// site's own origin (every link the digest ever builds is one of our own
// post/editorial/manage/unsubscribe pages) so this can't be turned into an
// open redirector to an arbitrary external site.
router.get('/track-click', (req, res) => {
  const send = findSend(String(req.query.send || ''));
  const url = String(req.query.url || '');
  const safeUrl = url.startsWith(appUrl()) ? url : appUrl();
  if (send) {
    const now = Date.now();
    db.prepare('UPDATE email_sends SET clicked_at = COALESCE(clicked_at, ?), click_count = click_count + 1 WHERE id = ?').run(now, send.id);
  }
  res.redirect(302, safeUrl);
});

module.exports = router;
