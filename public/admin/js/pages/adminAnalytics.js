const ANALYTICS_PALETTE = ['#1f3b57', '#b08d3f', '#2f6b63', '#a13d3d', '#62666b', '#8a6fae', '#3f7fa1', '#c98a3f'];

// CSS conic-gradient donut - no charting library needed, and it's legible
// in both a screenshot and a live page. A plain <ul> legend does the actual
// labeling since color alone isn't accessible.
function analyticsDonut(data, labelFor) {
  const rows = data.map((d) => ({ label: labelFor ? labelFor(d) : d.label, count: d.c ?? d.count }));
  const total = rows.reduce((s, d) => s + d.count, 0);
  if (!total) return '<p class="hint">No data for this range yet.</p>';
  let acc = 0;
  const stops = rows.map((d, i) => {
    const start = (acc / total) * 360;
    acc += d.count;
    const end = (acc / total) * 360;
    return `${ANALYTICS_PALETTE[i % ANALYTICS_PALETTE.length]} ${start}deg ${end}deg`;
  }).join(', ');
  return `
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="width:110px;height:110px;border-radius:50%;background:conic-gradient(${stops});flex-shrink:0" role="img" aria-label="Breakdown chart"></div>
      <ul style="list-style:none;margin:0;padding:0;font-size:.82rem">
        ${rows.map((d, i) => `<li style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="width:10px;height:10px;border-radius:2px;background:${ANALYTICS_PALETTE[i % ANALYTICS_PALETTE.length]};flex-shrink:0"></span>
          ${escapeHtml(String(d.label))} — ${d.count} (${((d.count / total) * 100).toFixed(0)}%)
        </li>`).join('')}
      </ul>
    </div>`;
}

