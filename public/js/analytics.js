// Visit analytics for the public site. First-party only (posts to this
// site's own /api/analytics/t), no cookies. Stored on the visitor's device:
// a random anonymous id in localStorage (new vs returning visitors) and a
// per-tab visit id in sessionStorage. Never sends names, emails, phone
// numbers, or anything typed into a form or to Chesky - search terms are the
// one piece of typed text recorded. Honors Do Not Track and Global Privacy
// Control. Server side: services/analyticsIngest.js.
//
// Other scripts report their own events with Analytics.track(type, name, opts):
//   type: pv pe ck ct se pw ch bm sh sb fm lc er vt (see TYPES in analyticsIngest.js)
//   opts: { v: number, j: post public id, x: {small extra fields}, p: path }
const Analytics = (() => {
  const KEY = 'esc_visitor_id';
  // Set from the admin Analytics page's "Don't count my visits in this
  // browser" toggle - same localStorage, same origin, so an admin's own
  // browsing on the public pages stops being counted once they flip it.
  const DISABLE_KEY = 'esc_no_track';
  const EP = '/api/analytics/t';
  const nav = navigator;
  const noop = () => {};
  const get = (s, k) => { try { return s.getItem(k); } catch (e) { return null; } };
  const set = (s, k, v) => { try { s.setItem(k, v); } catch (e) { /* storage blocked */ } };

  let off = false;
  try { if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl) off = true; } catch (e) { /* ignore */ }
  // Automated browsers aren't visitors. esc_track_test lets a test opt back in.
  if (nav.webdriver && !get(localStorage, 'esc_track_test')) off = true;

  function isDisabled() {
    return off || !!get(localStorage, DISABLE_KEY);
  }

  function visitorId() {
    let id = get(localStorage, KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      set(localStorage, KEY, id);
    }
    return id || '';
  }

  /* ---------------------------------------------------------------- the visit */
  const IDLE_MS = 30 * 60 * 1000;
  const rnd = () => { const a = new Uint32Array(3); crypto.getRandomValues(a); return Array.from(a, (n) => n.toString(36)).join('').slice(0, 16); };
  const here = location.host.replace(/^www\./, '');
  let sid = get(sessionStorage, 'esc_sid');
  let ref = '';
  let utm = null;
  let landing = location.pathname || '/';
  const startedFresh = !sid || Date.now() - parseInt(get(sessionStorage, 'esc_last') || '0', 10) > IDLE_MS;
  if (startedFresh) {
    sid = rnd();
    set(sessionStorage, 'esc_sid', sid);
    try { const r = new URL(document.referrer); if (r.host.replace(/^www\./, '') !== here) ref = document.referrer; } catch (e) { /* no referrer */ }
    const p = new URLSearchParams(location.search);
    utm = { s: p.get('utm_source') || '', m: p.get('utm_medium') || '', c: p.get('utm_campaign') || '', t: p.get('utm_term') || '', n: p.get('utm_content') || '' };
    set(sessionStorage, 'esc_ctx', JSON.stringify({ ref, utm, landing }));
  } else {
    try { const c = JSON.parse(get(sessionStorage, 'esc_ctx') || 'null'); if (c) { ref = c.ref || ''; utm = c.utm || null; landing = c.landing || landing; } } catch (e) { /* ignore */ }
  }
  set(sessionStorage, 'esc_last', String(Date.now()));

  // A tab left open past the idle limit starts a new visit on its next
  // activity, with no referrer (the visitor was already here).
  function touch() {
    const now = Date.now();
    if (now - parseInt(get(sessionStorage, 'esc_last') || '0', 10) > IDLE_MS) {
      sid = rnd(); ref = ''; utm = null; landing = page.path;
      set(sessionStorage, 'esc_sid', sid);
      set(sessionStorage, 'esc_ctx', JSON.stringify({ ref, utm, landing }));
    }
    set(sessionStorage, 'esc_last', String(now));
  }

  const page = { path: location.pathname || '/', activeMs: 0, maxScroll: 0, open: false };
  const context = () => ({
    sid, vid: visitorId(), path: landing, ref, w: window.innerWidth, lang: nav.language || '',
    tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || '', tp: nav.maxTouchPoints || 0, utm,
  });

  /* ---------------------------------------------------------------- sending */
  const queue = [];
  let sent = 0, timer = null;
  const MAX = 400; // per page load - a runaway loop can't flood the server
  function flush(final) {
    if (!queue.length) return;
    const now = Date.now();
    const body = JSON.stringify({ s: context(), e: queue.splice(0, 30).map((e) => ({ t: e.t, n: e.n, v: e.v, j: e.j, p: e.p, x: e.x, d: now - e.at })) });
    try {
      if (final && nav.sendBeacon) nav.sendBeacon(EP, new Blob([body], { type: 'text/plain' }));
      else fetch(EP, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, credentials: 'omit' }).catch(noop);
    } catch (e) { /* analytics must never break the site */ }
    if (queue.length) { if (final) flush(true); else schedule(); }
  }
  // The first batch goes out after a second so even a very short visit is
  // counted without depending on the page-close beacon; later ones every 4s.
  let flushed = false;
  function schedule() { if (!timer) timer = setTimeout(() => { timer = null; flushed = true; flush(false); }, flushed ? 4000 : 1000); }

  function track(t, n, o) {
    if (isDisabled() || sent >= MAX) return;
    sent++;
    o = o || {};
    touch();
    queue.push({ t, n: n || '', v: o.v, j: o.j, p: o.p || page.path, x: o.x, at: Date.now() });
    schedule();
  }

  /* ---------------------------------------------------------------- pages (the router calls trackPageview on every route) */
  // Reported when the visitor moves to another page and whenever the tab is
  // hidden. A page reports once even with no active time (so its scroll
  // depth is kept); after that only when more time has built up, so the two
  // "leaving" events browsers fire in a row don't produce an empty duplicate.
  function endPage() {
    if (!page.open || (page.ended && page.activeMs < 1000)) return;
    track('pe', '', { v: Math.round(page.activeMs / 1000), x: { sc: page.maxScroll } });
    page.activeMs = 0;
    page.ended = true;
  }
  function trackPageview(path) {
    if (isDisabled()) return;
    endPage();
    page.path = path || location.pathname || '/';
    page.maxScroll = 0;
    page.open = true;
    page.ended = false;
    track('pv', '', { x: { t: (document.title || '').slice(0, 60) } });
    setTimeout(measureScroll, 1500);
  }

  if (!isDisabled()) {
    let lastAct = Date.now();
    ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'].forEach((ev) => addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
    setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastAct < 30000) page.activeMs += 1000;
    }, 1000);
  }

  let ticking = false;
  function measureScroll() {
    ticking = false;
    const h = document.documentElement;
    const pct = Math.round(((window.scrollY + window.innerHeight) / Math.max(h.scrollHeight, 1)) * 100);
    if (pct > page.maxScroll) page.maxScroll = Math.min(100, pct);
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(measureScroll); } }, { passive: true });

  /* ---------------------------------------------------------------- clicks */
  // The post a click belongs to: an explicit data-post on the element (or
  // an ancestor), otherwise the post page it happened on.
  function postOf(el) {
    const tagged = el.closest('[data-post]');
    if (tagged) return tagged.dataset.post;
    const m = /^\/(classifieds|listings|simchas)\/([^/]+)$/.exec(location.pathname);
    return m ? m[2] : undefined;
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest && ev.target.closest('a, button');
    if (!el || isDisabled()) return;
    const label = ((el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 40);
    const inChat = !!el.closest('.chesky-panel, .chesky-fab, .chesky-nudge');

    if (el.closest('.share-row')) {
      let how = 'copy';
      const href = el.getAttribute('href') || '';
      if (href.startsWith('mailto:')) how = 'email'; else if (href.startsWith('sms:')) how = 'sms'; else if (href.includes('wa.me')) how = 'whatsapp';
      track('sh', how, { j: postOf(el) });
      return;
    }
    if (el.tagName !== 'A') {
      // Plain buttons: only real action buttons, and never anything in the
      // chat (its own events cover it) or the search/filter forms.
      if (!inChat && el.matches('.btn') && label) track('ck', 'button', { x: { l: label } });
      return;
    }
    let u;
    try { u = new URL(el.href, location.href); } catch (e) { return; }
    const host = u.host.replace(/^www\./, '');
    // Reaching a poster: phone, text, WhatsApp, email, their website, or directions.
    let how = '';
    if (u.protocol === 'tel:') how = 'phone';
    else if (u.protocol === 'sms:') how = 'sms';
    else if (u.protocol === 'mailto:') how = 'email';
    else if (host === 'wa.me' || host === 'api.whatsapp.com') how = 'whatsapp';
    else if (/(^|\.)waze\.com$/.test(host) || (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps'))) how = 'directions';
    else if (el.dataset.clickType === 'website' || el.dataset.contact === 'website') how = 'website';
    const post = postOf(el);
    if (how && post && (el.matches('.contact-link, .maps-link') || el.closest('[data-post]') || how === 'directions')) {
      track('ct', how, { j: post, x: inChat ? { via: 'chesky' } : undefined });
      return;
    }
    if (inChat) return;
    let cat = 'link', out = '';
    if (u.protocol === 'mailto:') cat = 'mailto';
    else if (u.protocol === 'tel:') cat = 'tel';
    else if (u.protocol === 'http:' || u.protocol === 'https:') {
      if (host !== here) { cat = 'outbound'; out = (host + u.pathname).replace(/\/$/, '').slice(0, 80); }
    } else return;
    if (cat === 'link') {
      if (el.closest('.card, .search-dd, .pagination')) return; // post opens are counted as post clicks; paging isn't interesting
      if (el.closest('.site-header, .main-nav, .mobile-menu')) cat = 'nav';
      else if (el.closest('.site-footer, footer')) cat = 'footer';
      else if (el.matches('.btn') || el.closest('.category-pills, .listing-cat-chooser')) cat = el.matches('.btn') ? 'cta' : 'category';
    }
    track('ck', cat, { x: { l: label, h: out } });
  }, true);

  /* ---------------------------------------------------------------- errors */
  let errs = 0;
  const err = (msg, src) => { if (errs++ < 5) track('er', String(msg || 'error').slice(0, 100), { x: { s: src || '' } }); };
  addEventListener('error', (e) => { if (e.message) err(e.message, ((e.filename || '').split('/').pop() || '') + ':' + (e.lineno || 0)); });
  addEventListener('unhandledrejection', (e) => err('Promise: ' + ((e.reason && e.reason.message) || e.reason), ''));

  /* ---------------------------------------------------------------- speed (Core Web Vitals, first page load only) */
  const vit = { lcp: null, cls: 0, inp: 0, fcp: null };
  try {
    new PerformanceObserver((l) => { const e = l.getEntries(); if (e.length) vit.lcp = e[e.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) vit.cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === 'first-contentful-paint') vit.fcp = e.startTime; })).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.interactionId && e.duration > vit.inp) vit.inp = e.duration; })).observe({ type: 'event', durationThreshold: 40, buffered: true });
  } catch (e) { /* older browsers */ }
  let vitalsSent = false;
  function sendVitals() {
    if (vitalsSent) return;
    vitalsSent = true;
    const nv = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || null;
    const put = (n, v) => { if (v != null && isFinite(v) && v >= 0) track('vt', n, { v: Math.round(v * 1000) / 1000 }); };
    put('lcp', vit.lcp); put('fcp', vit.fcp); put('cls', vit.cls); if (vit.inp) put('inp', vit.inp);
    if (nv) { put('ttfb', nv.responseStart); put('load', nv.loadEventEnd); }
  }

  /* ---------------------------------------------------------------- leaving */
  function leave() {
    if (isDisabled()) return;
    sendVitals();
    endPage();
    flush(true);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
  addEventListener('pagehide', leave);

  return { visitorId, trackPageview, isDisabled, track };
})();
