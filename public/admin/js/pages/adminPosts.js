async function renderPostsPage(query) {
  const root = document.getElementById('adminContent');
  const page = parseInt(query.page, 10) || 1;
  const filters = { status: query.status || '', type: query.type || '', category: query.category || '', q: query.q || '' };

  const data = await AdminApi.posts({ ...filters, page, pageSize: 25 });

  root.innerHTML = `
    <h1>All Posts (${data.total})</h1>
    <form class="filters-bar" id="filterForm">
      <div class="field"><label>Search</label><input type="text" name="q" value="${escapeHtml(filters.q)}" placeholder="title, email, phone, name…"></div>
      <div class="field"><label>Status</label>
        <select name="status"><option value="">Any</option>${['pending_payment', 'pending_approval', 'live', 'rejected', 'expired', 'removed'].map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Type</label><select name="type"><option value="">Any</option><option value="classified" ${filters.type === 'classified' ? 'selected' : ''}>Classified</option><option value="listing" ${filters.type === 'listing' ? 'selected' : ''}>Listing</option><option value="simcha" ${filters.type === 'simcha' ? 'selected' : ''}>Simcha</option></select></div>
      <button class="btn btn-sm" type="submit">Filter</button>
    </form>

    <table class="admin-table">
      <thead><tr><th>Title</th><th>Type</th><th>Category</th><th>Status</th><th>Views</th><th>Clicks</th><th>Expires</th><th></th></tr></thead>
      <tbody>
        ${data.posts.map((p) => `
          <tr>
            <td>${escapeHtml(p.title)}<br><span class="hint">${escapeHtml(p.poster.email)}</span></td>
            <td>${p.type}</td>
            <td>${escapeHtml(p.categoryLabel)}</td>
            <td><span class="status-pill status-${p.status}">${p.status}</span></td>
            <td>${p.viewCount}</td>
            <td>${p.clickCount}</td>
            <td>${p.expiresAt ? formatDate(p.expiresAt) : (p.savedForever ? 'Never' : '—')}</td>
            <td><button class="btn btn-sm edit-btn" data-id="${p.id}">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="pagination">
      ${Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => `<a href="#/posts?${new URLSearchParams({ ...filters, page: p })}" class="${p === data.page ? 'active' : ''}">${p}</a>`).join('')}
    </div>
    <div id="editorPanel"></div>
  `;

  document.getElementById('filterForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    window.location.hash = `#/posts?${new URLSearchParams(next)}`;
  });
  root.querySelectorAll('.edit-btn').forEach((btn) => btn.addEventListener('click', () => openEditor(btn.dataset.id)));

  if (query.q) {
    const exact = data.posts.find((p) => p.publicId === query.q);
    if (exact) openEditor(exact.id);
  }
}

