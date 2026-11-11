// Turns stored visits (analytics_sessions / analytics_hits) plus the site's
// own records (post views and clicks, payments, editorials) into the numbers
// the admin Analytics page shows. Collection is in analyticsIngest.js.
const db = require('../db');

const DAY = 86400000;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const quantile = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const all = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args) || {};

// A visit "bounced" when it was one page, nothing was tapped and it lasted
// under 10 seconds. Visits rebuilt from older data (channel = '') have no
// time or interaction data, so they're left out of bounce/time/engaged rates.
const BOUNCE = "CASE WHEN channel <> '' AND pages <= 1 AND interact = 0 AND active_s < 10 THEN 1 ELSE 0 END";

function netRevenue(currency, from, to) {
  const r = one(`SELECT COALESCE(SUM(amount_cents), 0) - COALESCE(SUM(refunded_cents), 0) AS c FROM post_payments
    WHERE status = 'paid' AND currency = ? AND created_at >= ? AND created_at < ?`, currency, from, to);
  return r.c || 0;
}

function totals(from, to) {
  const t = one(`SELECT COUNT(*) sessions, COUNT(DISTINCT visitor_id) visitors, COALESCE(SUM(is_new), 0) newVisitors,
      COALESCE(SUM(channel <> ''), 0) measured, COALESCE(SUM(${BOUNCE}), 0) bounces,
      COALESCE(SUM(active_s), 0) active, COALESCE(SUM(channel <> '' AND interact > 0), 0) engaged
    FROM analytics_sessions WHERE ts >= ? AND ts < ?`, from, to);
  const h = one(`SELECT COALESCE(SUM(type = 'pageview'), 0) pageviews, COALESCE(SUM(type = 'contact'), 0) contacts,
      COALESCE(SUM(type = 'search'), 0) searches FROM analytics_hits WHERE ts >= ? AND ts < ?`, from, to);
  const e = one(`SELECT COALESCE(SUM(type = 'post_view'), 0) postViews, COALESCE(SUM(type = 'post_click'), 0) postClicks,
      COUNT(DISTINCT CASE WHEN type = 'post_view' THEN visitor_id END) uniquePostViews,
      COUNT(DISTINCT CASE WHEN type = 'post_click' THEN visitor_id END) uniquePostClicks,
      COALESCE(SUM(type = 'editorial_view'), 0) editorialViews, COALESCE(SUM(type = 'editorial_click'), 0) editorialClicks
    FROM analytics_events WHERE created_at >= ? AND created_at < ?`, from, to);
  const posts = one(`SELECT COUNT(*) c FROM posts WHERE status NOT IN ('pending_payment') AND created_at >= ? AND created_at < ?`, from, to).c || 0;
  const subs = one(`SELECT COUNT(*) c FROM email_subscriptions WHERE created_at >= ? AND created_at < ?`, from, to).c || 0;
  return {
    sessions: t.sessions || 0, visitors: t.visitors || 0, newVisitors: t.newVisitors || 0,
    returningVisitors: Math.max(0, (t.visitors || 0) - (t.newVisitors || 0)),
    pageviews: h.pageviews, contacts: h.contacts, searches: h.searches,
    pagesPerSession: t.sessions ? Math.round((h.pageviews / t.sessions) * 100) / 100 : 0,
    bounceRate: pct(t.bounces, t.measured), avgEngaged: t.measured ? Math.round(t.active / t.measured) : 0,
    engagedRate: pct(t.engaged, t.measured),
    postViews: e.postViews, postClicks: e.postClicks, uniquePostViews: e.uniquePostViews, uniquePostClicks: e.uniquePostClicks,
    editorialViews: e.editorialViews, editorialClicks: e.editorialClicks,
    newPosts: posts, newSubscribers: subs,
    revenueUsd: netRevenue('usd', from, to), revenueGbp: netRevenue('gbp', from, to),
  };
}

// Titles for the post/editorial detail pages that show up in page tables.
function withTitles(rows) {
  const postIds = new Set(), edIds = new Set();
  rows.forEach((r) => {
    const m = /^\/(classifieds|listings|simchas|editorials)\/([^/]+)$/.exec(r.path || '');
    if (!m || m[2] === 'submit') return;
    (m[1] === 'editorials' ? edIds : postIds).add(m[2]);
  });
  const titles = {};
  const lookup = (table, ids) => {
    const list = [...ids];
    if (!list.length) return;
    all(`SELECT public_id, title FROM ${table} WHERE public_id IN (${list.map(() => '?').join(',')})`, ...list)
      .forEach((p) => { titles[p.public_id] = p.title; });
  };
  lookup('posts', postIds); lookup('editorials', edIds);
  return rows.map((r) => {
    const m = /^\/(classifieds|listings|simchas|editorials)\/([^/]+)$/.exec(r.path || '');
    return m && titles[m[2]] ? { ...r, title: titles[m[2]] } : r;
  });
}

