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
