// Daily email digest subscriptions - sign up for a mix of classifieds/
// listings categories plus simchas/editorials, and get a daily email of
// what's new in just those, at an hour you pick. Two things here exist
// specifically to protect sender reputation/deliverability (not just UX):
// double opt-in (see routes/public/subscriptions.js) and a one-click
// unsubscribe, both built around public_id doubling as the subscription's
// confirm/unsubscribe token.

const db = require('../db');
const runtimeConfig = require('./runtimeConfig');
const { getSetting } = require('./pricing');
const { getAllClassifiedCategories } = require('./taxonomy');
const { formatPostPublic } = require('./postFormat');
const { stripHtml } = require('../utils/htmlSanitize');
const { DEFAULT_BROOKLYN_LOCATION } = require('../utils/constants');
const { sendMail } = require('../utils/mailer');
const { emailShell } = require('./emailLayout');
const { appUrl } = require('./appUrl');
const { simchasEnabled } = require('./features');

const siteName = () => runtimeConfig.get('site_name', 'SITE_NAME') || 'JListings';

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Every topic a subscriber can pick: each classifieds/listings category
// individually (posts in that section are meaningfully categorized),
// plus one flat toggle each for simchas and editorials (neither has
// sub-categories worth splitting on). Business Listings are deliberately
// not offered here - the daily digest is classifieds/simchas/editorials only.
function availableTopics() {
  const topics = [];
  getAllClassifiedCategories().forEach((c) => topics.push({ value: `classified:${c.key}`, label: c.label, labelHe: c.labelHe, group: 'classifieds' }));
  if (simchasEnabled()) topics.push({ value: 'simcha', label: 'Simchas', labelHe: 'שמחות', group: 'simchas' });
  topics.push({ value: 'editorial', label: 'Editorials', labelHe: 'מאמרים', group: 'editorials' });
  return topics;
}

function validTopicValues() {
  return new Set(availableTopics().map((t) => t.value));
}

// What a subscriber's chosen send_hour (0-23) is interpreted against - the
// site's own configured timezone (Settings -> Default Location), not
// whatever timezone the server process happens to run in.
function digestTimezone() {
  const loc = getSetting('default_location', DEFAULT_BROOKLYN_LOCATION) || DEFAULT_BROOKLYN_LOCATION;
  return loc.tzid || DEFAULT_BROOKLYN_LOCATION.tzid;
}

function currentHourInSiteTz() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: digestTimezone(), hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour').value);
}

function parseTopics(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [];
  } catch (e) {
    return [];
  }
}