const SECTION = `CASE
  WHEN path = '/' THEN 'Home'
  WHEN path = '/classifieds' THEN 'Classifieds (browsing)'
  WHEN path LIKE '/classifieds/%' THEN 'A classified'
  WHEN path = '/listings' THEN 'Listings (browsing)'
  WHEN path LIKE '/listings/%' THEN 'A business listing'
  WHEN path = '/simchas' THEN 'Simchas (browsing)'
  WHEN path LIKE '/simchas/%' THEN 'A simcha'
  WHEN path = '/search' THEN 'Search results'
  WHEN path = '/post' THEN 'Posting form'
  WHEN path LIKE '/editorials%' THEN 'Editorials'
  WHEN path = '/pricing' THEN 'Pricing'
  WHEN path = '/subscribe' OR path = '/digest-all' THEN 'Email updates'
  WHEN path = '/bookmarks' THEN 'Bookmarks'
  WHEN path = '/contact' THEN 'Contact'
  ELSE 'Other' END`;

function computeStats({ from, to, tz = 0, compare = true, bounds = null }) {
  const off = Math.round(tz) * 60; // seconds east of UTC
  const R = [from, to];
  const S = "FROM analytics_sessions WHERE ts >= ? AND ts < ?";
  const H = "FROM analytics_hits WHERE ts >= ? AND ts < ?";

  // Day (or hour) buckets are chosen by the browser, in its own calendar,
  // and arrive as a list of start times - so a "day" on the chart is the
  // admin's day, including across a clock change.
  const bs = Array.isArray(bounds) ? bounds.map((x) => Math.trunc(Number(x))).filter(Number.isFinite) : [];
  const useB = bs.length > 0 && bs.length <= 800 && bs.every((x, i) => i === 0 || x > bs[i - 1]);
  let series = [];
  if (useB) {
    const bvals = bs.map((x, i) => `(${i},${x},${i + 1 < bs.length ? bs[i + 1] : Math.trunc(to)})`).join(',');
    const pick = (rows) => Object.fromEntries(rows.map((r) => [r.i, r]));
    const sv = pick(all(`WITH b(i,s,e) AS (VALUES ${bvals}) SELECT b.i i, COUNT(*) sessions, COUNT(DISTINCT x.visitor_id) visitors FROM analytics_sessions x JOIN b ON x.ts >= b.s AND x.ts < b.e WHERE x.ts >= ? AND x.ts < ? GROUP BY b.i`, ...R));
    const pv = pick(all(`WITH b(i,s,e) AS (VALUES ${bvals}) SELECT b.i i, COUNT(*) pageviews FROM analytics_hits x JOIN b ON x.ts >= b.s AND x.ts < b.e WHERE x.type = 'pageview' AND x.ts >= ? AND x.ts < ? GROUP BY b.i`, ...R));
    const po = pick(all(`WITH b(i,s,e) AS (VALUES ${bvals}) SELECT b.i i, COUNT(*) postViews FROM analytics_events x JOIN b ON x.created_at >= b.s AND x.created_at < b.e WHERE x.type = 'post_view' AND x.created_at >= ? AND x.created_at < ? GROUP BY b.i`, ...R));
    const rv = pick(all(`WITH b(i,s,e) AS (VALUES ${bvals}) SELECT b.i i,
        SUM(CASE WHEN x.currency = 'usd' THEN x.amount_cents - x.refunded_cents ELSE 0 END) usd,
        SUM(CASE WHEN x.currency = 'gbp' THEN x.amount_cents - x.refunded_cents ELSE 0 END) gbp
      FROM post_payments x JOIN b ON x.created_at >= b.s AND x.created_at < b.e WHERE x.status = 'paid' AND x.created_at >= ? AND x.created_at < ? GROUP BY b.i`, ...R));
    series = bs.map((_, i) => ({
      i, sessions: (sv[i] || {}).sessions || 0, visitors: (sv[i] || {}).visitors || 0, pageviews: (pv[i] || {}).pageviews || 0,
      postViews: (po[i] || {}).postViews || 0, revenueUsd: (rv[i] || {}).usd || 0, revenueGbp: (rv[i] || {}).gbp || 0,
    }));
  }

  const timeBy = Object.fromEntries(all(`SELECT path, AVG(value) secs, AVG(json_extract(extra, '$.sc')) scroll ${H} AND type = 'pageend' GROUP BY path`, ...R).map((r) => [r.path, r]));
  const pages = withTitles(all(`SELECT path, COUNT(*) views, COUNT(DISTINCT sid) uniques ${H} AND type = 'pageview' GROUP BY path ORDER BY views DESC LIMIT 40`, ...R))
    .map((r) => ({ ...r, secs: timeBy[r.path] ? Math.round(timeBy[r.path].secs || 0) : null, scroll: timeBy[r.path] && timeBy[r.path].scroll != null ? Math.round(timeBy[r.path].scroll) : null }));

  const vit = {};
  all(`SELECT e.name, e.value, s.device FROM analytics_hits e JOIN analytics_sessions s ON s.sid = e.sid WHERE e.type = 'vital' AND e.ts >= ? AND e.ts < ? LIMIT 20000`, ...R)
    .forEach((r) => { const v = (vit[r.name] = vit[r.name] || { all: [], mobile: [], desktop: [] }); v.all.push(r.value); v[r.device === 'desktop' ? 'desktop' : 'mobile'].push(r.value); });
  const vitals = {};
  Object.keys(vit).forEach((k) => { vitals[k] = { n: vit[k].all.length, p50: quantile(vit[k].all, 0.5), p75: quantile(vit[k].all, 0.75), mobile75: quantile(vit[k].mobile, 0.75), desktop75: quantile(vit[k].desktop, 0.75) }; });

  // Posting funnel: one row per visit, did it reach each step.
  const funnel = one(`SELECT COUNT(*) total, SUM(home) home, SUM(browsed) browsed, SUM(viewed) viewed, SUM(contacted) contacted,
      SUM(pform) pform, SUM(ptype) ptype, SUM(pcat) pcat, SUM(pdetails) pdetails, SUM(preview) preview, SUM(psubmit) psubmit, SUM(pdone) pdone,
      SUM(searched) searched, SUM(chat) chat, SUM(chatq) chatq, SUM(saved) saved, SUM(shared) shared, SUM(subscribed) subscribed
    FROM (SELECT sid,
      MAX(type = 'pageview' AND path = '/') home,
      MAX(type = 'pageview' AND path IN ('/classifieds', '/listings', '/simchas', '/search')) browsed,
      MAX(type = 'pageview' AND (path LIKE '/classifieds/%' OR path LIKE '/listings/%' OR path LIKE '/simchas/%')) viewed,
      MAX(type = 'contact') contacted,
      MAX(type = 'pageview' AND path = '/post') pform,
      MAX(type = 'post' AND name = 'type') ptype, MAX(type = 'post' AND name = 'category') pcat,
      MAX(type = 'post' AND name = 'details') pdetails, MAX(type = 'post' AND name = 'review') preview,
      MAX(type = 'post' AND name = 'submit') psubmit, MAX(type = 'post' AND name = 'done') pdone,
      MAX(type = 'search') searched, MAX(type = 'chat' AND name = 'open') chat, MAX(type = 'chat' AND name = 'send') chatq,
      MAX(type = 'bookmark' AND name = 'add') saved, MAX(type = 'share') shared, MAX(type = 'subscribe') subscribed
    ${H} GROUP BY sid)`, ...R);

  const topPosts = all(`SELECT p.id, p.public_id AS publicId, p.title, p.type, p.category,
      SUM(e.type = 'post_view') views, SUM(e.type = 'post_click') clicks,
      COUNT(DISTINCT CASE WHEN e.type = 'post_view' THEN e.visitor_id END) uniqueViews,
      COUNT(DISTINCT CASE WHEN e.type = 'post_click' THEN e.visitor_id END) uniqueClicks
    FROM analytics_events e JOIN posts p ON p.id = e.post_id
    WHERE e.type IN ('post_view', 'post_click') AND e.created_at >= ? AND e.created_at < ?
    GROUP BY p.id ORDER BY clicks DESC, views DESC LIMIT 20`, ...R);
  const contactsBy = Object.fromEntries(all(`SELECT ref, COUNT(*) n ${H} AND type = 'contact' AND ref IS NOT NULL GROUP BY ref`, ...R).map((r) => [r.ref, r.n]));
  topPosts.forEach((p) => { p.contacts = contactsBy[p.publicId] || 0; });

  const out = {
    range: { from, to, tz, hourly: to - from <= 2 * DAY + 3600000 },
    totals: totals(from, to),
    series,
    heat: all(`SELECT CAST(strftime('%w', ts / 1000 + ${off}, 'unixepoch') AS INTEGER) d, CAST(strftime('%H', ts / 1000 + ${off}, 'unixepoch') AS INTEGER) h, COUNT(*) n ${S} GROUP BY d, h`, ...R),
    pages,
    sections: all(`SELECT ${SECTION} k, COUNT(*) n ${H} AND type = 'pageview' GROUP BY k ORDER BY n DESC`, ...R),
    entry: withTitles(all(`SELECT landing path, COUNT(*) sessions, SUM(${BOUNCE}) bounces, SUM(channel <> '') measured ${S} GROUP BY landing ORDER BY sessions DESC LIMIT 15`, ...R))
      .map((r) => ({ ...r, bounceRate: pct(r.bounces, r.measured) })),
    exit: withTitles(all(`SELECT exit_path path, COUNT(*) sessions ${S} GROUP BY exit_path ORDER BY sessions DESC LIMIT 15`, ...R)),
    channels: all(`SELECT channel, COUNT(*) sessions, COUNT(DISTINCT visitor_id) visitors, SUM(${BOUNCE}) bounces, AVG(active_s) engaged ${S} AND channel <> '' GROUP BY channel ORDER BY sessions DESC`, ...R)
      .map((r) => ({ ...r, bounceRate: pct(r.bounces, r.sessions), engaged: Math.round(r.engaged || 0) })),
    referrers: all(`SELECT ref_host host, COUNT(*) sessions ${S} AND ref_host <> '' GROUP BY ref_host ORDER BY sessions DESC LIMIT 20`, ...R),
    campaigns: all(`SELECT utm_source s, utm_medium m, utm_campaign c, COUNT(*) sessions ${S} AND (utm_source <> '' OR utm_medium <> '' OR utm_campaign <> '') GROUP BY s, m, c ORDER BY sessions DESC LIMIT 20`, ...R),
    domains: all(`SELECT COALESCE(NULLIF(domain, ''), '(unknown)') k, COUNT(*) n, COUNT(DISTINCT visitor_id) visitors ${S} GROUP BY k ORDER BY n DESC`, ...R),
    geo: {
      countries: all(`SELECT country k, COUNT(*) n ${S} AND country <> '' GROUP BY k ORDER BY n DESC LIMIT 20`, ...R),
      timezones: all(`SELECT tz k, COUNT(*) n ${S} AND tz <> '' GROUP BY k ORDER BY n DESC LIMIT 15`, ...R),
      searchedNear: all(`SELECT json_extract(extra, '$.l') k, COUNT(*) n ${H} AND type = 'location' GROUP BY k ORDER BY n DESC LIMIT 15`, ...R),
    },
    tech: {
      devices: all(`SELECT device k, COUNT(*) n ${S} AND device <> '' GROUP BY k ORDER BY n DESC`, ...R),
      os: all(`SELECT os k, COUNT(*) n ${S} AND os <> '' GROUP BY k ORDER BY n DESC`, ...R),
      browsers: all(`SELECT browser k, COUNT(*) n ${S} AND browser <> '' GROUP BY k ORDER BY n DESC`, ...R),
      screens: all(`SELECT screen k, COUNT(*) n ${S} AND screen <> '' GROUP BY k ORDER BY n DESC`, ...R),
      langs: all(`SELECT lang k, COUNT(*) n ${S} AND lang <> '' GROUP BY k ORDER BY n DESC LIMIT 12`, ...R),
    },
    sessionLength: all(`SELECT CASE WHEN active_s < 10 THEN '0-10s' WHEN active_s < 30 THEN '10-30s' WHEN active_s < 60 THEN '30-60s' WHEN active_s < 180 THEN '1-3 min' ELSE '3+ min' END k, COUNT(*) n ${S} AND channel <> '' GROUP BY k`, ...R),
    clicks: all(`SELECT name cat, json_extract(extra, '$.l') label, COUNT(*) n ${H} AND type = 'click' GROUP BY cat, label ORDER BY n DESC LIMIT 30`, ...R),
    search: {
      terms: all(`SELECT json_extract(extra, '$.q') q, COUNT(*) n, COUNT(DISTINCT sid) visits, ROUND(AVG(value), 1) results ${H} AND type = 'search' AND json_extract(extra, '$.q') <> '' GROUP BY q ORDER BY n DESC LIMIT 40`, ...R),
      empty: all(`SELECT json_extract(extra, '$.q') q, COUNT(*) n, MAX(ts) last ${H} AND type = 'search' AND value = 0 AND json_extract(extra, '$.q') <> '' GROUP BY q ORDER BY n DESC LIMIT 40`, ...R),
      where: all(`SELECT name k, COUNT(*) n ${H} AND type = 'search' GROUP BY name ORDER BY n DESC`, ...R),
      totals: one(`SELECT COUNT(*) searches, COALESCE(SUM(value = 0), 0) empty, COUNT(DISTINCT sid) visits ${H} AND type = 'search'`, ...R),
    },
    contact: {
      methods: all(`SELECT name k, COUNT(*) n ${H} AND type = 'contact' GROUP BY name ORDER BY n DESC`, ...R),
    },
    funnel,
    posting: {
      byType: all(`SELECT json_extract(extra, '$.t') k, COUNT(DISTINCT sid) n ${H} AND type = 'post' AND name = 'type' GROUP BY k ORDER BY n DESC`, ...R),
      errors: all(`SELECT json_extract(extra, '$.m') k, COUNT(*) n ${H} AND type = 'post' AND name = 'error' GROUP BY k ORDER BY n DESC LIMIT 10`, ...R),
      created: all(`SELECT type k, COUNT(*) n FROM posts WHERE status NOT IN ('pending_payment') AND created_at >= ? AND created_at < ? GROUP BY type ORDER BY n DESC`, ...R),
    },
    chat: one(`SELECT COALESCE(SUM(name = 'open'), 0) opens, COALESCE(SUM(name = 'send'), 0) sends, COALESCE(SUM(name = 'miss'), 0) misses,
        COALESCE(SUM(name = 'up'), 0) ups, COALESCE(SUM(name = 'down'), 0) downs, COALESCE(SUM(name = 'handoff'), 0) handoffs,
        COALESCE(SUM(name = 'posted'), 0) posted, COALESCE(SUM(name = 'checkout'), 0) checkouts, COALESCE(SUM(name = 'found'), 0) found,
        COALESCE(SUM(name = 'photo'), 0) photos, COALESCE(SUM(name = 'voice'), 0) voices, COALESCE(SUM(name = 'restart'), 0) restarts
      ${H} AND type = 'chat'`, ...R),
    form: one(`SELECT COALESCE(SUM(name = 'start'), 0) starts, COALESCE(SUM(name = 'submit'), 0) submits, COALESCE(SUM(name = 'ok'), 0) oks ${H} AND type = 'form'`, ...R),
    shareMethods: all(`SELECT name k, COUNT(*) n ${H} AND type = 'share' GROUP BY name ORDER BY n DESC`, ...R),
    posts: {
      top: topPosts,
      byType: all(`SELECT post_type k, COUNT(*) n FROM analytics_events WHERE type = 'post_view' AND created_at >= ? AND created_at < ? AND post_type IS NOT NULL GROUP BY post_type ORDER BY n DESC`, ...R),
      byCategory: all(`SELECT category k, SUM(type = 'post_view') views, SUM(type = 'post_click') clicks FROM analytics_events WHERE type IN ('post_view', 'post_click') AND created_at >= ? AND created_at < ? AND category IS NOT NULL GROUP BY category ORDER BY views DESC LIMIT 15`, ...R),
    },
    editorials: {
      top: all(`SELECT ed.public_id AS publicId, ed.title, ed.like_count AS likes, SUM(e.type = 'editorial_view') views, SUM(e.type = 'editorial_click') clicks
        FROM analytics_events e JOIN editorials ed ON ed.id = e.editorial_id
        WHERE e.type IN ('editorial_view', 'editorial_click') AND e.created_at >= ? AND e.created_at < ? GROUP BY ed.id ORDER BY views DESC LIMIT 10`, ...R),
      byStatus: all('SELECT status k, COUNT(*) n FROM editorials GROUP BY status'),
    },
    revenue: {
      byKind: all(`SELECT kind k, currency, SUM(amount_cents) - SUM(refunded_cents) cents, COUNT(*) n FROM post_payments WHERE status = 'paid' AND created_at >= ? AND created_at < ? GROUP BY kind, currency ORDER BY cents DESC`, ...R),
      // Which traffic source the paying visits came from - only payments
      // completed in the browser that started them can be tied to a visit.
      byChannel: all(`SELECT s.channel k, COUNT(*) n, SUM(h.value) cents FROM analytics_hits h JOIN analytics_sessions s ON s.sid = h.sid
        WHERE h.type = 'post' AND h.name = 'paid' AND h.ts >= ? AND h.ts < ? GROUP BY s.channel ORDER BY cents DESC`, ...R),
      payments: one(`SELECT COUNT(*) n, COUNT(DISTINCT payer_email) payers FROM post_payments WHERE status = 'paid' AND created_at >= ? AND created_at < ?`, ...R),
    },
    vitals,
    errors: all(`SELECT name msg, COUNT(*) n, MAX(ts) last, MAX(path) path, MAX(json_extract(extra, '$.s')) src ${H} AND type = 'error' GROUP BY name ORDER BY n DESC LIMIT 20`, ...R),
    firstVisit: one('SELECT MIN(ts) ts, MIN(CASE WHEN channel <> \'\' THEN ts END) detailedSince FROM analytics_sessions'),
  };
  if (compare) out.previous = totals(from - (to - from), from);
  return out;
}

