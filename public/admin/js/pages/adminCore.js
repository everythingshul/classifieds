// Login, dashboard, and moderation queue - grouped since each is a
// small, standalone admin page.

function renderLoginPage() {
  document.getElementById('adminContent').innerHTML = `
    <div class="login-wrap admin-card">
      <h2 style="margin-top:0">Admin Login</h2>
      <form id="loginForm">
        <div class="form-row"><label>Email</label><input type="email" id="email" required></div>
        <div class="form-row"><label>Password</label><input type="password" id="password" required></div>
        <div id="loginError" class="error-list" style="display:none"></div>
        <button class="btn" type="submit" style="width:100%">Log In</button>
      </form>
    </div>`;
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { token } = await AdminApi.login(document.getElementById('email').value, document.getElementById('password').value);
      AdminApi.setToken(token);
      window.location.hash = '#/dashboard';
      AdminRouter.resolve();
    } catch (err) {
      const box = document.getElementById('loginError');
      box.style.display = 'block';
      box.textContent = err.message;
    }
  });
}

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

async function renderModerationPage() {
  const [data, urlData] = await Promise.all([
    AdminApi.posts({ status: 'pending_approval', pageSize: 50 }),
    AdminApi.posts({ needsUrlApproval: 1, pageSize: 50 }),
  ]);
  const root = document.getElementById('adminContent');

  const urlSection = urlData.posts.length ? `
    <h2>Websites Awaiting Approval (${urlData.total})</h2>
    ${urlData.posts.map((p) => `
      <div class="admin-card" data-post-url="${p.id}">
        <h3 style="margin-top:0">${escapeHtml(p.title)} <span class="tag">${escapeHtml(p.categoryLabel)}</span></h3>
        <p><b>Website:</b> <a href="${p.contact?.url}" target="_blank" rel="noopener">${escapeHtml(p.contact?.url || '')}</a></p>
        <p class="hint">Posted by ${escapeHtml(p.poster.email)}</p>
        <div style="display:flex;gap:10px">
          <button class="btn approve-url" data-id="${p.id}">Approve Website</button>
          <button class="btn btn-danger reject-url" data-id="${p.id}">Remove Website</button>
          <a class="btn btn-outline" href="#/posts?q=${p.publicId}">Edit</a>
        </div>
      </div>
    `).join('')}
  ` : '';

  if (!data.posts.length && !urlData.posts.length) {
    root.innerHTML = `<h1>Moderation Queue</h1><p>Nothing waiting for approval.</p>`;
    return;
  }

  root.innerHTML = `
    <h1>Moderation Queue</h1>
    ${urlSection}
    ${data.posts.length ? `<h2>Posts Awaiting Approval (${data.total})</h2>` : ''}
    ${data.posts.map((p) => `
      <div class="admin-card" data-post="${p.id}">
        <h3 style="margin-top:0">${escapeHtml(p.title)} <span class="tag">${escapeHtml(p.categoryLabel)}</span></h3>
        <p>${escapeHtml(p.description || '')}</p>
        <p class="hint">Posted by ${escapeHtml(p.poster.email)} • ${escapeHtml(p.location.text || '')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          ${p.images.map((img) => `
            <div style="text-align:center">
              <img class="thumb-mini" src="${img.url}" style="width:120px;height:120px">
              <div class="img-approve-row">
                <button class="btn btn-sm approve-img" data-post="${p.id}" data-img="${img.id}" ${img.approved ? 'disabled' : ''}>${img.approved ? 'Approved' : 'Approve'}</button>
                <button class="btn btn-sm btn-danger remove-img" data-post="${p.id}" data-img="${img.id}">Remove</button>
              </div>
            </div>
          `).join('') || '<p class="hint">No images.</p>'}
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn approve-post" data-id="${p.id}">Approve &amp; Publish</button>
          <button class="btn btn-danger reject-post" data-id="${p.id}">Reject</button>
          <a class="btn btn-outline" href="#/posts?q=${p.publicId}">Edit</a>
        </div>
      </div>
    `).join('')}
  `;

  root.querySelectorAll('.approve-img').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.approveImage(btn.dataset.post, btn.dataset.img);
    btn.textContent = 'Approved';
    btn.disabled = true;
  }));
  root.querySelectorAll('.remove-img').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.removeImage(btn.dataset.post, btn.dataset.img);
    btn.closest('div').parentElement.remove();
  }));
  root.querySelectorAll('.approve-post').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.approvePost(btn.dataset.id);
    renderModerationPage();
  }));
  root.querySelectorAll('.reject-post').forEach((btn) => btn.addEventListener('click', async () => {
    const reason = prompt('Reason for rejection (sent to the poster):') || '';
    await AdminApi.rejectPost(btn.dataset.id, reason);
    renderModerationPage();
  }));
  root.querySelectorAll('.approve-url').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.updatePost(btn.dataset.id, { contactUrlApproved: true });
    renderModerationPage();
  }));
  root.querySelectorAll('.reject-url').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Remove this website link from the post? The rest of the post stays live.')) return;
    await AdminApi.updatePost(btn.dataset.id, { contactUrl: '', contactUrlApproved: false });
    renderModerationPage();
  }));
}
