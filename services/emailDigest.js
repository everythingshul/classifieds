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
const { getAllClassifiedCategories, getAllListingCategories } = require('./taxonomy');
const { formatPostPublic } = require('./postFormat');
const { stripHtml } = require('../utils/htmlSanitize');
const { DEFAULT_BROOKLYN_LOCATION } = require('../utils/constants');
const { sendMail } = require('../utils/mailer');
const { emailShell } = require('./emailLayout');
const { appUrl } = require('./appUrl');

const siteName = () => runtimeConfig.get('site_name', 'SITE_NAME') || 'JListings';

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Every topic a subscriber can pick: each classifieds/listings category
// individually (posts in those two sections are meaningfully categorized),
// plus one flat toggle each for simchas and editorials (neither has
// sub-categories worth splitting on).
function availableTopics() {
  const topics = [];
  getAllClassifiedCategories().forEach((c) => topics.push({ value: `classified:${c.key}`, label: c.label, labelHe: c.labelHe, group: 'classifieds' }));
  getAllListingCategories().forEach((c) => topics.push({ value: `listing:${c.key}`, label: c.label, labelHe: c.labelHe, group: 'listings' }));
  topics.push({ value: 'simcha', label: 'Simchas', labelHe: 'שמחות', group: 'simchas' });
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
const MAX_ITEMS_PER_SECTION = 12;

function toDigestItem(post) {
  const pub = formatPostPublic(post);
  return {
    title: pub.title,
    url: `${appUrl()}/${post.type === 'simcha' ? 'simchas' : post.type === 'listing' ? 'listings' : 'classifieds'}/${pub.id}`,
    categoryLabel: pub.categoryLabel,
    location: pub.location.text,
    price: priceLine(pub.fields),
    excerpt: pub.description ? pub.description.slice(0, 140) : '',
  };
}

// New live posts/editorials matching a subscription's chosen topics, since
// its last send (or the last 24h for a first-ever send). Capped per section
// so a subscriber who paused their digest for a while doesn't come back to
// a wall of 100 posts in one email - that's a complaint/unsubscribe risk in
// itself.
function collectDigestSections(sub) {
  const topics = parseTopics(sub.categories);
  if (!topics.length) return [];
  const since = sub.last_sent_at || Date.now() - DAY_MS;
  const now = Date.now();

  const classifiedCats = topics.filter((t) => t.startsWith('classified:')).map((t) => t.slice('classified:'.length));
  const listingCats = topics.filter((t) => t.startsWith('listing:')).map((t) => t.slice('listing:'.length));

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
      .all(type, ...cats, since, now, now, MAX_ITEMS_PER_SECTION);
  }

  const classifieds = queryByCategory('classified', classifiedCats);
  if (classifieds.length) sections.push({ title: 'Classifieds', items: classifieds.map(toDigestItem) });

  const listings = queryByCategory('listing', listingCats);
  if (listings.length) sections.push({ title: 'Listings', items: listings.map(toDigestItem) });

  if (topics.includes('simcha')) {
    const simchas = db
      .prepare(
        `SELECT * FROM posts WHERE type = 'simcha' AND status = 'live' AND published_at > ? AND published_at <= ?
         ORDER BY published_at DESC LIMIT ?`
      )
      .all(since, now, MAX_ITEMS_PER_SECTION);
    if (simchas.length) sections.push({ title: 'Simchas', items: simchas.map(toDigestItem) });
  }

  if (topics.includes('editorial')) {
    const eds = db
      .prepare(
        `SELECT * FROM editorials WHERE status = 'live' AND published_at > ? AND published_at <= ?
         ORDER BY published_at DESC LIMIT ?`
      )
      .all(since, now, MAX_ITEMS_PER_SECTION);
    if (eds.length) {
      sections.push({
        title: 'Editorials',
        items: eds.map((ed) => ({
          title: ed.title,
          url: `${appUrl()}/editorials/${ed.public_id}`,
          categoryLabel: null,
          location: null,
          price: null,
          excerpt: stripHtml(ed.body).slice(0, 140),
        })),
      });
    }
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
function digestEmailHtml(sub, sections, sendToken) {
  const linkFor = (url) => (sendToken ? trackClickUrl(sendToken, url) : url);
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
      ${sendToken ? `<img src="${trackOpenUrl(sendToken)}" width="1" height="1" alt="" style="display:block;border:0">` : ''}
    `,
    footerNote: `
      You're receiving this because you subscribed to daily email updates from ${escapeHtml(siteName())}.
      <a href="${manageUrl(sub)}" style="color:#62666b">Manage preferences</a> &middot;
      <a href="${unsubscribeUrl(sub)}" style="color:#62666b">Unsubscribe</a>`,
  });
}

function digestEmailText(sub, sections) {
  const lines = [`${siteName()} - Your Daily Update`, ''];
  sections.forEach((sec) => {
    lines.push(sec.title.toUpperCase());
    sec.items.forEach((it) => {
      lines.push(`- ${it.title}${it.price ? ` (${it.price})` : ''} - ${it.url}`);
    });
    lines.push('');
  });
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
  digestEmailHtml,
  digestEmailText,
  unsubscribeUrl,
  manageUrl,
  sendConfirmationEmail,
  siteName,
  escapeHtml,
};
