const EDITORIAL_STATUSES = ['pending_approval', 'scheduled', 'live', 'rejected', 'removed'];

async function renderEditorialsPage(query) {
  const root = document.getElementById('adminContent');
  const page = parseInt(query.page, 10) || 1;
  const filters = { status: query.status || '', q: query.q || '' };

  const data = await AdminApi.editorials({ ...filters, page, pageSize: 25 });

  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h1>Editorials (${data.total})</h1>
      <a href="#/editorials/new" class="btn btn-gold btn-sm">+ New Editorial</a>
    </div>
    <form class="filters-bar" id="filterForm">
      <div class="field"><label>Search</label><input type="text" name="q" value="${escapeHtml(filters.q)}" placeholder="title, pen name, email…"></div>
      <div class="field"><label>Status</label>
        <select name="status"><option value="">Any</option>${EDITORIAL_STATUSES.map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <button class="btn btn-sm" type="submit">Filter</button>
    </form>

    <table class="admin-table">
      <thead><tr><th>Title</th><th>Pen Name</th><th>Status</th><th>Views</th><th>Clicks</th><th>Likes</th><th>Submitted</th><th></th></tr></thead>
      <tbody>
        ${data.editorials.map((e) => `
          <tr>
            <td>${escapeHtml(e.title)}${e.isFeatured ? ' <span class="tag" style="background:#e8dcc0">Featured</span>' : ''}<br><span class="hint">${escapeHtml(e.poster.email)}</span></td>
            <td>${escapeHtml(e.penName)}</td>
            <td><span class="status-pill status-${e.status}">${e.status}</span>${e.status === 'scheduled' && e.scheduledAt ? `<br><span class="hint">${formatDate(e.scheduledAt)}</span>` : ''}</td>
            <td>${e.viewCount}</td>
            <td>${e.clickCount}</td>
            <td>${e.likeCount}</td>
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

// datetime-local input value in the browser's own local time, matching the
// admin post scheduling field (routes/admin/posts.js reads it back the same way).
function toDatetimeLocalValue(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openEditorialEditor(id) {
  const ed = await AdminApi.editorial(id);
  const panel = document.getElementById('editorialEditorPanel');
  panel.innerHTML = `
    <div class="admin-card">
      <h3 style="margin-top:0">Edit: ${escapeHtml(ed.title)} <span class="status-pill status-${ed.status}">${ed.status}</span></h3>
      <p class="hint">${ed.viewCount} views · ${ed.clickCount} clicks · ${ed.likeCount} likes · submitted ${formatDate(ed.createdAt)}${ed.status === 'scheduled' && ed.scheduledAt ? ` · scheduled for ${formatDate(ed.scheduledAt)}` : ''}</p>

      <form id="editorialEditForm">
        <div class="form-cols">
          <div class="form-row"><label>Title</label><input name="title" value="${escapeHtml(ed.title)}" maxlength="150"></div>
          <div class="form-row"><label>Pen Name</label><input name="penName" value="${escapeHtml(ed.penName)}" maxlength="60"></div>
        </div>
        <div class="form-row">
          <label>Body</label>
          <div class="rich-toolbar">
            <button type="button" class="btn btn-sm btn-outline" data-cmd="bold"><b>B</b></button>
            <button type="button" class="btn btn-sm btn-outline" data-cmd="italic"><i>I</i></button>
            <button type="button" class="btn btn-sm btn-outline" data-cmd="underline"><u>U</u></button>
            <button type="button" class="btn btn-sm btn-outline" data-cmd="insertUnorderedList">&bull; List</button>
          </div>
          <div id="editBodyEditor" class="rich-editor" contenteditable="true">${ed.body}</div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Status</label>
            <select name="status">${EDITORIAL_STATUSES.map((s) => `<option value="${s}" ${ed.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div class="form-row"><label>Featured</label><select name="isFeatured"><option value="0" ${!ed.isFeatured ? 'selected' : ''}>No</option><option value="1" ${ed.isFeatured ? 'selected' : ''}>Yes</option></select></div>
        </div>
        <div class="form-row"><label>Schedule for <span class="hint">(optional - leave blank for no schedule; set a future time and save to auto-publish then)</span></label><input type="datetime-local" name="scheduledAt" value="${toDatetimeLocalValue(ed.scheduledAt)}"></div>
        <div class="form-row"><label>Rejection Reason <span class="hint">(shown to poster if rejected)</span></label><input name="rejectionReason" value="${escapeHtml(ed.rejectionReason || '')}"></div>
        <div class="form-row"><label>Admin Notes <span class="hint">(internal only)</span></label><textarea name="adminNotes" rows="2">${escapeHtml(ed.adminNotes || '')}</textarea></div>
        <button class="btn" type="submit">Save Changes</button>
      </form>

      <hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${ed.status === 'pending_approval' || ed.status === 'scheduled' ? `<button class="btn btn-gold" id="approveEdBtn">Publish Now</button><button class="btn btn-danger" id="rejectEdBtn">Reject</button>` : ''}
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
  wireRichToolbars(panel);

  document.getElementById('editorialEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    await AdminApi.updateEditorial(id, {
      title: fd.title, penName: fd.penName, body: document.getElementById('editBodyEditor').innerHTML, status: fd.status,
      isFeatured: fd.isFeatured === '1', rejectionReason: fd.rejectionReason, adminNotes: fd.adminNotes,
      scheduledAt: fd.scheduledAt ? String(new Date(fd.scheduledAt).getTime()) : '',
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

// Admin-authored editorials skip the moderation queue - they go straight to
// live (or scheduled, with the same field as post scheduling) instead of
// sitting in pending_approval like a public submission would.
async function renderCreateEditorialPage() {
  const root = document.getElementById('adminContent');
  let files = [];

  root.innerHTML = `
    <h1>+ New Editorial</h1>
    <div class="admin-card" style="max-width:680px">
      <div class="form-cols">
        <div class="form-row"><label>Title</label><input type="text" id="f_title" maxlength="150"></div>
        <div class="form-row"><label>Pen Name</label><input type="text" id="f_penName" maxlength="60"></div>
      </div>
      <div class="form-row">
        <label>Body</label>
        <div class="rich-toolbar">
          <button type="button" class="btn btn-sm btn-outline" data-cmd="bold"><b>B</b></button>
          <button type="button" class="btn btn-sm btn-outline" data-cmd="italic"><i>I</i></button>
          <button type="button" class="btn btn-sm btn-outline" data-cmd="underline"><u>U</u></button>
          <button type="button" class="btn btn-sm btn-outline" data-cmd="insertUnorderedList">&bull; List</button>
        </div>
        <div id="createBodyEditor" class="rich-editor" contenteditable="true"></div>
      </div>
      <div class="form-row"><label>Photos <span class="hint">(optional, up to 6)</span></label><input type="file" id="f_images" accept="image/*" multiple></div>
      <div class="form-row">
        <label>Video URLs <span class="hint">(optional, YouTube/Vimeo)</span></label>
        <input type="text" id="f_video1" placeholder="https://youtube.com/watch?v=..." style="margin-bottom:6px">
        <input type="text" id="f_video2" placeholder="https://youtube.com/watch?v=...">
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
      <h3>Poster / Byline Info</h3>
      <p class="hint">Never shown publicly except the pen name - required fields, even for an admin-authored piece.</p>
      <div class="form-cols">
        <div class="form-row"><label>First Name</label><input type="text" id="p_first"></div>
        <div class="form-row"><label>Last Name</label><input type="text" id="p_last"></div>
      </div>
      <div class="form-row"><label>Email</label><input type="email" id="p_email"></div>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
      <div class="form-row"><label>Featured</label><select id="f_featured"><option value="0">No</option><option value="1">Yes</option></select></div>
      <div class="form-row"><label>Schedule for <span class="hint">(optional - leave blank to publish immediately)</span></label><input type="datetime-local" id="scheduledAt"></div>
      <div id="createError" class="error-list" style="display:none"></div>
      <button class="btn btn-gold" id="submitBtn">Create &amp; Publish</button>
    </div>
  `;
  wireRichToolbars();

  document.getElementById('f_images').addEventListener('change', (e) => {
    files = Array.from(e.target.files).slice(0, 6);
  });

  document.getElementById('submitBtn').addEventListener('click', async () => {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    try {
      const fd = new FormData();
      fd.set('title', document.getElementById('f_title').value.trim());
      fd.set('penName', document.getElementById('f_penName').value.trim());
      fd.set('body', document.getElementById('createBodyEditor').innerHTML);
      fd.set('posterFirstName', document.getElementById('p_first').value.trim());
      fd.set('posterLastName', document.getElementById('p_last').value.trim());
      fd.set('posterEmail', document.getElementById('p_email').value.trim());
      const videoUrls = [document.getElementById('f_video1').value, document.getElementById('f_video2').value].filter((v) => v && v.trim());
      fd.set('videoUrls', JSON.stringify(videoUrls));
      const scheduledInput = document.getElementById('scheduledAt');
      if (scheduledInput.value) fd.set('scheduledAt', String(new Date(scheduledInput.value).getTime()));
      files.forEach((f) => fd.append('images', f));

      const editorial = await AdminApi.createEditorial(fd);
      if (document.getElementById('f_featured').value === '1') {
        await AdminApi.updateEditorial(editorial.id, { isFeatured: true });
      }
      toast(editorial.status === 'scheduled' ? 'Editorial created and scheduled' : 'Editorial created and live');
      window.location.hash = `#/editorials?q=${editorial.publicId}`;
    } catch (e) {
      const box = document.getElementById('createError');
      box.style.display = 'block';
      box.innerHTML = (e.data?.details || [e.message]).map((m) => `<div>${escapeHtml(m)}</div>`).join('');
    } finally {
      btn.disabled = false;
    }
  });
}
