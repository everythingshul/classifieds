async function renderModerationPage() {
  const data = await AdminApi.posts({ status: 'pending_approval', pageSize: 50 });
  const root = document.getElementById('adminContent');

  if (!data.posts.length) {
    root.innerHTML = `<h1>Moderation Queue</h1><p>Nothing waiting for approval. 🎉</p>`;
    return;
  }

  root.innerHTML = `
    <h1>Moderation Queue (${data.total})</h1>
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
}