function priceLine(fields) {
  if (fields?.price !== undefined && fields?.price !== null && fields?.price !== '') {
    const amt = Number(fields.price);
    if (Number.isFinite(amt)) return `$${amt.toFixed(2)}`;
  }
  return fields?.priceText || null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Not a UX cap - every matching post is included (no limit on how much a
// subscriber catches up on). This is purely a query safety net against a
// single pathological digest (e.g. a subscriber who paused updates for
// months) pulling an unbounded number of rows.
const SECTION_QUERY_SAFETY_LIMIT = 500;
// The email itself shows at most this many items total (across every
// section combined) - past that, a "View all" button takes the reader to
// a page with the complete list instead of growing the email endlessly.
const EMAIL_PREVIEW_MAX = 25;

// A short "type letter + internal id" reference (e.g. "c482"), never
// exposed anywhere except the "View all" link - what lets that link
// reconstruct exactly which posts/editorials an email listed by reading
// the link itself, with nothing saved server-side for it (see
// sectionsFromRefs below).
function refCode(type, id) {
  const prefix = type === 'simcha' ? 's' : type === 'editorial' ? 'e' : 'c';
  return `${prefix}${id}`;
}

function toDigestItem(post) {
  const pub = formatPostPublic(post);
  return {
    refKey: refCode(post.type, post.id),
    title: pub.title,
    url: `${appUrl()}/${post.type === 'simcha' ? 'simchas' : post.type === 'listing' ? 'listings' : 'classifieds'}/${pub.id}`,
    categoryLabel: pub.categoryLabel,
    location: pub.location.text,
    price: priceLine(pub.fields),
    excerpt: pub.description ? pub.description.slice(0, 140) : '',
  };
}

function editorialToDigestItem(ed) {
  return {
    refKey: refCode('editorial', ed.id),
    title: ed.title,
    url: `${appUrl()}/editorials/${ed.public_id}`,
    categoryLabel: null,
    location: null,
    price: null,
    excerpt: stripHtml(ed.body).slice(0, 140),
  };
}

// Every live post/editorial matching a subscription's chosen topics, since
// its last send (or the last 24h for a first-ever send) - no cap on how
// much a subscriber catches up on. digestEmailHtml/Text below are what
// decide how much of this actually gets listed in the email body itself
// versus behind a "View all" link, so a subscriber who paused their digest
// for a while doesn't come back to a wall of 100 posts in one email.
// since/until default to the normal "since this subscription's last send"
// window, but a caller can pin them explicitly (see digestWindowFor below) -
// the "View all" page needs the exact same window the email it was linked
// from used, not whatever the subscription's last_sent_at has since moved
// on to (it's bumped forward right after that email is sent).
function collectDigestSections(sub, { since, until } = {}) {
  const topics = parseTopics(sub.categories);
  if (!topics.length) return [];
  since = since ?? (sub.last_sent_at || Date.now() - DAY_MS);
  const now = until ?? Date.now();

  const classifiedCats = topics.filter((t) => t.startsWith('classified:')).map((t) => t.slice('classified:'.length));

  const sections = [];
  function queryByCategory(type, cats) {
    if (!cats.length) return [];
    const placeholders = cats.map(() => '?').join(',');
    return db
      .prepare(
        `SELECT * FROM posts WHERE type = ? AND status = 'live' AND category IN (${placeholders})
         AND published_at > ? AND published_at <= ? AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY published_at DESC LIMIT ?`
      )
      .all(type, ...cats, since, now, now, SECTION_QUERY_SAFETY_LIMIT);
  }

  const classifieds = queryByCategory('classified', classifiedCats);
  if (classifieds.length) sections.push({ title: 'Classifieds', items: classifieds.map(toDigestItem) });

  // A subscriber who picked Simchas before the section was paused keeps the
  // choice on file; it just contributes nothing until the section returns.
  if (simchasEnabled() && topics.includes('simcha')) {
    const simchas = db
      .prepare(
        `SELECT * FROM posts WHERE type = 'simcha' AND status = 'live' AND published_at > ? AND published_at <= ?
         ORDER BY published_at DESC LIMIT ?`
      )
      .all(since, now, SECTION_QUERY_SAFETY_LIMIT);
    if (simchas.length) sections.push({ title: 'Simchas', items: simchas.map(toDigestItem) });
  }

  if (topics.includes('editorial')) {
    const eds = db
      .prepare(
        `SELECT * FROM editorials WHERE status = 'live' AND published_at > ? AND published_at <= ?
         ORDER BY published_at DESC LIMIT ?`
      )
      .all(since, now, SECTION_QUERY_SAFETY_LIMIT);
    if (eds.length) sections.push({ title: 'Editorials', items: eds.map(editorialToDigestItem) });
  }

  return sections;
}

// Rebuilds the exact sections an email listed, reading only the ids
// encoded in its "View all" link (see viewAllUrl) - no re-querying by
// category/date, so it can never show something different from what
// that email actually contained, and nothing about the send itself needs
// to be saved anywhere to make this page work.
function sectionsFromRefs(refKeys) {
  const byType = { c: [], s: [], e: [] };
  (refKeys || []).forEach((code) => {
    const m = /^([cse])(\d+)$/.exec(String(code || ''));
    if (m) byType[m[1]].push(Number(m[2]));
  });

  const sections = [];
  function postsSection(prefix, type, title) {
    if (!byType[prefix].length) return;
    const placeholders = byType[prefix].map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM posts WHERE type = ? AND id IN (${placeholders}) AND status != 'removed'`).all(type, ...byType[prefix]);
    if (rows.length) sections.push({ title, items: rows.map(toDigestItem) });
  }
  postsSection('c', 'classified', 'Classifieds');
  if (simchasEnabled()) postsSection('s', 'simcha', 'Simchas');
  if (byType.e.length) {
    const placeholders = byType.e.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM editorials WHERE id IN (${placeholders}) AND status != 'removed'`).all(...byType.e);
    if (rows.length) sections.push({ title: 'Editorials', items: rows.map(editorialToDigestItem) });
  }
  return sections;
}

// Token-based (not bare email) so the link can't be used to probe whether
// an arbitrary email address is subscribed to anything.
function manageUrl(sub) {
  return `${appUrl()}/subscribe?manage=${sub.public_id}`;
}
function unsubscribeUrl(sub) {
  return `${appUrl()}/api/subscriptions/unsubscribe?token=${sub.public_id}`;
}
// The exact same since/until a send will use (or just did use) to collect
// its sections - computed once, up front, and reused for both the actual
// query and the "View all" link, so the link always reproduces precisely
// what that email was built from.
function digestWindowFor(sub) {
  return { since: sub.last_sent_at || Date.now() - DAY_MS, until: Date.now() };
}

// Same token plus every item's refKey, comma-joined - a plain "show me
// everything" page instead of an action, linked from the email whenever
// there's more than fits in the preview. Reading the exact ids back off
// the link (see sectionsFromRefs) means this never needs to re-derive
// "what was new" from a timestamp, which could drift from what the email
// actually listed. Capped defensively so an extreme digest (months of a
// paused subscription) can't blow out the link's length.
const VIEW_ALL_LINK_MAX_ITEMS = 300;
function viewAllUrl(sub, allSections) {
  const ids = allSections.flatMap((s) => s.items.map((it) => it.refKey)).filter(Boolean).slice(0, VIEW_ALL_LINK_MAX_ITEMS);
  return `${appUrl()}/digest-all?token=${sub.public_id}&ids=${ids.join(',')}`;
}

// Caps how many items actually get listed in the email body (EMAIL_PREVIEW_MAX
// total, spread across sections in order) - the full set from
// collectDigestSections() is never thrown away, just not all printed inline.
function truncateForPreview(sections) {
  const totalCount = sections.reduce((n, s) => n + s.items.length, 0);
  if (totalCount <= EMAIL_PREVIEW_MAX) return { sections, totalCount, truncated: false };
  let remaining = EMAIL_PREVIEW_MAX;
  const preview = [];
  for (const sec of sections) {
    if (remaining <= 0) break;
    const items = sec.items.slice(0, remaining);
    if (items.length) preview.push({ title: sec.title, items });
    remaining -= items.length;
  }
  return { sections: preview, totalCount, truncated: true };
}
// sendToken identifies one particular digest send (email_sends.public_id) -
// routed through the server so a click is logged before redirecting on to
// the real post/editorial, same idea as the open-tracking pixel below.
function trackClickUrl(sendToken, realUrl) {
  return `${appUrl()}/api/subscriptions/track-click?send=${sendToken}&url=${encodeURIComponent(realUrl)}`;
}
function trackOpenUrl(sendToken) {
  return `${appUrl()}/api/subscriptions/track-open?send=${sendToken}`;
}

// sendToken is optional - when a caller doesn't have one yet (e.g. a
// preview), links just go straight to the real URLs with no tracking.
function digestEmailHtml(sub, allSections, sendToken) {
  const linkFor = (url) => (sendToken ? trackClickUrl(sendToken, url) : url);
  const { sections, totalCount, truncated } = truncateForPreview(allSections);
  const sectionsHtml = sections
    .map(
      (sec) => `
      <h2 style="font-size:16px;color:#1f3b57;margin:22px 0 8px">${escapeHtml(sec.title)}</h2>
      ${sec.items
        .map(
          (it) => `
        <div style="padding:10px 0;border-bottom:1px solid #e4e1d8">
          <a href="${linkFor(it.url)}" style="font-size:14px;font-weight:700;color:#1f3b57;text-decoration:none">${escapeHtml(it.title)}</a><br>
          ${it.categoryLabel || it.location ? `<span style="font-size:12px;color:#62666b">${[it.categoryLabel, it.location].filter(Boolean).map(escapeHtml).join(' • ')}</span>` : ''}
          ${it.price ? ` <span style="font-size:12px;font-weight:700;color:#2f6f4f">${escapeHtml(it.price)}</span>` : ''}
          ${it.excerpt ? `<div style="font-size:13px;color:#232323;margin-top:3px">${escapeHtml(it.excerpt)}${it.excerpt.length >= 140 ? '…' : ''}</div>` : ''}
        </div>`
        )
        .join('')}`
    )
    .join('');

  return emailShell({
    eyebrow: 'Daily Update',
    heading: "Here's what's new today",
    bodyHtml: `
      <p style="margin-top:0">In the topics you follow:</p>${sectionsHtml}
      ${truncated ? `
      <div style="text-align:center;margin-top:18px">
        <p style="font-size:13px;color:#62666b">Showing ${EMAIL_PREVIEW_MAX} of ${totalCount} new posts.</p>
        <a href="${viewAllUrl(sub, allSections)}" style="display:inline-block;padding:10px 22px;background:#1f3b57;color:#fff;text-decoration:none;font-size:13px;font-weight:700">View All ${totalCount}</a>
      </div>` : ''}
      ${sendToken ? `<img src="${trackOpenUrl(sendToken)}" width="1" height="1" alt="" style="display:block;border:0">` : ''}
    `,
    footerNote: `
      You're receiving this because you subscribed to daily email updates from ${escapeHtml(siteName())}.
      <a href="${manageUrl(sub)}" style="color:#62666b">Manage preferences</a> &middot;
      <a href="${unsubscribeUrl(sub)}" style="color:#62666b">Unsubscribe</a>`,
  });
}

function digestEmailText(sub, allSections) {
  const { sections, totalCount, truncated } = truncateForPreview(allSections);
  const lines = [`${siteName()} - Your Daily Update`, ''];
  sections.forEach((sec) => {
    lines.push(sec.title.toUpperCase());
    sec.items.forEach((it) => {
      lines.push(`- ${it.title}${it.price ? ` (${it.price})` : ''} - ${it.url}`);
    });
    lines.push('');
  });
  if (truncated) {
    lines.push(`Showing ${EMAIL_PREVIEW_MAX} of ${totalCount} new posts. View all: ${viewAllUrl(sub, allSections)}`);
    lines.push('');
  }
  lines.push(`Manage preferences: ${manageUrl(sub)}`);
  lines.push(`Unsubscribe: ${unsubscribeUrl(sub)}`);
  return lines.join('\n');
}

// Double opt-in: nothing is ever sent to an address until this link is
// clicked. Keeps spam-trap/typo/malicious signups from ever reaching an
// inbox and hurting sender reputation - the single biggest lever here.
async function sendConfirmationEmail(sub) {
  const confirmUrl = `${appUrl()}/api/subscriptions/confirm?token=${sub.public_id}`;
  await sendMail({
    to: sub.email,
    subject: `Confirm your ${siteName()} email updates`,
    html: emailShell({
      eyebrow: 'Confirm Your Subscription',
      heading: 'One click to confirm',
      bodyHtml: `
        <p>Please confirm you'd like to receive daily email updates from ${escapeHtml(siteName())}.</p>
        <p style="font-size:12px;color:#9a9a9a;margin-top:18px">If you didn't request this, you can safely ignore this email - you won't be subscribed unless you click the button below.</p>
      `,
      ctaText: 'Confirm Subscription',
      ctaUrl: confirmUrl,
    }),
    text: `Please confirm you'd like to receive daily email updates from ${siteName()}: ${confirmUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  });
}

module.exports = {
  availableTopics,
  validTopicValues,
  digestTimezone,
  currentHourInSiteTz,
  parseTopics,
  collectDigestSections,
  sectionsFromRefs,
  digestEmailHtml,
  digestEmailText,
  unsubscribeUrl,
  manageUrl,
  viewAllUrl,
  digestWindowFor,
  sendConfirmationEmail,
  siteName,
  escapeHtml,
};
