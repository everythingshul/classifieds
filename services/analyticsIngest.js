// Collects visit analytics sent by public/js/analytics.js (POST
// /api/analytics/t) into analytics_sessions + analytics_hits. Modelled on the
// portfolio site's collector: first-party, no cookies, no IP stored, bots
// dropped. What this site adds: a persistent anonymous visitor id (so new vs
// returning is exact), search terms, the posting funnel, contact taps per
// post and which domain (.com / .co.uk) the visit was on.
const crypto = require('crypto');
const db = require('../db');

const MAX_EVENTS = 30;

const str = (v, n) => (v == null ? '' : String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n));
const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0; };
const sidOk = (s) => /^[A-Za-z0-9]{8,24}$/.test(s || '');

const TYPES = {
  pv: 'pageview', pe: 'pageend', ck: 'click', ct: 'contact', se: 'search', pw: 'post', ch: 'chat',
  bm: 'bookmark', sh: 'share', sb: 'subscribe', fm: 'form', lc: 'location', er: 'error', vt: 'vital',
};
const NO_INTERACT = new Set(['pageview', 'pageend', 'error', 'vital']);

const BOTS = /bot\b|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|preview|fetch|curl|wget|python|java\/|go-http|okhttp|httpclient|axios|node-fetch|facebookexternalhit|whatsapp|telegram|slackbot|twitterbot|discordbot|linkedinbot|skype|embedly|bingpreview|google-read|gtmetrix|semrush|ahrefs|mj12|yandex|baidu|petalbot|bytespider|applebot|duckduckbot|phantomjs|puppeteer|playwright/i;

function parseUA(ua, width, touch) {
  let browser = 'Other';
  if (/FBAN|FBAV|FB_IAB/.test(ua)) browser = 'Facebook app';
  else if (/Instagram/.test(ua)) browser = 'Instagram app';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = 'Other';
  if (/iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/iPad/.test(ua)) os = 'iPadOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/.test(ua)) os = touch > 1 ? 'iPadOS' : 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let device = 'desktop';
  if (/iPad|Tablet/.test(ua) || os === 'iPadOS' || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'tablet';
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = 'mobile';
  else if (width && width < 600) device = 'mobile';
  return { browser, os, device };
}

const screenBucket = (w) => (!w ? '' : w < 480 ? '<480' : w < 768 ? '480-767' : w < 1024 ? '768-1023' : w < 1440 ? '1024-1439' : '1440+');

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave|startpage|qwant|ask)\.[a-z.]+$/;
const SOCIAL = /(^|\.)(facebook|fb|instagram|twitter|x|t|linkedin|lnkd|whatsapp|wa|telegram|youtube|youtu|reddit|pinterest|tiktok|threads|snapchat)\.(com|co|me|be|in)$/;
const MAILH = /(^|\.)(mail\.google|outlook\.live|outlook\.office|mail\.yahoo|mail\.aol|proton)\./;

function channelOf({ refHost, medium, source }, siteHost) {
  const m = (medium || '').toLowerCase();
  if (/^(cpc|ppc|paid|paidsearch|display|banner)/.test(m)) return 'Paid';
  if (/^(email|e-mail|newsletter|digest)/.test(m)) return 'Email';
  if (/^(social|sm|social-network)/.test(m)) return 'Social';
  if (source || m) return 'Campaign';
  if (!refHost || refHost === siteHost) return 'Direct';
  if (MAILH.test(refHost)) return 'Email';
  if (SEARCH.test(refHost)) return 'Search';
  if (SOCIAL.test(refHost)) return 'Social';
  if (/(^|\.)jlistings\.(com|co\.uk)$/.test(refHost)) return 'Our other site';
  return 'Referral';
}

