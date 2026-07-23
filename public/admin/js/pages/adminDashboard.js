async function renderDashboardPage() {
  const stats = await AdminApi.stats();
  const liveCount = stats.byStatus.find((s) => s.status === 'live')?.c || 0;
  const byStatusRows = stats.byStatus.map((s) => `<tr><td>${s.status}</td><td>${s.c}</td></tr>`).join('');

  document.getElementById('adminContent').innerHTML = `
    <h1>Dashboard</h1>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${liveCount}</div><div class="label">Live Posts</div></div>
      <div class="stat-card"><div class="num">${stats.pendingApproval}</div><div class="label">Pending Approval</div></div>
      <div class="stat-card"><div class="num">${formatCents(stats.revenueCents)}</div><div class="label">Total Revenue</div></div>
      <div class="stat-card"><div class="num">${stats.totalViews}</div><div class="label">Total Views</div></div>
    </div>

    <div class="admin-card">
      <h3>Posts by Status</h3>
      <table class="admin-table"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>${byStatusRows}</tbody></table>
    </div>

    <div class="admin-card">
      <h3>Most Viewed Posts</h3>
      <table class="admin-table">
        <thead><tr><th>Title</th><th>Type</th><th>Category</th><th>Views</th></tr></thead>
        <tbody>
          ${stats.topViewed.map((p) => `<tr><td><a href="#/posts?q=${encodeURIComponent(p.public_id)}">${escapeHtml(p.title)}</a></td><td>${p.type}</td><td>${p.category}</td><td>${p.view_count}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}