// Plain-div bar chart (no SVG/library) - one bar per day, title attr as the
// tooltip. Good enough at admin-dashboard scale (weeks/months of daily bars).
function analyticsBarChart(timeseries, key, color) {
  if (!timeseries.length) return '<p class="hint">No data for this range yet.</p>';
  const max = Math.max(1, ...timeseries.map((d) => d[key]));
  return `
    <div style="display:flex;align-items:flex-end;gap:2px;height:120px;border-bottom:1px solid var(--border);padding:0 2px">
      ${timeseries.map((d) => `<div title="${escapeHtml(d.date)}: ${d[key]}" style="flex:1;min-width:2px;height:${Math.max(2, Math.round((d[key] / max) * 112))}px;background:${color}"></div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--ink-soft);margin-top:4px">
      <span>${escapeHtml(timeseries[0].date)}</span><span>${escapeHtml(timeseries[timeseries.length - 1].date)}</span>
    </div>`;
}

// "+18% vs previous period" style delta under a stat card. previous=0 with
// current>0 shows "new" rather than a meaningless infinite percentage.
function analyticsDelta(current, previous) {
  if (!previous) return current > 0 ? '<div class="hint" style="color:var(--success);margin-top:2px">new</div>' : '';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  const color = pct >= 0 ? 'var(--success)' : 'var(--danger)';
  return `<div class="hint" style="color:${color};margin-top:2px">${sign}${pct.toFixed(0)}% vs prev.</div>`;
}

function toDateInputValue(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function renderAnalyticsPage(query) {
  const root = document.getElementById('adminContent');
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  function startOfTodayUTC() {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  let from, to, rangeKey;
  if (query.from && query.to) {
    from = new Date(`${query.from}T00:00:00Z`).getTime();
    to = new Date(`${query.to}T23:59:59Z`).getTime();
    rangeKey = 'custom';
  } else {
    rangeKey = query.range || '30';
    if (rangeKey === 'today') { from = startOfTodayUTC(); to = now; }
    else if (rangeKey === 'all') { from = 0; to = now; }
    else { from = now - (Number(rangeKey) || 30) * DAY_MS; to = now; }
  }

  const data = await AdminApi.analytics({ from, to });

  function presetLink(key, label) {
    const active = rangeKey === key;
    return `<a href="#/analytics?range=${key}" class="btn btn-sm ${active ? '' : 'btn-outline'}">${label}</a>`;
  }

  const ctr = data.totals.postViews ? `${((data.totals.postClicks / data.totals.postViews) * 100).toFixed(1)}%` : '—';
  const newVsReturning = [
    { label: 'New', c: data.newVsReturning.new || 0 },
    { label: 'Returning', c: data.newVsReturning.returning || 0 },
  ];

  root.innerHTML = `
    <h1>Analytics</h1>
    <p class="hint" style="margin:-4px 0 12px">${rangeKey === 'all' ? 'Showing all time' : `Showing ${escapeHtml(toDateInputValue(data.from))} to ${escapeHtml(toDateInputValue(data.to))}`}, compared to the same-length period before it.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end">
      ${presetLink('today', 'Today')}
      ${presetLink('7', 'Last 7 Days')}
      ${presetLink('30', 'Last 30 Days')}
      ${presetLink('90', 'Last 90 Days')}
      ${presetLink('all', 'All Time')}
      <form id="customRangeForm" style="display:flex;gap:6px;align-items:flex-end;margin-inline-start:8px">
        <div class="field"><label>From</label><input type="date" name="from" value="${escapeHtml(toDateInputValue(rangeKey === 'custom' ? data.from : now - 30 * DAY_MS))}"></div>
        <div class="field"><label>To</label><input type="date" name="to" value="${escapeHtml(toDateInputValue(rangeKey === 'custom' ? data.to : now))}"></div>
        <button class="btn btn-sm ${rangeKey === 'custom' ? '' : 'btn-outline'}" type="submit">Custom</button>
      </form>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="num">${data.totals.pageviews}</div><div class="label">Pageviews</div>${analyticsDelta(data.totals.pageviews, data.previousTotals.pageviews)}</div>
      <div class="stat-card"><div class="num">${data.totals.uniqueVisitors}</div><div class="label">Unique Visitors</div>${analyticsDelta(data.totals.uniqueVisitors, data.previousTotals.uniqueVisitors)}</div>
      <div class="stat-card"><div class="num">${data.totals.recurringVisitors}</div><div class="label">Recurring Visitors</div>${analyticsDelta(data.totals.recurringVisitors, data.previousTotals.recurringVisitors)}</div>
      <div class="stat-card"><div class="num">${data.totals.postViews}</div><div class="label">Post Views</div>${analyticsDelta(data.totals.postViews, data.previousTotals.postViews)}</div>
      <div class="stat-card"><div class="num">${data.totals.postClicks}</div><div class="label">Post Clicks</div>${analyticsDelta(data.totals.postClicks, data.previousTotals.postClicks)}</div>
      <div class="stat-card"><div class="num">${ctr}</div><div class="label">Click-Through Rate</div><div class="hint" style="margin-top:2px">of post views</div></div>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Pageviews Over Time</h3>
      ${analyticsBarChart(data.timeseries, 'pageviews', 'var(--navy)')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="admin-card">
        <h3 style="margin-top:0">New vs. Returning Visitors</h3>
        ${analyticsDonut(newVsReturning)}
      </div>
      <div class="admin-card">
        <h3 style="margin-top:0">Post Views by Type</h3>
        ${analyticsDonut(data.byPostType, (d) => d.type)}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="admin-card">
        <h3 style="margin-top:0">Post Views by Category</h3>
        ${analyticsDonut(data.byCategory, (d) => d.category)}
      </div>
      <div class="admin-card">
        <h3 style="margin-top:0">Top Pages</h3>
        ${data.topPages.length ? `<table class="admin-table"><thead><tr><th>Path</th><th>Views</th></tr></thead><tbody>${data.topPages.map((p) => `<tr><td>${escapeHtml(p.path)}</td><td>${p.c}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No data for this range yet.</p>'}
      </div>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Top Posts</h3>
      ${data.topPosts.length ? `<table class="admin-table"><thead><tr><th>Title</th><th>Type</th><th>Views</th><th>Clicks</th><th>CTR</th></tr></thead><tbody>${data.topPosts.map((p) => `<tr><td><a href="#/posts?q=${escapeHtml(p.publicId)}">${escapeHtml(p.title)}</a></td><td>${p.type}</td><td>${p.views}</td><td>${p.clicks}</td><td>${p.views ? ((p.clicks / p.views) * 100).toFixed(1) + '%' : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No data for this range yet.</p>'}
    </div>
  `;

  document.getElementById('customRangeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const f = fd.get('from');
    const t = fd.get('to');
    if (!f || !t) return;
    window.location.hash = `#/analytics?from=${f}&to=${t}`;
  });
}
