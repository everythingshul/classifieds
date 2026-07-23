let _catTab = 'types';

async function renderCategoriesPage() {
  const root = document.getElementById('adminContent');
  root.innerHTML = `
    <h1>Categories</h1>
    <div class="tabs">
      <button data-tab="types" class="${_catTab === 'types' ? 'active' : ''}">Classifieds Types</button>
      <button data-tab="job" class="${_catTab === 'job' ? 'active' : ''}">Job Categories</button>
      <button data-tab="real_estate" class="${_catTab === 'real_estate' ? 'active' : ''}">Real Estate Categories</button>
      <button data-tab="simcha" class="${_catTab === 'simcha' ? 'active' : ''}">Simcha Categories</button>
    </div>
    <div id="catContent"></div>
  `;
  root.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => { _catTab = btn.dataset.tab; renderCategoriesPage(); }));
  if (_catTab === 'types') await renderCustomCategoryList();
  else await renderCatList();
}

async function renderCustomCategoryList() {
  const content = document.getElementById('catContent');
  const all = await AdminApi.customCategories();
  content.innerHTML = `
    <div class="admin-card">
      <p class="hint">The 9 built-in types can't be removed. Add new ones below with a generic form (description, location, and optional price/photos).</p>
      <form id="addTypeForm" style="margin-bottom:16px">
        <div class="form-cols">
          <div class="form-row"><label>Name (English)</label><input type="text" id="newLabel" required></div>
          <div class="form-row"><label>Name (Hebrew) <span class="hint">optional</span></label><input type="text" id="newLabelHe"></div>
        </div>
        <div style="display:flex;gap:16px;margin:8px 0">
          <label><input type="checkbox" id="newHasPrice"> Has a price field</label>
          <label><input type="checkbox" id="newHasImages"> Allows photos (admin-approved)</label>
          <label><input type="checkbox" id="newFree"> Free to post</label>
        </div>
        <button class="btn btn-sm" type="submit">Add Type</button>
      </form>
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Price?</th><th>Photos?</th><th>Free?</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${all.map((c) => `
            <tr data-key="${c.key}" data-id="${c.id || ''}">
              <td>${escapeHtml(c.label)}${c.isSystem ? ' <span class="tag">built-in</span>' : ''}</td>
              <td>${c.hasPrice ? 'Yes' : 'No'}</td>
              <td>${c.hasImages ? 'Yes' : 'No'}</td>
              <td>${c.free ? 'Yes' : 'No'}</td>
              <td>${c.isSystem ? '—' : (c.active ? 'Active' : 'Inactive')}</td>
              <td>${c.isSystem ? '' : `<button class="btn btn-sm toggle-type">${c.active ? 'Deactivate' : 'Activate'}</button> <button class="btn btn-sm btn-danger delete-type">Delete</button>`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('addTypeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await AdminApi.createCustomCategory({
      label: document.getElementById('newLabel').value.trim(),
      labelHe: document.getElementById('newLabelHe').value.trim() || null,
      hasPrice: document.getElementById('newHasPrice').checked,
      hasImages: document.getElementById('newHasImages').checked,
      free: document.getElementById('newFree').checked,
    });
    renderCustomCategoryList();
  });

  content.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.dataset.id;
    if (!id) return;
    const toggleBtn = row.querySelector('.toggle-type');
    if (toggleBtn) toggleBtn.addEventListener('click', async () => {
      const c = all.find((x) => String(x.id) === id);
      await AdminApi.updateCustomCategory(id, { active: !c.active });
      renderCustomCategoryList();
    });
    const delBtn = row.querySelector('.delete-type');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this classifieds type?')) return;
      await AdminApi.deleteCustomCategory(id);
      renderCustomCategoryList();
    });
  });
}

async function renderCatList() {
  const all = await AdminApi.taxonomies(_catTab);
  const isRealEstate = _catTab === 'real_estate';
  const top = all.filter((t) => !t.parent_id);
  const content = document.getElementById('catContent');

  function rowHtml(t, indent) {
    const kids = isRealEstate ? all.filter((c) => c.parent_id === t.id) : [];
    return `
      <tr data-id="${t.id}">
        <td>${'— '.repeat(indent)}${escapeHtml(t.name)}</td>
        <td>${t.active ? 'Active' : 'Inactive'}</td>
        <td>
          <button class="btn btn-sm edit-cat">Rename</button>
          <button class="btn btn-sm toggle-cat">${t.active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-sm btn-danger delete-cat">Delete</button>
          ${isRealEstate && !t.parent_id ? `<button class="btn btn-sm add-sub" data-parent="${t.id}">+ Sub-category</button>` : ''}
        </td>
      </tr>
      ${kids.map((k) => rowHtml(k, indent + 1)).join('')}
    `;
  }

  content.innerHTML = `
    <div class="admin-card">
      <form id="addForm" style="display:flex;gap:10px;align-items:flex-end;margin-bottom:16px">
        <div class="field"><label>New ${isRealEstate ? 'top-level ' : ''}category name</label><input type="text" id="newName" required></div>
        <button class="btn btn-sm" type="submit">Add</button>
      </form>
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
        <tbody>${top.map((t) => rowHtml(t, 0)).join('')}</tbody>
      </table>
    </div>
  `;

  document.getElementById('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newName').value.trim();
    if (!name) return;
    await AdminApi.createTaxonomy({ grp: _catTab, name });
    renderCatList();
  });

  content.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.dataset.id;
    const t = all.find((x) => String(x.id) === id);
    row.querySelector('.edit-cat').addEventListener('click', async () => {
      const name = prompt('New name:', t.name);
      if (!name) return;
      await AdminApi.updateTaxonomy(id, { name });
      renderCatList();
    });
    row.querySelector('.toggle-cat').addEventListener('click', async () => {
      await AdminApi.updateTaxonomy(id, { active: t.active ? 0 : 1 });
      renderCatList();
    });
    row.querySelector('.delete-cat').addEventListener('click', async () => {
      if (!confirm(`Delete "${t.name}"?`)) return;
      await AdminApi.deleteTaxonomy(id);
      renderCatList();
    });
    const addSub = row.querySelector('.add-sub');
    if (addSub) addSub.addEventListener('click', async () => {
      const name = prompt('Sub-category name:');
      if (!name) return;
      await AdminApi.createTaxonomy({ grp: 'real_estate', parentId: Number(addSub.dataset.parent), name });
      renderCatList();
    });
  });
}
