async function renderCrmPage(query) {
  const root = document.getElementById('adminContent');
  root.innerHTML = `
    <h1>CRM Search</h1>
    <p class="hint">Search by customer email, phone, name, or post title / ID.</p>
    <form class="filters-bar" id="crmForm">
      <div class="field" style="flex:1"><input type="text" name="q" value="${escapeHtml(query.q || '')}" placeholder="Search…" style="width:100%"></div>
      <button class="btn btn-sm" type="submit">Search</button>
    </form>
    <div id="crmResults"></div>
  `;
  document.getElementById('crmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q');
    window.location.hash = `#/crm?q=${encodeURIComponent(q)}`;
    await runSearch(q);
  });
  await runSearch(query.q || '');
}

async function runSearch(q) {
  const results = document.getElementById('crmResults');
  const { customers, default: isDefault } = await AdminApi.crmSearch(q);
  if (!customers.length) {
    results.innerHTML = '<p>No matches found.</p>';
    return;
  }
  results.innerHTML = (isDefault ? `<p class="hint">Most recently active customers:</p>` : '') + customers.map((c) => `
    <div class="admin-card">
      <h3 style="margin-top:0">${escapeHtml(`${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email)}</h3>
      <p class="hint">${escapeHtml(c.email)} ${c.phone ? '• ' + escapeHtml(c.phone) : ''} • Total paid: ${formatCents(c.totalPaidCents)}</p>
      <table class="admin-table">
        <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Posted</th><th></th></tr></thead>
        <tbody>
          ${c.posts.map((p) => `<tr><td>${escapeHtml(p.title)}</td><td>${p.type}</td><td><span class="status-pill status-${p.status}">${p.status}</span></td><td>${formatDate(p.createdAt)}</td><td><a href="#/posts?q=${p.publicId}">Open</a></td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}
