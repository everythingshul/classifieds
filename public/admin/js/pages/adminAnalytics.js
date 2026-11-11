// Admin Analytics. Data comes from /api/admin/analytics (services/
// analyticsReport.js); collection is public/js/analytics.js. Layout and
// charts are the portfolio site's dashboard, adapted to this site's own
// questions: what people search for, whether they contact posters, where
// the posting form loses them, and which traffic pays.
// Nothing here refreshes on a timer: numbers change only when a range or tab
// is picked or Refresh is pressed.
const AdminAnalytics = (() => {
  const esc = escapeHtml;
  const fmt = (n) => (n == null || isNaN(n) ? '0' : Number(n).toLocaleString());
  const TZ = -new Date().getTimezoneOffset(); // minutes east of UTC
  const DAY = 86400000;
  const C = { visitors: '#25a9ea', sessions: '#1e8a63', pageviews: '#b3823a', postViews: '#8a6fae' };
  const SERIES_NAMES = { visitors: 'Visitors', sessions: 'Visits', pageviews: 'Pageviews', postViews: 'Post views' };

  const state = { range: '7d', from: 0, to: 0, view: 'overview', data: null, cmp: true, series: { visitors: true, sessions: false, pageviews: true, postViews: false } };
  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ names */
  const pathName = (r) => {
    const p = typeof r === 'string' ? r : r.path;
    if (!p) return '(unknown)';
    if (r.title) return r.title;
    const fixed = { '/': 'Home', '/classifieds': 'Classifieds', '/listings': 'Listings', '/simchas': 'Simchas', '/search': 'Search results', '/post': 'Posting form', '/post-success': 'Payment confirmed', '/editorials': 'Editorials', '/editorials/submit': 'Submit an editorial', '/bookmarks': 'Bookmarks', '/pricing': 'Pricing', '/contact': 'Contact', '/subscribe': 'Email updates', '/digest-all': 'Email digest (view all)', '/terms': 'Terms', '/privacy-policy': 'Privacy policy', '/refund-policy': 'Refund policy' };
    return fixed[p] || p;
  };
  const countryName = (c) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c) || c; } catch (e) { return c; } };
  const mins = (s) => (s >= 60 ? Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's' : Math.round(s || 0) + 's');
  const ago = (ts) => { const s = Math.max(1, Math.round((Date.now() - ts) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };
  const money = (usd, gbp) => [usd || !gbp ? formatCents(usd || 0, 'usd') : '', gbp ? formatCents(gbp, 'gbp') : ''].filter(Boolean).join(' + ');
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const CONTACT_NAMES = { phone: 'Called', sms: 'Texted', whatsapp: 'WhatsApp', email: 'Emailed', website: 'Visited their website', directions: 'Got directions' };

  /* ------------------------------------------------------------------ date ranges */
  // Calendar days back from today's local midnight (24h steps would drift an hour across a clock change).
  const daysAgo = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d.getTime(); };
  const dstr = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayAfter = (t) => { const d = new Date(t); d.setDate(d.getDate() + 1); return d.getTime(); };
  function setRange(name, custom) {
    const now = Date.now();
    state.range = name;
    if (name === 'today') { state.from = daysAgo(0); state.to = now + 1; }
    else if (name === 'yesterday') { state.from = daysAgo(1); state.to = daysAgo(0); }
    else if (name === '7d') { state.from = daysAgo(6); state.to = now + 1; }
    else if (name === '30d') { state.from = daysAgo(29); state.to = now + 1; }
    else if (name === '90d') { state.from = daysAgo(89); state.to = now + 1; }
    else if (name === '12m') { state.from = daysAgo(364); state.to = now + 1; }
    else if (name === 'custom' && custom) { state.from = custom.from; state.to = custom.to; }
  }

  /* ------------------------------------------------------------------ building blocks */
  const delta = (cur, prev, lowerBetter) => {
    if (!state.cmp || prev == null) return '';
    if (!prev) return cur ? '<span class="an-dl up">new</span>' : '';
    const ch = Math.round(((cur - prev) / prev) * 100);
    if (!ch) return '<span class="an-dl">no change</span>';
    const good = lowerBetter ? ch < 0 : ch > 0;
    return `<span class="an-dl ${good ? 'up' : 'down'}">${ch > 0 ? '▲' : '▼'} ${Math.abs(ch)}%</span>`;
  };
  const kpi = (label, value, d, hint) => `<div class="an-kpi"${hint ? ` title="${esc(hint)}"` : ''}><div class="an-kv">${value}</div><div class="an-kl">${esc(label)}</div><div class="an-kd">${d || ''}</div></div>`;
  const card = (title, body, cls, note) => `<section class="an-card ${cls || ''}"><h3>${esc(title)}</h3>${note ? `<p class="an-note">${esc(note)}</p>` : ''}${body}</section>`;
  const empty = '<div class="an-empty">Nothing recorded for this period yet.</div>';

  function bars(rows, label, value, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return empty;
    const max = Math.max(...rows.map((r) => value(r)), 1);
    const total = opts.total || rows.reduce((a, r) => a + value(r), 0) || 1;
    const show = opts.show || fmt;
    return '<div class="an-bars">' + rows.map((r) => {
      const v = value(r);
      return `<div class="an-bar"><div class="an-bl" title="${esc(label(r))}">${esc(label(r))}</div><div class="an-bt"><i style="width:${Math.max(2, (v / max) * 100)}%"></i></div><div class="an-bv">${show(v)}${opts.pct === false ? '' : ` <small>${Math.round((v / total) * 100)}%</small>`}</div></div>`;
    }).join('') + '</div>';
  }

  // Tables scroll sideways inside their own box on a phone instead of
  // widening the page; the first column stays readable by wrapping.
  function table(head, rows) {
    if (!rows.length) return empty;
    return `<div class="an-tscroll"><table class="an-table"><thead><tr>${head.map((h, i) => `<th${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function funnel(steps) {
    const top = Math.max(steps[0].n, 1);
    return '<div class="an-funnel">' + steps.map((s, i) => {
      const prev = i ? steps[i - 1].n : null;
      const step = prev ? Math.round((s.n / prev) * 100) : 0;
      return `<div class="an-fstep"><div class="an-fh"><span>${esc(s.label)}</span><b>${fmt(s.n)}</b></div><div class="an-ft"><i style="width:${Math.max(1.5, (s.n / top) * 100)}%"></i></div><div class="an-fs">${i ? `${step}% of the previous step · ` : ''}${Math.round((s.n / top) * 100)}% of the first</div></div>`;
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ charts */
  const niceMax = (m) => { if (m <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

  // Bucket starts in this browser's own calendar (local hours or local
  // midnights), sent to the server so a day means the same thing on screen
  // and in the numbers.
  function bucketStarts(from, to) {
    const span = to - from;
    const hourly = span <= 2 * DAY + 3600000;
    const monthly = span > 200 * DAY;
    const out = []; const d = new Date(from);
    if (hourly) d.setMinutes(0, 0, 0); else d.setHours(0, 0, 0, 0);
    if (monthly) d.setDate(1);
    while (d.getTime() < to && out.length < 800) {
      out.push(Math.max(d.getTime(), from));
      if (hourly) d.setHours(d.getHours() + 1); else if (monthly) d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + 1);
    }
    return { hourly, monthly, starts: out };
  }
  const bucketLabel = (t, b) => (b.hourly ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric' }) : b.monthly ? new Date(t).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

  function chartRows(d) {
    const b = bucketStarts(d.range.from, d.range.to);
    const map = Object.fromEntries((d.series || []).map((r) => [r.i, r]));
    return { b, rows: b.starts.map((t, i) => ({ t, ...(map[i] || {}) })) };
  }

  function lineChart(d) {
    const { b, rows } = chartRows(d);
    const keys = Object.keys(state.series).filter((k) => state.series[k]);
    // A narrower drawing on a phone, so labels stay a readable size when it's scaled to the screen.
    const small = window.innerWidth < 600;
    const W = small ? 460 : 900, H = small ? 250 : 270, P = { l: small ? 34 : 46, r: small ? 12 : 24, t: 14, b: 30 };
    const max = niceMax(Math.max(1, ...rows.flatMap((r) => keys.map((k) => r[k] || 0))));
    const n = rows.length;
    const x = (i) => P.l + (W - P.l - P.r) * (n <= 1 ? 0.5 : i / (n - 1));
    const y = (v) => H - P.b - (H - P.t - P.b) * ((v || 0) / max);
    const grid = [0, 1, 2, 3, 4].map((i) => { const v = (max / 4) * i; return `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end" class="gt">${fmt(Math.round(v))}</text>`; }).join('');
    const every = Math.ceil(n / (small ? 4 : 8));
    const xl = rows.map((r, i) => (i % every === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="gt">${esc(bucketLabel(r.t, b))}</text>` : '')).join('');
    const lines = keys.map((k, ki) => {
      const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
      const area = ki === 0 ? `<polygon points="${P.l},${y(0)} ${pts} ${x(n - 1)},${y(0)}" fill="${C[k]}" opacity=".12"/>` : '';
      return area + `<polyline points="${pts}" fill="none" stroke="${C[k]}" stroke-width="2.2" stroke-linejoin="round"/>` + (n <= 40 ? rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r[k])}" r="2.6" fill="${C[k]}"/>`).join('') : '');
    }).join('');
    const id = 'ch' + Math.random().toString(36).slice(2, 7);
    setTimeout(() => {
      const svg = $(id); if (!svg) return;
      const tip = svg.parentElement.querySelector('.an-tip'); const guide = svg.querySelector('.guide');
      // Works with a mouse and with a finger dragged across the chart.
      const showAt = (clientX) => {
        const r = svg.getBoundingClientRect(); const px = ((clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (n - 1))));
        const row = rows[i]; guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.style.display = '';
        tip.innerHTML = `<b>${esc(bucketLabel(row.t, b))}</b>` + keys.map((k) => `<div><i style="background:${C[k]}"></i>${SERIES_NAMES[k]}: ${fmt(row[k] || 0)}</div>`).join('');
        tip.style.display = 'block'; tip.style.left = Math.min(r.width - 150, Math.max(0, (x(i) / W) * r.width + 12)) + 'px';
      };
      const hide = () => { tip.style.display = 'none'; guide.style.display = 'none'; };
      svg.addEventListener('mousemove', (e) => showAt(e.clientX));
      svg.addEventListener('mouseleave', hide);
      svg.addEventListener('touchstart', (e) => showAt(e.touches[0].clientX), { passive: true });
      svg.addEventListener('touchmove', (e) => showAt(e.touches[0].clientX), { passive: true });
      svg.addEventListener('touchend', () => setTimeout(hide, 1800));
    }, 0);
    const legend = Object.keys(state.series).map((k) => `<label class="an-lg"><input type="checkbox" data-s="${k}" ${state.series[k] ? 'checked' : ''}><i style="background:${C[k]}"></i>${SERIES_NAMES[k]}</label>`).join('');
    return `<div class="an-legend">${legend}</div><div class="an-chartwrap"><svg id="${id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Traffic over time">${grid}${xl}${lines}<line class="guide" y1="${P.t}" y2="${H - P.b}" style="display:none"/></svg><div class="an-tip"></div></div>`;
  }

  function columnChart(d, value, show, color) {
    const { b, rows } = chartRows(d);
    if (!rows.some((r) => value(r))) return empty;
    const max = Math.max(1, ...rows.map(value));
    return `<div class="an-cols">${rows.map((r) => `<i title="${esc(bucketLabel(r.t, b))}: ${esc(show(value(r)))}" style="height:${Math.max(value(r) ? 3 : 0, (value(r) / max) * 100)}%;background:${color}"></i>`).join('')}</div>
      <div class="an-colx"><span>${esc(bucketLabel(rows[0].t, b))}</span><span>${esc(bucketLabel(rows[rows.length - 1].t, b))}</span></div>`;
  }

  function heatmap(d) {
    const cells = {}; let max = 1;
    d.heat.forEach((r) => { cells[r.d + '-' + r.h] = r.n; if (r.n > max) max = r.n; });
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let h = '<div class="an-tscroll"><div class="an-heat"><div class="hrow hhead"><span></span>' + Array.from({ length: 24 }, (_, i) => `<span>${i % 3 === 0 ? (i === 0 ? '12a' : i < 12 ? i + 'a' : i === 12 ? '12p' : i - 12 + 'p') : ''}</span>`).join('') + '</div>';
    days.forEach((dn, di) => {
      h += `<div class="hrow"><span class="hd">${dn}</span>` + Array.from({ length: 24 }, (_, hi) => { const n = cells[di + '-' + hi] || 0; return `<span class="hc" title="${dn} ${hi}:00, ${n} visit${n === 1 ? '' : 's'}" style="background:rgba(37,169,234,${n ? 0.12 + 0.88 * (n / max) : 0.05})"></span>`; }).join('') + '</div>';
    });
    return h + '</div></div>';
  }

  // Shown when the range reaches back before detailed tracking began, so
  // half-empty breakdowns aren't mistaken for "nobody came from anywhere".
  function olderDataNote(d) {
    const since = d.firstVisit && d.firstVisit.detailedSince;
    if (since && d.range.from >= since - DAY) return '';
    return `<div class="an-flag">Visits before ${since ? new Date(since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'this update'} were rebuilt from page view counts only. Sources, devices, time on site and bounce rate start from that date.</div>`;
  }

  /* ------------------------------------------------------------------ tabs */
  const views = {
    overview(d) {
      const t = d.totals, p = d.previous || {};
      const top = (rows, f) => (rows && rows[0] ? f(rows[0]) : null);
      const peak = (() => { if (!d.heat.length) return null; const m = d.heat.reduce((a, b) => (b.n > a.n ? b : a)); return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][m.d] + ' around ' + (m.h === 0 ? '12 AM' : m.h < 12 ? m.h + ' AM' : m.h === 12 ? '12 PM' : m.h - 12 + ' PM'); })();
      const devTotal = d.tech.devices.reduce((a, r) => a + r.n, 0);
      const mob = (d.tech.devices.find((x) => x.k === 'mobile') || { n: 0 }).n;
      const st = d.search.totals || {};
      const ins = [
        top(d.channels, (r) => `${esc(r.channel)} sent the most visits.`),
        devTotal ? `${Math.round((mob / devTotal) * 100)}% of visits were on a phone.` : '',
        peak ? `Busiest time: ${esc(peak)}.` : '',
        top(d.search.terms, (r) => `Most searched: "${esc(r.q)}".`),
        st.searches && st.empty ? `${Math.round((st.empty / st.searches) * 100)}% of searches found nothing.` : '',
        t.contacts ? `${fmt(t.contacts)} tap${t.contacts === 1 ? '' : 's'} to contact a poster.` : '',
        t.newPosts ? `${fmt(t.newPosts)} new post${t.newPosts === 1 ? '' : 's'}.` : '',
      ].filter(Boolean);
      return olderDataNote(d) +
        `<div class="an-kpis">${kpi('Visitors', fmt(t.visitors), delta(t.visitors, p.visitors), 'Different people (anonymous browser ids)')}${kpi('Visits', fmt(t.sessions), delta(t.sessions, p.sessions))}${kpi('Pageviews', fmt(t.pageviews), delta(t.pageviews, p.pageviews))}${kpi('Time on site', mins(t.avgEngaged), delta(t.avgEngaged, p.avgEngaged), 'Average time the site was open and in use')}${kpi('Bounce rate', t.bounceRate + '%', delta(t.bounceRate, p.bounceRate, true), 'One page, nothing tapped, under 10 seconds')}${kpi('Did something', t.engagedRate + '%', delta(t.engagedRate, p.engagedRate), 'Visits with a search, a tap to contact, a post, a chat...')}${kpi('Contact taps', fmt(t.contacts), delta(t.contacts, p.contacts), 'Taps on call, text, WhatsApp, email, website or directions on a post')}${kpi('New posts', fmt(t.newPosts), delta(t.newPosts, p.newPosts))}${kpi('Revenue', money(t.revenueUsd, t.revenueGbp), delta(t.revenueUsd + t.revenueGbp, (p.revenueUsd || 0) + (p.revenueGbp || 0)), 'Paid, minus refunds')}</div>` +
        (ins.length ? `<div class="an-insights">${ins.map((i) => `<span>${i}</span>`).join('')}</div>` : '') +
        card('Traffic', lineChart(d), 'wide') +
        `<div class="an-grid2">${card('Where visitors came from', bars(d.channels, (r) => r.channel, (r) => r.sessions))}${card('What they looked at', bars(d.sections.slice(0, 9), (r) => r.k, (r) => r.n))}</div>` +
        `<div class="an-grid2">${card('Most opened posts', bars(d.posts.top.slice(0, 8), (r) => r.title, (r) => r.clicks, { pct: false }), '', 'Times the post itself was opened')}${card('What people search for', bars(d.search.terms.slice(0, 8), (r) => r.q, (r) => r.n, { pct: false }))}</div>`;
    },

    audience(d) {
      const t = d.totals;
      return olderDataNote(d) +
        `<div class="an-grid2">${card('New and returning visitors', bars([{ k: 'First time here', n: t.newVisitors }, { k: 'Been here before', n: t.returningVisitors }], (r) => r.k, (r) => r.n))}${card('Which site', bars(d.domains, (r) => r.k, (r) => r.n), '', 'Visits on each domain this site answers on.')}</div>` +
        `<div class="an-grid2">${card('Countries', bars(d.geo.countries, (r) => countryName(r.k), (r) => r.n), '', 'From the visitor\'s time zone. Addresses of visitors are never looked up.')}${card('Time zones', bars(d.geo.timezones, (r) => r.k.replace(/_/g, ' '), (r) => r.n))}</div>` +
        `<div class="an-grid3">${card('Devices', bars(d.tech.devices, (r) => cap(r.k), (r) => r.n))}${card('Operating systems', bars(d.tech.os, (r) => r.k, (r) => r.n))}${card('Browsers', bars(d.tech.browsers, (r) => r.k, (r) => r.n))}</div>` +
        `<div class="an-grid3">${card('Screen widths', bars(d.tech.screens, (r) => r.k + ' px', (r) => r.n))}${card('Languages', bars(d.tech.langs, (r) => r.k, (r) => r.n))}${card('Time spent per visit', bars(['0-10s', '10-30s', '30-60s', '1-3 min', '3+ min'].map((k) => ({ k, n: (d.sessionLength.find((x) => x.k === k) || { n: 0 }).n })), (r) => r.k, (r) => r.n))}</div>` +
        card('When people visit', heatmap(d), 'wide', 'Visits by weekday and hour, in your time zone. Darker means busier.');
    },

    sources(d) {
      return olderDataNote(d) +
        card('Channels', table(['Channel', 'Visits', 'Visitors', 'Bounce rate', 'Time on site'], d.channels.map((r) => [esc(r.channel), fmt(r.sessions), fmt(r.visitors), r.bounceRate + '%', mins(r.engaged)])), 'wide', 'Direct includes messaging apps and typed addresses, which usually hide where a visit came from.') +
        `<div class="an-grid2">${card('Referring websites', bars(d.referrers, (r) => r.host, (r) => r.sessions))}${card('Campaigns (tagged links)', table(['Source', 'Medium', 'Campaign', 'Visits'], d.campaigns.map((r) => [esc(r.s || '—'), esc(r.m || '—'), esc(r.c || '—'), fmt(r.sessions)])), '', 'Add ?utm_source=…&utm_medium=…&utm_campaign=… to a link you share to see it here.')}</div>` +
        card('Which sources paid', table(['Channel', 'Payments', 'Amount'], d.revenue.byChannel.map((r) => [esc(r.k || '(earlier visits)'), fmt(r.n), formatCents(r.cents)])), '', 'Payments finished in the same browser tab that started them. Mixed currencies are added as charged.');
    },

    content(d) {
      const ctr = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '—');
      return card('Pages', table(['Page', 'Views', 'Visits', 'Avg time', 'Scrolled'], d.pages.map((r) => [esc(pathName(r)), fmt(r.views), fmt(r.uniques), r.secs == null ? '—' : mins(r.secs), r.scroll == null ? '—' : r.scroll + '%'])), 'wide') +
        `<div class="an-grid2">${card('Where visits start', table(['Page', 'Visits', 'Bounce'], d.entry.map((r) => [esc(pathName(r)), fmt(r.sessions), r.measured ? r.bounceRate + '%' : '—'])))}${card('Where visits end', bars(d.exit, (r) => pathName(r), (r) => r.sessions))}</div>` +
        card('Posts', table(['Post', 'Type', 'Seen in lists', 'Opened', 'Open rate', 'Contact taps'], d.posts.top.map((r) => [`<a href="#/posts?q=${esc(r.publicId)}">${esc(r.title)}</a>`, esc(r.type), fmt(r.views), fmt(r.clicks), ctr(r.clicks, r.views), fmt(r.contacts)])), 'wide', '"Seen in lists" counts each time the post\'s card was shown; "Opened" is the post page itself.') +
        `<div class="an-grid2">${card('Categories people look at', table(['Category', 'Seen', 'Opened', 'Open rate'], d.posts.byCategory.map((r) => [esc(r.k), fmt(r.views), fmt(r.clicks), ctr(r.clicks, r.views)])))}${card('By section', bars(d.posts.byType, (r) => cap(r.k) + 's', (r) => r.n))}</div>` +
        `<div class="an-grid2">${card('Editorials', table(['Editorial', 'Seen', 'Opened', 'Likes'], d.editorials.top.map((r) => [`<a href="#/editorials?q=${esc(r.publicId)}">${esc(r.title)}</a>`, fmt(r.views), fmt(r.clicks), fmt(r.likes)])))}${card('Editorials by status', bars(d.editorials.byStatus, (r) => r.k.replace(/_/g, ' '), (r) => r.n))}</div>` +
        card('What people click', table(['Type', 'Link or button', 'Clicks'], d.clicks.map((r) => [esc(({ outbound: 'Leaves the site', cta: 'Button link', button: 'Button', nav: 'Menu', footer: 'Footer', category: 'Category', mailto: 'Email link', tel: 'Phone link', link: 'Link' })[r.cat] || r.cat), esc(r.label || '(no text)'), fmt(r.n)])), 'wide');
    },

    search(d) {
      const s = d.search, t = s.totals || {};
      const where = { search: 'Search bar (top of the site)', classifieds: 'Classifieds page filter', listings: 'Listings page filter', simchas: 'Simchas page filter' };
      return `<div class="an-kpis">${kpi('Searches', fmt(t.searches))}${kpi('Visits that searched', fmt(t.visits), '', d.totals.sessions ? Math.round(((t.visits || 0) / d.totals.sessions) * 100) + '% of all visits' : '')}${kpi('Found nothing', t.searches ? Math.round(((t.empty || 0) / t.searches) * 100) + '%' : '—', '', 'Searches that came back with no results')}</div>` +
        `<div class="an-grid2">${card('What people search for', table(['Search', 'Times', 'Avg results'], s.terms.map((r) => [esc(r.q), fmt(r.n), r.results == null ? '—' : fmt(r.results)])))}${card('Searches that found nothing', table(['Search', 'Times', 'Last'], s.empty.map((r) => [esc(r.q), fmt(r.n), ago(r.last) + ' ago'])), '', 'What people wanted and the site did not have. Good leads for who to invite to post.')}</div>` +
        `<div class="an-grid2">${card('Where they searched', bars(s.where, (r) => where[r.k] || r.k, (r) => r.n))}${card('Where they look for businesses', bars(d.geo.searchedNear, (r) => r.k || '(not named)', (r) => r.n), '', 'The place chosen on the Listings "where are you?" step.')}</div>`;
    },

    conversions(d) {
      const f = d.funnel || {}, c = d.chat || {}, form = d.form || {};
      const asked = c.sends || 0;
      const sat = (c.ups || 0) + (c.downs || 0) ? Math.round(((c.ups || 0) / ((c.ups || 0) + (c.downs || 0))) * 100) : null;
      return card('From browsing to contacting a poster', funnel([
        { label: 'Visited', n: f.total || 0 }, { label: 'Browsed a list or searched', n: f.browsed || 0 },
        { label: 'Opened a post', n: f.viewed || 0 }, { label: 'Tapped to contact', n: f.contacted || 0 },
      ]), 'wide', 'Each step counts visits that did it, in any order.') +
        card('From the posting form to a post', funnel([
          { label: 'Opened the posting form', n: f.pform || 0 }, { label: 'Chose what to post', n: f.ptype || 0 }, { label: 'Chose a category', n: f.pcat || 0 },
          { label: 'Filled in the details', n: f.pdetails || 0 }, { label: 'Reached the review step', n: f.preview || 0 }, { label: 'Pressed submit', n: f.psubmit || 0 }, { label: 'Posted', n: f.pdone || 0 },
        ]), 'wide', 'Where people give up while posting. A big drop between two steps is the step to fix.') +
        `<div class="an-grid3">${card('What they started posting', bars(d.posting.byType, (r) => cap(r.k || 'unknown'), (r) => r.n))}${card('Posts created', bars(d.posting.created, (r) => cap(r.k) + 's', (r) => r.n), '', 'Includes posts made by Chesky and by the team.')}${card('How people contact posters', bars(d.contact.methods, (r) => CONTACT_NAMES[r.k] || r.k, (r) => r.n))}</div>` +
        (d.posting.errors.length ? card('Problems when submitting a post', table(['Message shown', 'Times'], d.posting.errors.map((r) => [esc(r.k || '(none)'), fmt(r.n)])), 'wide') : '') +
        card('Chesky', `<div class="an-kpis one">${kpi('Chats opened', fmt(c.opens))}${kpi('Messages sent', fmt(asked))}${kpi("Couldn't help", fmt(c.misses) + (asked ? ` <small>${Math.round(((c.misses || 0) / asked) * 100)}%</small>` : ''))}${kpi('Pointed to posts', fmt(c.found), '', 'Replies that named specific posts')}${kpi('Posts made in chat', fmt(c.posted), '', 'Plus ' + fmt(c.checkouts) + ' sent to payment')}${kpi('Thumbs up / down', fmt(c.ups) + ' / ' + fmt(c.downs), '', sat == null ? '' : sat + '% happy')}${kpi('Asked for a person', fmt(c.handoffs))}</div>`, 'wide', 'What happened in the chat, never what was typed. Questions he missed are under Chesky Chat.') +
        `<div class="an-grid2">${card('Other things visitors did', bars([{ k: 'Searched', n: f.searched || 0 }, { k: 'Saved a post', n: f.saved || 0 }, { k: 'Shared a post', n: f.shared || 0 }, { k: 'Opened the chat', n: f.chat || 0 }, { k: 'Signed up for emails', n: f.subscribed || 0 }], (r) => r.k, (r) => r.n, { total: d.totals.sessions || 1 }), '', 'Share of all visits.')}${card('Contact form and sharing', `<div class="an-kpis one">${kpi('Started the form', fmt(form.starts))}${kpi('Sent', fmt(form.oks))}${kpi('New email subscribers', fmt(d.totals.newSubscribers))}</div>` + bars(d.shareMethods, (r) => ({ email: 'Shared by email', sms: 'Shared by text', whatsapp: 'Shared on WhatsApp', copy: 'Copied the link' })[r.k] || r.k, (r) => r.n))}</div>`;
    },

    revenue(d) {
      const t = d.totals, p = d.previous || {}, pay = d.revenue.payments || {};
      const kinds = { listing: 'Posting fees', boost: 'Boosts', strike: 'Featured' };
      const gbp = t.revenueGbp || (d.series || []).some((r) => r.revenueGbp);
      return `<div class="an-kpis">${kpi('Revenue (USD)', formatCents(t.revenueUsd), delta(t.revenueUsd, p.revenueUsd), 'Paid, minus refunds')}${gbp ? kpi('Revenue (GBP)', formatCents(t.revenueGbp, 'gbp'), delta(t.revenueGbp, p.revenueGbp)) : ''}${kpi('Payments', fmt(pay.n))}${kpi('Paying customers', fmt(pay.payers))}${kpi('Per visit', t.sessions ? formatCents(Math.round(t.revenueUsd / t.sessions)) : '—', '', 'USD revenue divided by visits')}</div>` +
        card('Revenue over time (USD)', columnChart(d, (r) => r.revenueUsd || 0, (v) => formatCents(v), '#1e8a63'), 'wide') +
        (gbp ? card('Revenue over time (GBP)', columnChart(d, (r) => r.revenueGbp || 0, (v) => formatCents(v, 'gbp'), '#b3823a'), 'wide') : '') +
        `<div class="an-grid2">${card('What was paid for', table(['Type', 'Payments', 'Amount'], d.revenue.byKind.map((r) => [esc(kinds[r.k] || r.k), fmt(r.n), formatCents(r.cents, r.currency)])))}${card('Which sources paid', table(['Channel', 'Payments', 'Amount'], d.revenue.byChannel.map((r) => [esc(r.k || '(earlier visits)'), fmt(r.n), formatCents(r.cents)])), '', 'Payments finished in the same browser tab that started them.')}</div>`;
    },

    speed(d) {
      const spec = { lcp: ['Largest paint', 'ms', 2500, 4000, 'How fast the main content appears'], fcp: ['First paint', 'ms', 1800, 3000, 'How fast anything appears'], cls: ['Layout shift', '', 0.1, 0.25, 'Things jumping around while loading'], inp: ['Responsiveness', 'ms', 200, 500, 'Delay after a tap or click'], ttfb: ['Server response', 'ms', 800, 1800, 'Time until the server answers'], load: ['Full load', 'ms', 3000, 6000, 'Everything finished loading'] };
      const cards = Object.keys(spec).map((k) => {
        const v = d.vitals[k]; const [name, unit, good, poor, hint] = spec[k];
        if (!v) return `<div class="an-vcard"><div class="vn">${name}</div><div class="vv">—</div><div class="vh">${hint}</div></div>`;
        const val = v.p75; const cls = val <= good ? 'good' : val <= poor ? 'ok' : 'poor';
        const show = (x) => (x == null ? '—' : unit === 'ms' ? (x >= 1000 ? (x / 1000).toFixed(1) + ' s' : Math.round(x) + ' ms') : x.toFixed(3));
        return `<div class="an-vcard ${cls}"><div class="vn">${name}</div><div class="vv">${show(val)}</div><div class="vh">${hint}. Typical: ${show(v.p50)} · Phones: ${show(v.mobile75)} · Computers: ${show(v.desktop75)} · ${fmt(v.n)} visits</div></div>`;
      }).join('');
      return card('How fast the site feels', `<div class="an-vgrid">${cards}</div>`, 'wide', 'The slowest 1 in 4 visits (75th percentile), measured on the first page of each visit. Green is good, amber needs work, red is poor.') +
        card("Errors in visitors' browsers", table(['Error', 'Where', 'Times', 'Last seen'], d.errors.map((r) => [esc(r.msg), esc((r.src || '') + ' on ' + pathName(r.path || '')), fmt(r.n), ago(r.last) + ' ago'])), 'wide', 'Problems the site hit while running. Empty is good.');
    },
  };

  /* ------------------------------------------------------------------ live view + single visits */
  function evName(e) {
    const x = (() => { try { return JSON.parse(e.extra || '{}'); } catch (err) { return {}; } })();
    const post = e.post_title ? `"${e.post_title}"` : 'a post';
    switch (e.type) {
      case 'pageview': return 'viewed ' + (x.t && /^\/(classifieds|listings|simchas|editorials)\//.test(e.path || '') ? `"${x.t.split(' | ')[0]}"` : pathName(e.path || ''));
      case 'search': return `searched "${x.q || ''}" (${fmt(e.value)} result${e.value === 1 ? '' : 's'})`;
      case 'contact': return `${(CONTACT_NAMES[e.name] || e.name).toLowerCase()} from ${post}${x.via ? ' via Chesky' : ''}`;
      case 'click': return `clicked "${x.l || e.name}"${x.h ? ' → ' + x.h : ''}`;
      case 'post': return ({ type: 'posting: chose ' + (x.t || 'a type'), category: 'posting: chose category ' + (x.c || ''), details: 'posting: filled in details', review: 'posting: reached review', submit: 'posting: pressed submit', checkout: 'posting: sent to payment', done: 'posted ' + post, paid: 'paid ' + formatCents(e.value, x.cur), error: 'posting error: ' + (x.m || '') })[e.name] || 'posting: ' + e.name;
      case 'chat': return 'Chesky: ' + (({ open: 'opened the chat', send: 'sent a message', miss: "couldn't help", posted: 'made a post', checkout: 'sent to payment', found: 'pointed to posts', handoff: 'asked for a person', up: 'thumbs up', down: 'thumbs down', restart: 'started over' })[e.name] || e.name);
      case 'bookmark': return (e.name === 'add' ? 'saved ' : 'unsaved ') + post;
      case 'share': return `shared ${post} (${e.name})`;
      case 'subscribe': return 'signed up for email updates';
      case 'form': return 'contact form: ' + e.name;
      case 'location': return 'looking near ' + (x.l || 'a place');
      case 'error': return 'hit an error: ' + e.name;
      default: return e.type + ' ' + (e.name || '');
    }
  }

  async function renderVisitors(el, quiet) {
    if (!quiet) el.innerHTML = '<div class="an-empty">Loading…</div>';
    const [live, sess] = await Promise.all([AdminApi.analyticsLive(), AdminApi.analyticsSessions({ from: state.from, to: state.to })]);
    const who = (r) => [r.country ? countryName(r.country) : '', cap(r.device || ''), r.browser || ''].filter(Boolean).join(' · ') || '—';
    el.innerHTML =
      `<div class="an-kpis">${kpi('On the site right now', fmt(live.active.length), '', 'Active in the last 5 minutes')}${kpi('Visitors, last 24 hours', fmt(live.last24h.visitors))}${kpi('Visits, last 24 hours', fmt(live.last24h.sessions))}${kpi('Pageviews, last 24 hours', fmt(live.last24h.pageviews))}</div>` +
      `<div class="an-grid2">${card('Right now', live.active.length ? table(['Page', 'Who', 'Channel', 'Active'], live.active.map((r) => [esc(pathName(r.path || '')), esc(who(r)) + (r.is_new ? ' <span class="pill pill-blue">new</span>' : ''), esc(r.channel || '—'), ago(r.last_ts) + ' ago'])) : '<div class="an-empty">Nobody in the last 5 minutes.</div>')}` +
      `${card('Latest activity', live.recent.length ? '<ul class="an-feed">' + live.recent.map((e) => `<li><time>${ago(e.ts)}</time> <span>${esc([e.country, e.device].filter(Boolean).join(' '))}</span> ${esc(evName(e))}</li>`).join('') + '</ul>' : '<div class="an-empty">No activity yet.</div>')}</div>` +
      card('Recent visits', sess.sessions.length ? table(['When', 'Who', 'Channel', 'Pages', 'Time', 'Path', ''], sess.sessions.map((s) => [new Date(s.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), esc(who(s)) + (s.is_new ? ' <span class="pill pill-blue">new</span>' : ''), esc(s.channel || '—'), fmt(s.pages), s.channel ? mins(Math.round(s.active_s)) : '—', esc(pathName(s.landing || '') + (s.exit_path && s.exit_path !== s.landing ? ' → ' + pathName(s.exit_path) : '')), `<button class="btn btn-sm btn-outline" data-sid="${esc(s.sid)}">Steps</button>`])) : empty, 'wide', 'Anonymous: no names, emails or IP addresses. Press Steps to see everything one visit did.') +
      '<div id="an-timeline"></div>';
    el.querySelectorAll('[data-sid]').forEach((b) => b.addEventListener('click', async () => {
      const t = await AdminApi.analyticsSession(b.dataset.sid);
      const s = t.session;
      $('an-timeline').innerHTML = card(`One visit: ${new Date(s.ts).toLocaleString()}`, `<p class="an-note">${esc([s.country ? countryName(s.country) : '', s.device, s.os, s.browser, s.channel, s.ref_host ? 'from ' + s.ref_host : '', s.domain].filter(Boolean).join(' · '))}</p><ol class="an-steps">${t.events.filter((e) => e.type !== 'vital').map((e) => `<li><time>+${mins(Math.max(0, Math.round((e.ts - s.ts) / 1000)))}</time> ${e.type === 'pageend' ? `<small>left ${esc(pathName(e.path || ''))} after ${mins(e.value || 0)}${(() => { try { const x = JSON.parse(e.extra || '{}'); return x.sc ? ', scrolled ' + x.sc + '%' : ''; } catch (err) { return ''; } })()}</small>` : esc(evName(e))}</li>`).join('')}</ol>`, 'wide');
      $('an-timeline').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  /* ------------------------------------------------------------------ settings */
  function renderSettings(el) {
    let off = false; try { off = !!localStorage.getItem('esc_no_track'); } catch (e) { /* ignore */ }
    el.innerHTML =
      card('Your own visits', `<label class="an-check"><input type="checkbox" id="an-no-track" ${off ? 'checked' : ''}> Don't count my visits in this browser</label><p class="an-note">Tick this on every device you use to browse the public site, so your own clicks don't skew the numbers. The admin pages are never counted.</p>`) +
      card('Download your data', `<p class="an-note">For the date range selected above, as spreadsheet (CSV) files.</p><div class="bg"><button class="btn btn-sm btn-outline" data-x="sessions">Visits</button><button class="btn btn-sm btn-outline" data-x="events">Every event</button></div>`) +
      card('How it works', `<ul class="an-plain"><li>No cookies. An anonymous random id is kept in the visitor's browser to tell new visitors from returning ones.</li><li>IP addresses are never stored or looked up. Country comes from the browser's time zone.</li><li>Do Not Track and Global Privacy Control are honored. Bots and automated browsers are ignored.</li><li>Names, emails, phone numbers and what people type to Chesky or into forms are never recorded here. Search terms are.</li><li>Visits are kept for 13 months, then deleted automatically.</li><li>Visitors can read this in the <a href="/privacy-policy" target="_blank" rel="noopener">privacy policy</a>.</li></ul>`) +
      card('Delete visit data', `<p class="an-note">Removes all visits and their events permanently. Post view counts, payments and everything else on the site are not touched. This cannot be undone.</p><button class="btn btn-sm btn-danger" id="an-reset">Delete all visit data</button>`);
    $('an-no-track').addEventListener('change', (e) => {
      try { if (e.target.checked) localStorage.setItem('esc_no_track', '1'); else localStorage.removeItem('esc_no_track'); } catch (x) { /* private browsing */ }
      toast(e.target.checked ? "Your visits on this browser won't be counted" : 'Your visits will be counted again');
    });
    el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const blob = await AdminApi.analyticsExport({ kind: b.dataset.x, from: state.from, to: state.to });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `jlistings-${b.dataset.x === 'events' ? 'events' : 'visits'}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) { toast(e.message, 'err'); }
    }));
    $('an-reset').addEventListener('click', async () => {
      if (!confirm('Delete ALL visit data for good?')) return;
      await AdminApi.analyticsReset(); toast('All visit data deleted'); state.data = null; load();
    });
  }

  /* ------------------------------------------------------------------ frame, loading, drawing */
  const VIEWS = [['overview', 'Overview'], ['audience', 'Audience'], ['sources', 'Sources'], ['content', 'Content'], ['search', 'Search'], ['conversions', 'Conversions'], ['revenue', 'Revenue'], ['speed', 'Speed'], ['visitors', 'Visitors'], ['settings', 'Settings']];
  const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['12m', '12 months']];

  function chrome() {
    const root = document.getElementById('adminContent');
    root.innerHTML = `
      <div class="an-root" id="an-root">
        <h1>Analytics</h1>
        <div class="an-toolbar">
          <div class="an-chips">${RANGES.map(([k, l]) => `<button class="an-chip${state.range === k ? ' on' : ''}" data-r="${k}">${l}</button>`).join('')}</div>
          <div class="an-custom"><input type="date" id="an-from" value="${dstr(state.from)}" aria-label="From"> <span>to</span> <input type="date" id="an-to" value="${dstr(state.to - 1)}" aria-label="To"> <button class="btn btn-sm btn-outline" id="an-apply">Apply</button></div>
          <label class="an-check"><input type="checkbox" id="an-cmp" ${state.cmp ? 'checked' : ''}> Compare with the previous period</label>
          <button class="btn btn-sm btn-outline" id="an-refresh" title="Refresh">↻ Refresh</button>
        </div>
        <div class="an-tabs" role="tablist">${VIEWS.map(([k, l]) => `<button class="an-tab${state.view === k ? ' on' : ''}" data-v="${k}" role="tab">${l}</button>`).join('')}</div>
        <div id="an-body"></div>
      </div>`;
    root.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { setRange(b.dataset.r); load(); }));
    $('an-apply').addEventListener('click', () => { const f = new Date($('an-from').value + 'T00:00:00').getTime(); const t = dayAfter(new Date($('an-to').value + 'T00:00:00').getTime()); if (f && t > f) { setRange('custom', { from: f, to: t }); load(); } });
    $('an-cmp').addEventListener('change', (e) => { state.cmp = e.target.checked; load(); });
    $('an-refresh').addEventListener('click', () => load(true));
    root.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      state.view = b.dataset.v;
      root.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b));
      b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      draw();
    }));
  }

  async function draw(quiet) {
    const body = $('an-body'); if (!body) return;
    if (state.view === 'settings') return renderSettings(body);
    if (state.view === 'visitors') { try { await renderVisitors(body, quiet); } catch (e) { body.innerHTML = `<div class="an-empty">${esc(e.message)}</div>`; } return; }
    if (!state.data) { body.innerHTML = '<div class="an-empty">Loading…</div>'; return; }
    body.innerHTML = views[state.view](state.data);
    body.querySelectorAll('input[data-s]').forEach((c) => c.addEventListener('change', () => { state.series[c.dataset.s] = c.checked; if (!Object.values(state.series).some(Boolean)) state.series.visitors = true; draw(); }));
  }

  // Keeps the bar in step with the range without rebuilding the page.
  function syncBar() {
    document.querySelectorAll('#an-root [data-r]').forEach((b) => b.classList.toggle('on', b.dataset.r === state.range));
    const f = $('an-from'), t = $('an-to');
    if (f && document.activeElement !== f) f.value = dstr(state.from);
    if (t && document.activeElement !== t) t.value = dstr(state.to - 1);
  }

  // Refresh keeps what is on screen until the new numbers arrive, then
  // swaps them in at the same scroll position.
  async function load(keep) {
    if (state.range !== 'custom') setRange(state.range); // "7 days" always means the last 7 days as of now
    const y = window.scrollY;
    if ($('an-body')) syncBar(); else chrome();
    const body = $('an-body');
    if (state.view === 'visitors' || state.view === 'settings') { await draw(keep); if (keep) window.scrollTo(0, y); return; }
    if (!keep || !state.data) body.innerHTML = '<div class="an-empty">Loading…</div>';
    try {
      state.data = await AdminApi.analytics({ from: state.from, to: state.to, tz: TZ, b: bucketStarts(state.from, state.to).starts.join(','), cmp: state.cmp ? 1 : 0 });
      await draw(keep);
      if (keep) window.scrollTo(0, y);
    } catch (e) {
      body.innerHTML = `<div class="an-empty">${esc(e.message)}</div>`;
    }
  }

  async function render() {
    if (!state.from) setRange('7d');
    chrome();
    await load();
  }

  return { render };
})();

function renderAnalyticsPage() {
  return AdminAnalytics.render();
}
