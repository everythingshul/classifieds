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

async function renderAnalyticsPage(query) {
  const root = document.getElementById('adminContent');
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const presetDays = query.days ? Number(query.days) : 30;
  const from = query.from ? Number(query.from) : (presetDays === 0 ? 0 : now - presetDays * DAY_MS);
  const to = query.to ? Number(query.to) : now;

  const data = await AdminApi.analytics({ from, to });

  function presetLink(days, label) {
    const active = !query.from && !query.to && presetDays === days;
    return `<a href="#/analytics?days=${days}" class="btn btn-sm ${active ? '' : 'btn-outline'}">${label}</a>`;
  }

  root.innerHTML = `
    <h1>Analytics</h1>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${presetLink(7, 'Last 7 Days')}
      ${presetLink(30, 'Last 30 Days')}
      ${presetLink(90, 'Last 90 Days')}
      ${presetLink(0, 'All Time')}
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="num">${data.totals.pageviews}</div><div class="label">Pageviews</div></div>
      <div class="stat-card"><div class="num">${data.totals.uniqueVisitors}</div><div class="label">Unique Visitors</div></div>
      <div class="stat-card"><div class="num">${data.totals.recurringVisitors}</div><div class="label">Recurring Visitors</div></div>
      <div class="stat-card"><div class="num">${data.totals.postViews}</div><div class="label">Post Views</div></div>
      <div class="stat-card"><div class="num">${data.totals.postClicks}</div><div class="label">Post Clicks</div></div>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Pageviews Over Time</h3>
      ${analyticsBarChart(data.timeseries, 'pageviews', 'var(--navy)')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="admin-card">
        <h3 style="margin-top:0">Post Views by Type</h3>
        ${analyticsDonut(data.byPostType, (d) => d.type)}
      </div>
      <div class="admin-card">
        <h3 style="margin-top:0">Post Views by Category</h3>
        ${analyticsDonut(data.byCategory, (d) => d.category)}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="admin-card">
        <h3 style="margin-top:0">Top Pages</h3>
        ${data.topPages.length ? `<table class="admin-table"><thead><tr><th>Path</th><th>Views</th></tr></thead><tbody>${data.topPages.map((p) => `<tr><td>${escapeHtml(p.path)}</td><td>${p.c}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No data for this range yet.</p>'}
      </div>
      <div class="admin-card">
        <h3 style="margin-top:0">Top Posts</h3>
        ${data.topPosts.length ? `<table class="admin-table"><thead><tr><th>Title</th><th>Type</th><th>Views</th><th>Clicks</th></tr></thead><tbody>${data.topPosts.map((p) => `<tr><td><a href="#/posts?q=${escapeHtml(p.publicId)}">${escapeHtml(p.title)}</a></td><td>${p.type}</td><td>${p.views}</td><td>${p.clicks}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No data for this range yet.</p>'}
      </div>
    </div>
  `;
}