function liveStats() {
  const now = Date.now();
  return {
    now,
    active: all(`SELECT sid, exit_path path, country, device, browser, channel, domain, last_ts, is_new FROM analytics_sessions WHERE last_ts >= ? ORDER BY last_ts DESC LIMIT 50`, now - 5 * 60000),
    recent: all(`SELECT e.ts, e.type, e.name, e.path, e.ref, e.extra, e.value, s.country, s.device, e.sid, p.title post_title
      FROM analytics_hits e JOIN analytics_sessions s ON s.sid = e.sid LEFT JOIN posts p ON p.public_id = e.ref
      WHERE e.type NOT IN ('pageend', 'vital') ORDER BY e.id DESC LIMIT 40`),
    last24h: one(`SELECT COUNT(*) sessions, COALESCE(SUM(pages), 0) pageviews, COUNT(DISTINCT visitor_id) visitors FROM analytics_sessions WHERE ts >= ?`, now - DAY),
  };
}

function recentSessions(from, to, limit = 80) {
  return all(`SELECT sid, ts, last_ts, landing, exit_path, channel, ref_host, country, device, os, browser, domain, is_new, pages, events, interact, active_s
    FROM analytics_sessions WHERE ts >= ? AND ts < ? ORDER BY ts DESC LIMIT ?`, from, to, limit);
}

