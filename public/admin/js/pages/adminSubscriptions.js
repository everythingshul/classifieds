function subHourLabel(hour) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function renderSubscriptionsPage(query) {
  const root = document.getElementById('adminContent');
  const page = parseInt(query.page, 10) || 1;
  const filters = { status: query.status || '', q: query.q || '' };

  const [data, emailStats] = await Promise.all([
    AdminApi.subscriptions({ ...filters, page, pageSize: 25 }),
    AdminApi.emailStats(),
  ]);
  const counts = data.counts || {};

  root.innerHTML = `
    <h1>Email Subscribers (${data.total})</h1>
    <p class="hint">
      ${counts.confirmed || 0} confirmed &middot; ${counts.pending || 0} pending confirmation &middot; ${counts.unsubscribed || 0} unsubscribed
    </p>

    <div class="stat-grid">
      <div class="stat-card"><div class="num">${emailStats.totalSends}</div><div class="label">Digests Sent</div></div>
      <div class="stat-card"><div class="num">${emailStats.openRate}%</div><div class="label">Open Rate</div><div class="hint" style="margin-top:2px">${emailStats.uniqueOpens} unique (${emailStats.totalOpens} total)</div></div>
      <div class="stat-card"><div class="num">${emailStats.clickRate}%</div><div class="label">Click Rate</div><div class="hint" style="margin-top:2px">${emailStats.uniqueClicks} unique (${emailStats.totalClicks} total)</div></div>
    </div>

    <form class="filters-bar" id="filterForm">
      <div class="field"><label>Search</label><input type="text" name="q" value="${escapeHtml(filters.q)}" placeholder="email…"></div>
      <div class="field"><label>Status</label>
        <select name="status">
          <option value="">Any</option>
          <option value="confirmed" ${filters.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="unsubscribed" ${filters.status === 'unsubscribed' ? 'selected' : ''}>Unsubscribed</option>
        </select>
      </div>
      <button class="btn btn-sm" type="submit">Filter</button>
    </form>

    <div class="tw"><table class="admin-table">
      <thead><tr><th>Email</th><th>Status</th><th>Topics</th><th>Time</th><th>Confirmed</th><th>Last Sent</th><th></th></tr></thead>
      <tbody>
        ${data.subscriptions.length ? data.subscriptions.map((s) => `
          <tr>
            <td>${escapeHtml(s.email)}</td>
            <td><span class="status-pill status-${s.status === 'confirmed' ? 'live' : s.status === 'pending' ? 'pending_approval' : 'removed'}">${s.status}</span></td>
            <td style="max-width:260px">${s.categoryLabels.length ? escapeHtml(s.categoryLabels.join(', ')) : '<span class="hint">—</span>'}</td>
            <td>${subHourLabel(s.sendHour)}</td>
            <td>${s.confirmedAt ? formatDate(s.confirmedAt) : '<span class="hint">—</span>'}</td>
            <td>${s.lastSentAt ? formatDate(s.lastSentAt) : '<span class="hint">—</span>'}</td>
            <td><div class="actions">
              ${s.status === 'pending' ? `<button class="btn btn-sm btn-outline resend-btn" data-id="${s.id}">Resend</button>` : ''}
              ${s.status !== 'unsubscribed' ? `<button class="btn btn-sm btn-outline unsub-btn" data-id="${s.id}">Unsubscribe</button>` : ''}
              <button class="btn btn-sm btn-danger delete-btn" data-id="${s.id}">Delete</button>
            </div></td>
          </tr>
        `).join('') : `<tr><td colspan="7"><div class="empty">No subscribers yet.</div></td></tr>`}
      </tbody>
    </table></div>
    <div class="pagination">
      ${Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => `<a href="#/subscriptions?${new URLSearchParams({ ...filters, page: p })}" class="${p === data.page ? 'active' : ''}">${p}</a>`).join('')}
    </div>
  `;

  document.getElementById('filterForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    window.location.hash = `#/subscriptions?${new URLSearchParams(next)}`;
  });

  root.querySelectorAll('.resend-btn').forEach((btn) => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await AdminApi.resendSubscriptionConfirmation(btn.dataset.id);
      toast('Confirmation email resent');
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
    }
  }));
  root.querySelectorAll('.unsub-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.unsubscribeSubscriber(btn.dataset.id);
    toast('Unsubscribed');
    renderSubscriptionsPage(query);
  }));
  root.querySelectorAll('.delete-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Permanently delete this subscription? This cannot be undone.')) return;
    await AdminApi.deleteSubscription(btn.dataset.id);
    toast('Deleted');
    renderSubscriptionsPage(query);
  }));
}