// The host doesn't hand us a visitor's location, and IPs are never stored or
// sent to a lookup service. If the site sits behind a CDN that adds a country
// header, that's used; otherwise the browser's time zone gives the country
// for the places this community lives. Unknown zones stay blank.
const TZ_COUNTRY = {
  'Europe/London': 'GB', 'Europe/Belfast': 'GB', 'Europe/Dublin': 'IE', 'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Amsterdam': 'NL', 'Europe/Berlin': 'DE', 'Europe/Zurich': 'CH',
  'Europe/Vienna': 'AT', 'Europe/Rome': 'IT', 'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR', 'Europe/Kiev': 'UA',
  'Europe/Kyiv': 'UA', 'Europe/Moscow': 'RU', 'Asia/Dubai': 'AE', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Manila': 'PH', 'Asia/Singapore': 'SG', 'Asia/Hong_Kong': 'HK',
  'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Pacific/Auckland': 'NZ', 'Africa/Johannesburg': 'ZA',
  'Africa/Lagos': 'NG', 'Africa/Cairo': 'EG', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO', 'America/Panama': 'PA', 'America/Puerto_Rico': 'PR',
  'America/Toronto': 'CA', 'America/Montreal': 'CA', 'America/Vancouver': 'CA', 'America/Winnipeg': 'CA',
  'America/Edmonton': 'CA', 'America/Halifax': 'CA', 'America/Regina': 'CA', 'America/St_Johns': 'CA',
  'America/New_York': 'US', 'America/Detroit': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Phoenix': 'US', 'America/Los_Angeles': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Boise': 'US', 'America/Indiana/Indianapolis': 'US', 'America/Kentucky/Louisville': 'US',
};
function countryFor(req, tz) {
  const h = str(req.get('cf-ipcountry') || req.get('x-vercel-ip-country') || req.get('cloudfront-viewer-country') || req.get('x-country-code'), 3).toUpperCase();
  if (/^[A-Z]{2}$/.test(h) && h !== 'XX' && h !== 'T1') return h;
  return TZ_COUNTRY[tz] || '';
}

// Only when the browser couldn't give us its stored visitor id (storage
// blocked): a one-way code from IP + browser that changes daily. The IP
// itself never leaves this function.
function fallbackVisitorId(req, ua) {
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.JWT_SECRET || 'jl';
  return 'd-' + crypto.createHash('sha256').update(`${salt}|${day}|${req.ip || ''}|${ua}`).digest('hex').slice(0, 16);
}

const upsertSession = db.prepare(`
  INSERT INTO analytics_sessions (sid, ts, last_ts, visitor_id, is_new, domain, landing, exit_path, ref_host, ref_url,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, channel, country, tz, device, os, browser, lang, screen,
    pages, events, interact, active_s)
  VALUES (@sid, @ts, @last_ts, @visitor_id, @is_new, @domain, @landing, @exit_path, @ref_host, @ref_url,
    @utm_source, @utm_medium, @utm_campaign, @utm_term, @utm_content, @channel, @country, @tz, @device, @os, @browser, @lang, @screen,
    @pages, @events, @interact, @active_s)
  ON CONFLICT(sid) DO UPDATE SET last_ts = MAX(last_ts, excluded.last_ts), exit_path = excluded.exit_path,
    pages = pages + excluded.pages, events = events + excluded.events, interact = interact + excluded.interact,
    active_s = active_s + excluded.active_s
`);
const insertHit = db.prepare('INSERT INTO analytics_hits (sid, ts, type, name, value, path, ref, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const sessionExists = db.prepare('SELECT 1 FROM analytics_sessions WHERE sid = ?');
const seenBefore = db.prepare(`SELECT
  EXISTS (SELECT 1 FROM analytics_sessions WHERE visitor_id = ? AND sid <> ?) OR
  EXISTS (SELECT 1 FROM analytics_events WHERE visitor_id = ? AND created_at < ?) AS seen`);

const writeBatch = db.transaction((session, hits) => {
  upsertSession.run(session);
  hits.forEach((h) => insertHit.run(session.sid, h.ts, h.type, h.name, h.value, h.path, h.ref, h.extra));
});

// body: { s: {sid, vid, path, ref, w, lang, tz, tp, utm}, e: [{t, n, v, j, p, x, d}] }
// Returns an HTTP status. Never throws - analytics must not break the site.
function ingest(req, body) {
  const ua = req.get('user-agent') || '';
  if (!ua || BOTS.test(ua)) return 204;
  const s = body && body.s;
  if (!s || !sidOk(s.sid) || !Array.isArray(body.e) || !body.e.length) return 400;

  const now = Date.now();
  const dev = parseUA(ua, num(s.w, 0, 10000), num(s.tp, 0, 50));
  const siteHost = String(req.get('host') || '').toLowerCase().replace(/^www\./, '');

  let refHost = '', refUrl = '';
  try { if (s.ref) { const u = new URL(String(s.ref)); refHost = u.host.replace(/^www\./, ''); refUrl = (u.host + u.pathname).slice(0, 200); } } catch (e) { /* not a URL */ }
  const u = s.utm || {};
  const path0 = str(s.path, 200) || '/';
  const tz = str(s.tz, 60);

  const hits = [];
  let pages = 0, interact = 0, active = 0, lastPath = path0;
  for (const e of body.e.slice(0, MAX_EVENTS)) {
    const type = TYPES[e && e.t];
    if (!type) continue;
    const path = str(e.p, 200) || lastPath;
    let extra = null;
    if (e.x && typeof e.x === 'object') {
      const clean = {};
      Object.keys(e.x).slice(0, 8).forEach((k) => { const v = e.x[k]; clean[str(k, 16)] = typeof v === 'number' ? v : str(v, 120); });
      extra = JSON.stringify(clean);
    }
    if (type === 'pageview') { pages++; lastPath = path; }
    if (type === 'pageend') { active += num(e.v, 0, 36000); lastPath = path; }
    if (!NO_INTERACT.has(type)) interact++;
    hits.push({
      ts: now - num(e.d, 0, 6 * 3600 * 1000), type, name: str(e.n, 60),
      value: e.v == null ? null : num(e.v, -1e7, 1e9), path, ref: str(e.j, 40) || null, extra,
    });
  }
  if (!hits.length) return 204;

  try {
    const visitorId = str(s.vid, 100) || fallbackVisitorId(req, ua);
    const isNew = sessionExists.get(s.sid) ? 0 : (seenBefore.get(visitorId, s.sid, visitorId, now - 30 * 60 * 1000).seen ? 0 : 1);
    writeBatch({
      sid: s.sid, ts: now, last_ts: now, visitor_id: visitorId, is_new: isNew, domain: siteHost,
      landing: path0, exit_path: lastPath, ref_host: refHost, ref_url: refUrl,
      utm_source: str(u.s, 60), utm_medium: str(u.m, 60), utm_campaign: str(u.c, 80), utm_term: str(u.t, 60), utm_content: str(u.n, 60),
      channel: channelOf({ refHost, medium: str(u.m, 60), source: str(u.s, 60) }, siteHost),
      country: countryFor(req, tz), tz, device: dev.device, os: dev.os, browser: dev.browser,
      lang: str(s.lang, 12), screen: screenBucket(num(s.w, 0, 10000)),
      pages, events: hits.length, interact, active_s: active,
    }, hits);
  } catch (err) {
    console.error('[analytics] ingest failed:', err.message);
  }
  return 204;
}

// Visits older than the retention window are deleted daily (utils/cron.js).
const RETENTION_DAYS = 395;
function purgeOld() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const a = db.prepare('DELETE FROM analytics_hits WHERE ts < ?').run(cutoff).changes;
  const b = db.prepare('DELETE FROM analytics_sessions WHERE last_ts < ?').run(cutoff).changes;
  if (a || b) console.log(`[analytics] purged ${b} old visit(s), ${a} hit(s)`);
}