function sessionTimeline(sid) {
  if (!/^[A-Za-z0-9]{8,24}$/.test(sid || '')) return null;
  const session = db.prepare('SELECT * FROM analytics_sessions WHERE sid = ?').get(sid);
  if (!session) return null;
  delete session.visitor_id;
  const events = all(`SELECT e.ts, e.type, e.name, e.value, e.path, e.ref, e.extra, p.title post_title
    FROM analytics_hits e LEFT JOIN posts p ON p.public_id = e.ref WHERE e.sid = ? ORDER BY e.ts, e.id LIMIT 500`, sid);
  return { session, events };
}

const csvCell = (v) => { if (v == null) return ''; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function exportCsv(kind, from, to) {
  const events = kind === 'events';
  const cols = events
    ? ['id', 'sid', 'ts', 'type', 'name', 'value', 'path', 'ref', 'extra']
    : ['sid', 'ts', 'last_ts', 'is_new', 'domain', 'landing', 'exit_path', 'ref_host', 'ref_url', 'utm_source', 'utm_medium', 'utm_campaign', 'channel', 'country', 'tz', 'device', 'os', 'browser', 'lang', 'screen', 'pages', 'events', 'interact', 'active_s'];
  const rows = all(`SELECT ${cols.join(',')} FROM ${events ? 'analytics_hits' : 'analytics_sessions'} WHERE ts >= ? AND ts < ? ORDER BY ts LIMIT 200000`, from, to);
  const iso = (v) => (v ? new Date(v).toISOString() : '');
  const lines = [cols.join(',')];
  rows.forEach((r) => lines.push(cols.map((c) => csvCell(c === 'ts' || c === 'last_ts' ? iso(r[c]) : r[c])).join(',')));
  return lines.join('\n');
}

function resetStats() {
  db.transaction(() => { db.prepare('DELETE FROM analytics_hits').run(); db.prepare('DELETE FROM analytics_sessions').run(); })();
}

module.exports = { computeStats, totals, liveStats, recentSessions, sessionTimeline, exportCsv, resetStats };
