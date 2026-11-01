async function renderBannersPage() {
  const root = document.getElementById('adminContent');
  const [{ banners }, { zones }] = await Promise.all([AdminApi.banners(), AdminApi.bannerZones()]);

  root.innerHTML = `
    <h1>Banners</h1>
    <p class="hint">Clickable ad/promo images shown at the top of the page and/or in the sidebar, on whichever pages you choose. A slot with no active banner shows nothing - no empty placeholder.</p>
    <div class="admin-card">
      <button class="btn" id="newBannerBtn">+ New Banner</button>
    </div>
    <div class="tw"><table class="admin-table">
      <thead><tr><th></th><th>Position</th><th>Pages</th><th>Link</th><th>Views</th><th>Clicks</th><th>Active</th><th></th></tr></thead>
      <tbody>
        ${banners.length ? banners.map((b) => `
          <tr>
            <td><img src="${b.imageUrl}" style="max-width:90px;max-height:50px;object-fit:contain;background:#f6f8fb" alt=""></td>
            <td>${b.position === 'top' ? 'Top' : 'Sidebar'}</td>
            <td style="max-width:220px">${b.allPages ? '<span class="pill pill-blue">All pages</span>' : b.pages.map((p) => zones.find((z) => z.key === p)?.label || p).join(', ')}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="${b.linkUrl}" target="_blank" rel="noopener">${escapeHtml(b.linkUrl)}</a></td>
            <td>${b.views}</td>
            <td>${b.clicks}</td>
            <td>
              <label class="tgl">
                <input type="checkbox" class="active-toggle" data-id="${b.id}" ${b.active ? 'checked' : ''}>
                <span class="tgl-s"></span>
              </label>
            </td>
            <td><div class="actions">
              <button class="btn btn-sm btn-outline edit-banner-btn" data-id="${b.id}">Edit</button>
              <button class="btn btn-sm btn-danger delete-banner-btn" data-id="${b.id}">Delete</button>
            </div></td>
          </tr>
        `).join('') : `<tr><td colspan="8"><div class="empty">No banners yet.</div></td></tr>`}
      </tbody>
    </table></div>
  `;

  document.getElementById('newBannerBtn').addEventListener('click', () => openBannerModal(null, zones));
  root.querySelectorAll('.edit-banner-btn').forEach((btn) => btn.addEventListener('click', () => {
    const b = banners.find((x) => String(x.id) === btn.dataset.id);
    openBannerModal(b, zones);
  }));
  root.querySelectorAll('.delete-banner-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Delete this banner?')) return;
    await AdminApi.deleteBanner(btn.dataset.id);
    toast('Deleted');
    renderBannersPage();
  }));
  root.querySelectorAll('.active-toggle').forEach((el) => el.addEventListener('change', async () => {
    await AdminApi.setBannerActive(el.dataset.id, el.checked);
    toast(el.checked ? 'Banner activated' : 'Banner deactivated');
  }));
}

function openBannerModal(banner, zones) {
  const isEdit = !!banner;
  Modal.open(isEdit ? 'Edit Banner' : 'New Banner', `
    <form id="bannerForm">
      <div class="form-row">
        <label>Image <span class="hint">(GIF, JPG, PNG or WEBP - animated GIFs stay animated)</span></label>
        <input type="file" id="bf_image" accept="image/gif,image/jpeg,image/png,image/webp" ${isEdit ? '' : 'required'}>
        ${isEdit ? `<img src="${banner.imageUrl}" style="max-width:160px;max-height:80px;object-fit:contain;margin-top:8px;background:#f6f8fb" alt="">` : ''}
      </div>
      <div class="form-row"><label>Link URL</label><input type="text" id="bf_link" value="${isEdit ? escapeHtml(banner.linkUrl) : ''}" placeholder="/subscribe or https://..." required></div>
      <div class="form-row"><label>Position</label>
        <select id="bf_position">
          <option value="top" ${!isEdit || banner.position === 'top' ? 'selected' : ''}>Top of page</option>
          <option value="sidebar" ${isEdit && banner.position === 'sidebar' ? 'selected' : ''}>Sidebar</option>
        </select>
      </div>
      <div class="form-row">
        <label class="addon-row" style="margin:0 0 8px">
          <input type="checkbox" id="bf_allPages" ${isEdit && banner.allPages ? 'checked' : ''}>
          Show on all pages
        </label>
        <div id="bf_pagesWrap" style="display:${isEdit && banner.allPages ? 'none' : 'block'}">
          <label>Pages</label>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:4px">
            ${zones.map((z) => `
              <label class="addon-row" style="margin:0;padding:3px 0;border:none">
                <input type="checkbox" name="bf_page" value="${z.key}" ${isEdit && banner.pages.includes(z.key) ? 'checked' : ''}>
                <span style="font-weight:400">${escapeHtml(z.label)}</span>
              </label>`).join('')}
          </div>
        </div>
      </div>
      <div id="bannerFormError" class="error-list" style="display:none"></div>
      <div class="bg mt">
        <button class="btn" type="submit">${isEdit ? 'Save Changes' : 'Create Banner'}</button>
        <button class="btn btn-ghost" type="button" onclick="Modal.close()">Cancel</button>
      </div>
    </form>
  `, { sm: true });

  document.getElementById('bf_allPages').addEventListener('change', (e) => {
    document.getElementById('bf_pagesWrap').style.display = e.target.checked ? 'none' : 'block';
  });

  document.getElementById('bannerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('bannerFormError');
    errBox.style.display = 'none';
    const fd = new FormData();
    const imageFile = document.getElementById('bf_image').files[0];
    if (imageFile) fd.set('image', imageFile);
    fd.set('linkUrl', document.getElementById('bf_link').value.trim());
    fd.set('position', document.getElementById('bf_position').value);
    const allPages = document.getElementById('bf_allPages').checked;
    fd.set('allPages', allPages ? '1' : '0');
    const pages = Array.from(document.querySelectorAll('input[name="bf_page"]:checked')).map((el) => el.value);
    fd.set('pages', JSON.stringify(pages));

    try {
      if (isEdit) await AdminApi.updateBanner(banner.id, fd);
      else await AdminApi.createBanner(fd);
      toast(isEdit ? 'Banner updated' : 'Banner created');
      Modal.close();
      renderBannersPage();
    } catch (err) {
      errBox.style.display = 'block';
      errBox.textContent = err.message;
    }
  });
}