// One-time: rebuild visits from the page views the old collector stored
// (analytics_events type='pageview'), so the new dashboard isn't empty for
// dates before it shipped. A visitor's page views less than 30 minutes apart
// are one visit. Those visits have no source/device/time data (it was never
// collected) - channel is left '' and the breakdowns skip them.
function backfillFromLegacy() {
  const FLAG = 'migration_analytics_sessions_backfill_done';
  if (db.prepare('SELECT 1 FROM site_settings WHERE key = ?').get(FLAG)) return;
  const rows = db.prepare("SELECT visitor_id, path, domain, created_at FROM analytics_events WHERE type = 'pageview' ORDER BY visitor_id, created_at").all();
  const insS = db.prepare(`INSERT OR IGNORE INTO analytics_sessions (sid, ts, last_ts, visitor_id, is_new, domain, landing, exit_path, channel, pages, events)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`);
  let made = 0;
  db.transaction(() => {
    let cur = null;
    const seen = new Set();
    const close = () => {
      if (!cur) return;
      insS.run(cur.sid, cur.ts, cur.last, cur.vid, cur.isNew, cur.domain, cur.landing, cur.exit, cur.pages, cur.pages);
      cur.hits.forEach((h) => insertHit.run(cur.sid, h.ts, 'pageview', '', null, h.path, null, null));
      made++;
    };
    for (const r of rows) {
      if (!cur || cur.vid !== r.visitor_id || r.created_at - cur.last > 30 * 60 * 1000) {
        close();
        cur = { sid: 'L' + crypto.randomBytes(8).toString('hex'), vid: r.visitor_id, ts: r.created_at, last: r.created_at, domain: r.domain || '', landing: r.path, exit: r.path, pages: 0, hits: [], isNew: seen.has(r.visitor_id) ? 0 : 1 };
        seen.add(r.visitor_id);
      }
      cur.last = r.created_at; cur.exit = r.path; cur.pages++;
      cur.hits.push({ ts: r.created_at, path: r.path });
    }
    close();
    db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(FLAG, JSON.stringify({ ranAt: Date.now(), visits: made, pageviews: rows.length }));
  })();
  if (made) console.log(`[analytics] rebuilt ${made} past visit(s) from ${rows.length} stored page view(s)`);
}

module.exports = { ingest, purgeOld, backfillFromLegacy, parseUA, channelOf };
