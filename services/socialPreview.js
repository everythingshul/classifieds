// Server-side Open Graph/Twitter Card meta tags for post and editorial detail
// pages. Social media crawlers (Facebook, WhatsApp, Twitter/X, iMessage, etc.)
// fetch the raw HTML and never run JavaScript, so the client-side
// setPageTitle() call in utils.js (which only updates document.title after
// the SPA has fetched and rendered) is invisible to them - every shared link
// would otherwise show the same generic site-wide title/description no
// matter which post it was. This module builds a per-post meta block that
// server.js splices into the static index.html shell before serving it, only
// for detail-page requests where the id resolves to a real, live post.

const db = require('../db');
const { stripHtml } = require('../utils/htmlSanitize');
const runtimeConfig = require('./runtimeConfig');

const appUrl = () => (runtimeConfig.get('app_url', 'APP_URL') || 'https://jlistings.com').replace(/\/$/, '');

function escapeAttr(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function truncate(text, max = 200) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean;
}

function buildMetaHtml({ title, description, url, image }) {
  const t = escapeAttr(title);
  const d = escapeAttr(truncate(description));
  const u = escapeAttr(url);
  const img = escapeAttr(image);
  return `<!-- SOCIAL_META_START -->
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="JListings">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<!-- SOCIAL_META_END -->`;
}

const DEFAULT_IMAGE = () => `${appUrl()}/img/logo.png`;

// type must be 'classified' | 'listing' | 'simcha', matching posts.type and
// the URL prefix the caller already resolved from (/classifieds, /listings, /simchas).
function getPostPreview(publicId, type, urlPath) {
  const post = db.prepare("SELECT * FROM posts WHERE public_id = ? AND type = ? AND status = 'live'").get(publicId, type);
  if (!post) return null;
  const image = post.has_images
    ? db.prepare('SELECT filename FROM post_images WHERE post_id = ? AND approved = 1 ORDER BY sort_order LIMIT 1').get(post.id)
    : null;
  return buildMetaHtml({
    title: post.title,
    description: post.description || `${post.title} - posted on JListings`,
    url: `${appUrl()}${urlPath}`,
    image: image ? `${appUrl()}/uploads/${image.filename}` : DEFAULT_IMAGE(),
  });
}

function getEditorialPreview(publicId, urlPath) {
  const ed = db.prepare("SELECT * FROM editorials WHERE public_id = ? AND status = 'live'").get(publicId);
  if (!ed) return null;
  const image = db.prepare('SELECT filename FROM editorial_images WHERE editorial_id = ? ORDER BY sort_order LIMIT 1').get(ed.id);
  return buildMetaHtml({
    title: ed.title,
    description: stripHtml(ed.body) || `${ed.title} - an editorial on JListings`,
    url: `${appUrl()}${urlPath}`,
    image: image ? `${appUrl()}/uploads/${image.filename}` : DEFAULT_IMAGE(),
  });
}

module.exports = { getPostPreview, getEditorialPreview };
