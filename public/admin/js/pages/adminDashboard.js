async function renderDashboardPage() {
  const [stats, { reports }, { messages: allMessages }] = await Promise.all([AdminApi.stats(), AdminApi.reports(), AdminApi.contactMessages()]);
  const messages = allMessages.filter((m) => !m.archived);
  const liveCount = stats.byStatus.find((s) => s.status === 'live')?.c || 0;
  const byStatusRows = stats.byStatus.map((s) => `<tr><td>${s.status}</td><td>${s.c}</td></tr>`).join('');

  document.getElementById('adminContent').innerHTML = `
    <h1>Dashboard</h1>

    ${reports.length ? `
    <div class="admin-card" style="border-color:var(--danger)">
      <h3 style="margin-top:0;color:var(--danger)">Reported Posts (${reports.length})</h3>
      <table class="admin-table">
        <thead><tr><th>Post</th><th>Reason</th><th>Reported By</th><th>When</th><th></th></tr></thead>
        <tbody>
          ${reports.map((r) => `
            <tr data-id="${r.id}">
              <td><a href="#/posts?q=${r.post_public_id}">${escapeHtml(r.post_title)}</a> <span class="status-pill status-${r.post_status}">${r.post_status}</span></td>
              <td>${escapeHtml(r.reason || '(no reason given)')}</td>
              <td>${escapeHtml(r.reporter_email || 'anonymous')}</td>
              <td>${formatDate(r.created_at)}</td>
              <td><button class="btn btn-sm dismiss-report">Dismiss</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : ''}

    ${messages.length ? `
    <div class="admin-card">
      <h3 style="margin-top:0">Contact Messages (${messages.length}) <a href="#/contact-messages" style="font-size:.75rem;font-weight:400">View all &amp; reply →</a></h3>
      <table class="admin-table">
        <thead><tr><th>From</th><th>Subject</th><th>Message</th><th>When</th><th></th></tr></thead>
        <tbody>
          ${messages.map((m) => `
            <tr data-id="${m.id}">
              <td>${escapeHtml(m.name || '(no name)')}<br><span class="hint">${escapeHtml(m.email)}</span></td>
              <td>${escapeHtml(m.subject || '(no subject)')}</td>
              <td>${escapeHtml(m.message)}</td>
              <td>${formatDate(m.created_at)}</td>
              <td><button class="btn btn-sm archive-contact">Archive</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="stat-grid">
      <div class="stat-card"><div class="num">${liveCount}</div><div class="label">Live Posts</div></div>
      <div class="stat-card"><div class="num">${stats.pendingApproval}</div><div class="label">Pending Approval</div></div>
      <div class="stat-card"><div class="num">${reports.length}</div><div class="label">Open Reports</div></div>
      <div class="stat-card"><div class="num">${formatCents(stats.revenueCents)}</div><div class="label">Total Revenue</div>${stats.refundedCents > 0 ? `<div class="hint" style="margin-top:2px">${formatCents(stats.refundedCents)} refunded</div>` : ''}</div>
      <div class="stat-card"><div class="num">${stats.totalViews}</div><div class="label">Total Views</div></div>
      <div class="stat-card"><div class="num">${stats.totalClicks}</div><div class="label">Total Clicks</div></div>
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

  document.querySelectorAll('.dismiss-report').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('tr').dataset.id;
      await AdminApi.dismissReport(id);
      renderDashboardPage();
    });
  });
  document.querySelectorAll('.archive-contact').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('tr').dataset.id;
      await AdminApi.archiveContactMessage(id, true);
      renderDashboardPage();
    });
  });
}
