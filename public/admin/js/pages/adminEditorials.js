async function renderEditorialsPage(query) {
  const root = document.getElementById('adminContent');
  const page = parseInt(query.page, 10) || 1;
  const filters = { status: query.status || '', q: query.q || '' };

  const data = await AdminApi.editorials({ ...filters, page, pageSize: 25 });

  root.innerHTML = `
    <h1>Editorials (${data.total})</h1>
    <form class="filters-bar" id="filterForm">
      <div class="field"><label>Search</label><input type="text" name="q" value="${escapeHtml(filters.q)}" placeholder="title, pen name, email…"></div>
      <div class="field"><label>Status</label>
        <select name="status"><option value="">Any</option>${['pending_approval', 'live', 'rejected', 'removed'].map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <button class="btn btn-sm" type="submit">Filter</button>
    </form>

    <table class="admin-table">
      <thead><tr><th>Title</th><th>Pen Name</th><th>Status</th><th>Views</th><th>Clicks</th><th>Submitted</th><th></th></tr></thead>
      <tbody>
        ${data.editorials.map((e) => `
          <tr>
            <td>${escapeHtml(e.title)}${e.isFeatured ? ' <span class="tag" style="background:#e8dcc0">Featured</span>' : ''}<br><span class="hint">${escapeHtml(e.poster.email)}</span></td>
            <td>${escapeHtml(e.penName)}</td>
            <td><span class="status-pill status-${e.status}">${e.status}</span></td>
            <td>${e.viewCount}</td>
            <td>${e.clickCount}</td>
            <td>${formatDate(e.createdAt)}</td>
            <td><button class="btn btn-sm edit-btn" data-id="${e.id}">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="pagination">
      ${Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => `<a href="#/editorials?${new URLSearchParams({ ...filters, page: p })}" class="${p === data.page ? 'active' : ''}">${p}</a>`).join('')}
    </div>
    <div id="editorialEditorPanel"></div>
  `;

  document.getElementById('filterForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    window.location.hash = `#/editorials?${new URLSearchParams(next)}`;
  });
  root.querySelectorAll('.edit-btn').forEach((btn) => btn.addEventListener('click', () => openEditorialEditor(btn.dataset.id)));

  if (query.q) {
    const exact = data.editorials.find((e) => e.publicId === query.q);
    if (exact) openEditorialEditor(exact.id);
  }
}

function editorialCommentRowHtml(c) {
  return `
    <div class="editorial-admin-comment" data-comment-id="${c.id}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div>
          <b>${escapeHtml(c.penName)}</b> <span class="hint">${escapeHtml(c.email)} · ${formatDate(c.createdAt)}</span>
          <span class="status-pill status-${c.status}">${c.status}</span>
          <p style="margin:4px 0 0">${escapeHtml(c.body)}</p>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${c.status !== 'live' ? `<button class="btn btn-sm approve-comment-btn" data-id="${c.id}">Approve</button>` : ''}
          ${c.status !== 'rejected' ? `<button class="btn btn-sm btn-outline reject-comment-btn" data-id="${c.id}">Reject</button>` : ''}
          <button class="btn btn-sm btn-danger delete-comment-btn" data-id="${c.id}">Delete</button>
        </div>
      </div>
    </div>`;
}