async function openEditor(id) {
  const p = await AdminApi.post(id);
  const panel = document.getElementById('editorPanel');
  panel.innerHTML = `
    <div class="admin-card">
      <h3 style="margin-top:0">Edit: ${escapeHtml(p.title)} <span class="status-pill status-${p.status}">${p.status}</span></h3>
      <p class="hint">${p.viewCount} views · ${p.clickCount} clicks</p>
      <form id="editForm">
        <div class="form-cols">
          <div class="form-row"><label>Title</label><input name="title" value="${escapeHtml(p.title)}"></div>
          <div class="form-row"><label>Status</label>
            <select name="status">${['pending_payment', 'pending_approval', 'live', 'rejected', 'expired', 'removed'].map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-row"><label>Description</label><textarea name="description" rows="4">${escapeHtml(p.description || '')}</textarea></div>
        <div class="form-cols">
          <div class="form-row"><label>Location</label><input name="locationText" value="${escapeHtml(p.location.text || '')}"></div>
          <div class="form-row"><label>Featured/Striking</label><select name="isFeaturedStrike"><option value="0" ${!p.isFeaturedStrike ? 'selected' : ''}>No</option><option value="1" ${p.isFeaturedStrike ? 'selected' : ''}>Yes</option></select></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Contact Phone</label><input name="contactPhone" value="${escapeHtml(p.contact.phone || '')}"></div>
          <div class="form-row"><label>Contact Email</label><input name="contactEmail" value="${escapeHtml(p.contact.email || '')}"></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Contact Website</label><input name="contactUrl" value="${escapeHtml(p.contact.url || '')}"></div>
          <div class="form-row"><label>Website Approved</label><select name="contactUrlApproved"><option value="0" ${!p.contact.urlApproved ? 'selected' : ''}>No</option><option value="1" ${p.contact.urlApproved ? 'selected' : ''}>Yes</option></select></div>
        </div>
        <div class="form-row"><label>Admin Notes</label><textarea name="adminNotes" rows="2">${escapeHtml(p.adminNotes || '')}</textarea></div>
        <button class="btn" type="submit">Save Changes</button>
      </form>

      <hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${p.status === 'pending_approval' ? `<button class="btn btn-gold" id="approveBtn">Approve &amp; Publish</button><button class="btn btn-danger" id="rejectBtn">Reject</button>` : ''}
        <button class="btn btn-outline" id="boostBtn">Boost to Top</button>
        <button class="btn btn-outline" id="extendBtn">Extend 30 Days</button>
        <button class="btn btn-outline" id="saveForeverBtn">${p.savedForever ? 'Saved Forever' : 'Save Forever'}</button>
        <button class="btn btn-danger" id="deleteBtn">Remove Listing</button>
      </div>

      <h4>Images ${p.images.length ? `(${p.images.length}/6)` : ''}</h4>
      ${p.images.length ? `<div id="imageList" style="display:flex;gap:10px;flex-wrap:wrap">${p.images.map((img) => `
        <div style="text-align:center">
          <img class="thumb-mini" style="width:100px;height:100px" src="${img.url}">
          <div class="hint">${img.approved ? 'Approved' : 'Pending'}</div>
          <button type="button" class="btn btn-sm btn-danger remove-image-btn" data-image-id="${img.id}" style="margin-top:4px">Remove</button>
        </div>`).join('')}</div>` : '<p class="hint">No images yet.</p>'}
      <form id="addImagesForm" style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" name="images" accept="image/*" multiple ${p.images.length >= 6 ? 'disabled' : ''}>
        <button class="btn btn-sm btn-outline" type="submit" ${p.images.length >= 6 ? 'disabled' : ''}>Upload</button>
        ${p.images.length >= 6 ? '<span class="hint">Max 6 images reached - remove one to add more.</span>' : ''}
      </form>

      ${p.payments?.length ? `<h4>Payment History</h4><table class="admin-table"><thead><tr><th>Kind</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>${p.payments.map((pay) => `<tr><td>${pay.kind}</td><td>${formatCents(pay.amount_cents)}</td><td>${pay.status}</td><td>${formatDate(pay.created_at)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${p.reports?.length ? `<h4>Reports (${p.reports.length})</h4><ul>${p.reports.map((r) => `<li>${escapeHtml(r.reason || '(no reason given)')} — ${formatDate(r.created_at)}</li>`).join('')}</ul>` : ''}
    </div>
  `;

  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.isFeaturedStrike = body.isFeaturedStrike === '1';
    body.contactUrlApproved = body.contactUrlApproved === '1';
    await AdminApi.updatePost(id, body);
    toast('Saved');
    openEditor(id);
  });
  document.getElementById('boostBtn').addEventListener('click', async () => { await AdminApi.boostPost(id); toast('Boosted'); });
  document.getElementById('extendBtn').addEventListener('click', async () => { await AdminApi.extendPost(id, 30); toast('Extended 30 days'); openEditor(id); });
  document.getElementById('saveForeverBtn').addEventListener('click', async () => { await AdminApi.saveForever(id); toast('Saved forever'); openEditor(id); });
  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!confirm('Remove this listing?')) return;
    await AdminApi.deletePost(id);
    toast('Removed');
    renderPostsPage(AdminRouter.query());
  });
  const approveBtn = document.getElementById('approveBtn');
  if (approveBtn) approveBtn.addEventListener('click', async () => { await AdminApi.approvePost(id); toast('Approved'); openEditor(id); });
  const rejectBtn = document.getElementById('rejectBtn');
  if (rejectBtn) rejectBtn.addEventListener('click', async () => {
    const reason = prompt('Reason for rejection:') || '';
    await AdminApi.rejectPost(id, reason);
    toast('Rejected');
    openEditor(id);
  });

  document.querySelectorAll('.remove-image-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this image?')) return;
      await AdminApi.removeImage(id, btn.dataset.imageId);
      toast('Image removed');
      openEditor(id);
    });
  });
  document.getElementById('addImagesForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input[type="file"]');
    if (!input.files.length) return;
    const fd = new FormData();
    for (const file of input.files) fd.append('images', file);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Uploading…';
    try {
      await AdminApi.addImages(id, fd);
      toast('Image(s) added');
      openEditor(id);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Upload';
    }
  });
}