async function openEditorialEditor(id) {
  const ed = await AdminApi.editorial(id);
  const panel = document.getElementById('editorialEditorPanel');
  panel.innerHTML = `
    <div class="admin-card">
      <h3 style="margin-top:0">Edit: ${escapeHtml(ed.title)} <span class="status-pill status-${ed.status}">${ed.status}</span></h3>
      <p class="hint">${ed.viewCount} views · ${ed.clickCount} clicks · submitted ${formatDate(ed.createdAt)}</p>

      <form id="editorialEditForm">
        <div class="form-cols">
          <div class="form-row"><label>Title</label><input name="title" value="${escapeHtml(ed.title)}" maxlength="150"></div>
          <div class="form-row"><label>Pen Name</label><input name="penName" value="${escapeHtml(ed.penName)}" maxlength="60"></div>
        </div>
        <div class="form-row"><label>Body</label><textarea name="body" rows="10">${escapeHtml(ed.body)}</textarea></div>
        <div class="form-cols">
          <div class="form-row"><label>Status</label>
            <select name="status">${['pending_approval', 'live', 'rejected', 'removed'].map((s) => `<option value="${s}" ${ed.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div class="form-row"><label>Featured</label><select name="isFeatured"><option value="0" ${!ed.isFeatured ? 'selected' : ''}>No</option><option value="1" ${ed.isFeatured ? 'selected' : ''}>Yes</option></select></div>
        </div>
        <div class="form-row"><label>Rejection Reason <span class="hint">(shown to poster if rejected)</span></label><input name="rejectionReason" value="${escapeHtml(ed.rejectionReason || '')}"></div>
        <div class="form-row"><label>Admin Notes <span class="hint">(internal only)</span></label><textarea name="adminNotes" rows="2">${escapeHtml(ed.adminNotes || '')}</textarea></div>
        <button class="btn" type="submit">Save Changes</button>
      </form>

      <hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${ed.status === 'pending_approval' ? `<button class="btn btn-gold" id="approveEdBtn">Approve &amp; Publish</button><button class="btn btn-danger" id="rejectEdBtn">Reject</button>` : ''}
        <button class="btn btn-danger" id="deleteEdBtn">Remove</button>
      </div>

      <h4>Poster (never shown publicly)</h4>
      <p class="hint">
        ${escapeHtml(ed.poster.firstName)} ${escapeHtml(ed.poster.lastName)} · ${escapeHtml(ed.poster.email)}${ed.poster.phone ? ` · ${escapeHtml(ed.poster.phone)}` : ''}
        ${ed.notesToAdmin ? `<br><b>Notes to editor:</b> ${escapeHtml(ed.notesToAdmin)}` : ''}
      </p>

      <h4>Images ${ed.images.length ? `(${ed.images.length}/6)` : ''}</h4>
      ${ed.images.length ? `<div id="edImageList" style="display:flex;gap:10px;flex-wrap:wrap">${ed.images.map((img) => `
        <div style="text-align:center">
          <img class="thumb-mini" style="width:100px;height:100px" src="${img.url}">
          <button type="button" class="btn btn-sm btn-danger remove-ed-image-btn" data-image-id="${img.id}" style="margin-top:4px">Remove</button>
        </div>`).join('')}</div>` : '<p class="hint">No images.</p>'}
      <form id="addEdImagesForm" style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" name="images" accept="image/*" multiple ${ed.images.length >= 6 ? 'disabled' : ''}>
        <button class="btn btn-sm btn-outline" type="submit" ${ed.images.length >= 6 ? 'disabled' : ''}>Upload</button>
      </form>

      ${ed.videoUrls.length ? `<h4>Videos</h4><ul>${ed.videoUrls.map((u) => `<li><a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a></li>`).join('')}</ul>` : ''}

      <h4>Comments (${ed.comments.length})</h4>
      <div id="edCommentsList">${ed.comments.length ? ed.comments.map(editorialCommentRowHtml).join('') : '<p class="hint">No comments yet.</p>'}</div>
    </div>
  `;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.getElementById('editorialEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    await AdminApi.updateEditorial(id, {
      title: fd.title, penName: fd.penName, body: fd.body, status: fd.status,
      isFeatured: fd.isFeatured === '1', rejectionReason: fd.rejectionReason, adminNotes: fd.adminNotes,
    });
    toast('Saved');
    openEditorialEditor(id);
  });

  const approveBtn = document.getElementById('approveEdBtn');
  if (approveBtn) approveBtn.addEventListener('click', async () => {
    await AdminApi.approveEditorial(id);
    toast('Approved and published');
    openEditorialEditor(id);
  });
  const rejectBtn = document.getElementById('rejectEdBtn');
  if (rejectBtn) rejectBtn.addEventListener('click', async () => {
    const reason = prompt('Reason for rejection (shown to the poster, optional):') || '';
    await AdminApi.rejectEditorial(id, reason);
    toast('Rejected');
    openEditorialEditor(id);
  });
  document.getElementById('deleteEdBtn').addEventListener('click', async () => {
    if (!confirm('Remove this editorial? It will be hidden from the site.')) return;
    await AdminApi.deleteEditorial(id);
    toast('Removed');
    window.location.hash = '#/editorials';
  });

  document.getElementById('addEdImagesForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await AdminApi.addEditorialImages(id, fd);
      openEditorialEditor(id);
    } catch (err) {
      toast(err.message);
    }
  });
  panel.querySelectorAll('.remove-ed-image-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.removeEditorialImage(id, btn.dataset.imageId);
    openEditorialEditor(id);
  }));

  panel.querySelectorAll('.approve-comment-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.approveEditorialComment(btn.dataset.id);
    openEditorialEditor(id);
  }));
  panel.querySelectorAll('.reject-comment-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.rejectEditorialComment(btn.dataset.id);
    openEditorialEditor(id);
  }));
  panel.querySelectorAll('.delete-comment-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Delete this comment permanently?')) return;
    await AdminApi.deleteEditorialComment(btn.dataset.id);
    openEditorialEditor(id);
  }));
}
