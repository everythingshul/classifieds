// Category management, CRM search, and contact messages - grouped
// admin management pages.

let _catTab = 'types';
let _subCatKey = null; // "classified:<key>" or "listing:<key>" - which category's sub-categories are being managed

async function renderCategoriesPage() {
  const root = document.getElementById('adminContent');
  root.innerHTML = `
    <h1>Categories</h1>
    <div class="tabs">
      <button data-tab="types" class="${_catTab === 'types' ? 'active' : ''}">Classifieds Types</button>
      <button data-tab="listing_types" class="${_catTab === 'listing_types' ? 'active' : ''}">Listing Categories</button>
      <button data-tab="job" class="${_catTab === 'job' ? 'active' : ''}">Job Categories</button>
      <button data-tab="real_estate" class="${_catTab === 'real_estate' ? 'active' : ''}">Real Estate Categories</button>
      <button data-tab="simcha" class="${_catTab === 'simcha' ? 'active' : ''}">Simcha Categories</button>
      <button data-tab="sub" class="${_catTab === 'sub' ? 'active' : ''}">Other Sub-Categories</button>
      <button data-tab="job_type" class="${_catTab === 'job_type' ? 'active' : ''}">Job Types</button>
      <button data-tab="pay_period" class="${_catTab === 'pay_period' ? 'active' : ''}">Pay Periods</button>
    </div>
    <div id="catContent"></div>
  `;
  root.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => { _catTab = btn.dataset.tab; renderCategoriesPage(); }));
  if (_catTab === 'types') {
    await renderGenericCategoryList({
      list: () => AdminApi.customCategories(),
      create: (body) => AdminApi.createCustomCategory(body),
      update: (id, body) => AdminApi.updateCustomCategory(id, body),
      remove: (id) => AdminApi.deleteCustomCategory(id),
      intro: "The 9 built-in types can't be removed. Add new ones below with a generic form (description, location, and optional price/photos).",
      deleteConfirm: 'Delete this classifieds type?',
    });
  } else if (_catTab === 'listing_types') {
    await renderGenericCategoryList({
      list: () => AdminApi.listingCategories(),
      create: (body) => AdminApi.createListingCategory(body),
      update: (id, body) => AdminApi.updateListingCategory(id, body),
      remove: (id) => AdminApi.deleteListingCategory(id),
      intro: 'Listings starts with zero categories - add whatever you need below with a generic form (description, location, and optional price/photos).',
      deleteConfirm: 'Delete this listing category?',
    });
  } else if (_catTab === 'sub') {
    await renderOtherSubCategoriesTab();
  } else {
    await renderTaxonomyTree(_catTab);
  }
}

async function renderGenericCategoryList({ list, create, update, remove, intro, deleteConfirm }) {
  const content = document.getElementById('catContent');
  const all = await list();
  const reload = () => renderCategoriesPage();
  content.innerHTML = `
    <div class="admin-card">
      <p class="hint">${escapeHtml(intro)}</p>
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
        <button class="btn btn-sm" type="submit">Add</button>
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
    await create({
      label: document.getElementById('newLabel').value.trim(),
      labelHe: document.getElementById('newLabelHe').value.trim() || null,
      hasPrice: document.getElementById('newHasPrice').checked,
      hasImages: document.getElementById('newHasImages').checked,
      free: document.getElementById('newFree').checked,
    });
    reload();
  });

  content.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.dataset.id;
    if (!id) return;
    const toggleBtn = row.querySelector('.toggle-type');
    if (toggleBtn) toggleBtn.addEventListener('click', async () => {
      const c = all.find((x) => String(x.id) === id);
      await update(id, { active: !c.active });
      reload();
    });
    const delBtn = row.querySelector('.delete-type');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm(deleteConfirm)) return;
      await remove(id);
      reload();
    });
  });
}

// Lets the admin pick any classifieds or listing category that isn't already
// covered by its own dedicated tab (Job/Real Estate/Simcha) and manage a
// sub-category tree for it, backed by that category's derived taxonomy
// group ("cat:<key>" / "lst:<key>").
async function renderOtherSubCategoriesTab() {
  const content = document.getElementById('catContent');
  const cfg = await fetch('/api/config').then((r) => r.json());
  const options = [
    ...cfg.categories.filter((c) => !['job-offers', 'seeking-a-job', 'real-estate'].includes(c.key)).map((c) => ({ value: `classified:${c.key}`, label: `Classifieds: ${c.label}`, grp: c.taxonomyGroup })),
    ...cfg.listingCategories.map((c) => ({ value: `listing:${c.key}`, label: `Listing: ${c.label}`, grp: c.taxonomyGroup })),
  ];

  if (!_subCatKey || !options.some((o) => o.value === _subCatKey)) _subCatKey = options[0]?.value || null;
  const current = options.find((o) => o.value === _subCatKey);

  content.innerHTML = `
    <div class="admin-card">
      <p class="hint">Add sub-categories under any classifieds or listing category (besides Job/Real Estate/Simcha, which have their own tabs above).</p>
      ${options.length ? `<div class="form-row" style="max-width:360px"><label>Category</label><select id="subCatSelect">${options.map((o) => `<option value="${o.value}" ${o.value === _subCatKey ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>` : `<p class="hint">No categories exist yet - add one under Classifieds Types or Listing Categories first.</p>`}
      <div id="subCatTreeHost"></div>
    </div>
  `;

  const select = document.getElementById('subCatSelect');
  if (select) {
    select.addEventListener('change', () => { _subCatKey = select.value; renderCategoriesPage(); });
  }
  if (current) {
    await renderTaxonomyTree(current.grp, { hostId: 'subCatTreeHost', reload: () => renderCategoriesPage() });
  }
}

// Generic tree-of-taxonomies manager, used by the Job/Real Estate/Simcha
// tabs (with their fixed grp) and by the "Other Sub-Categories" tab (with a
// grp derived from whichever category is selected there).
async function renderTaxonomyTree(grp, { hostId = 'catContent', reload } = {}) {
  const all = await AdminApi.taxonomies(grp);
  const doReload = reload || (() => renderCategoriesPage());
  const top = all.filter((t) => !t.parent_id);
  const content = document.getElementById(hostId);

  function rowHtml(t, indent) {
    const kids = all.filter((c) => c.parent_id === t.id);
    return `
      <tr data-id="${t.id}">
        <td>${'— '.repeat(indent)}${escapeHtml(t.name)}</td>
        <td>${t.active ? 'Active' : 'Inactive'}</td>
        <td>
          <button class="btn btn-sm edit-cat">Rename</button>
          <button class="btn btn-sm toggle-cat">${t.active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-sm btn-danger delete-cat">Delete</button>
          ${!t.parent_id ? `<button class="btn btn-sm add-sub" data-parent="${t.id}">+ Sub-category</button>` : ''}
        </td>
      </tr>
      ${kids.map((k) => rowHtml(k, indent + 1)).join('')}
    `;
  }

  content.innerHTML = `
    <form id="addForm" style="display:flex;gap:10px;align-items:flex-end;margin-bottom:16px">
      <div class="field"><label>New top-level category name</label><input type="text" id="newName" required></div>
      <button class="btn btn-sm" type="submit">Add</button>
    </form>
    <table class="admin-table">
      <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
      <tbody>${top.map((t) => rowHtml(t, 0)).join('')}</tbody>
    </table>
  `;

  document.getElementById('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newName').value.trim();
    if (!name) return;
    await AdminApi.createTaxonomy({ grp, name });
    doReload();
  });

  content.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.dataset.id;
    const t = all.find((x) => String(x.id) === id);
    row.querySelector('.edit-cat').addEventListener('click', async () => {
      const name = prompt('New name:', t.name);
      if (!name) return;
      await AdminApi.updateTaxonomy(id, { name });
      doReload();
    });
    row.querySelector('.toggle-cat').addEventListener('click', async () => {
      await AdminApi.updateTaxonomy(id, { active: t.active ? 0 : 1 });
      doReload();
    });
    row.querySelector('.delete-cat').addEventListener('click', async () => {
      if (!confirm(`Delete "${t.name}"?`)) return;
      await AdminApi.deleteTaxonomy(id);
      doReload();
    });
    const addSub = row.querySelector('.add-sub');
    if (addSub) addSub.addEventListener('click', async () => {
      const name = prompt('Sub-category name:');
      if (!name) return;
      await AdminApi.createTaxonomy({ grp, parentId: Number(addSub.dataset.parent), name });
      doReload();
    });
  });
}

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

let _cmShowArchived = false;

async function renderContactMessagesPage() {
  const root = document.getElementById('adminContent');
  const { messages } = await AdminApi.contactMessages();
  const visible = messages.filter((m) => (_cmShowArchived ? true : !m.archived));

  root.innerHTML = `
    <h1>Contact Messages</h1>
    <div class="admin-card">
      <label style="display:inline-flex;align-items:center;gap:6px;margin-bottom:12px">
        <input type="checkbox" id="showArchived" ${_cmShowArchived ? 'checked' : ''}> Show archived / replied messages
      </label>
      ${visible.length ? visible.map((m) => renderMessageCard(m)).join('') : '<p class="hint">No messages here.</p>'}
    </div>
  `;

  document.getElementById('showArchived').addEventListener('change', (e) => {
    _cmShowArchived = e.target.checked;
    renderContactMessagesPage();
  });

  document.querySelectorAll('.cm-card').forEach((card) => {
    const id = card.dataset.id;
    const m = messages.find((x) => String(x.id) === id);

    card.querySelector('.cm-archive-toggle')?.addEventListener('click', async () => {
      await AdminApi.archiveContactMessage(id, !m.archived);
      renderContactMessagesPage();
    });
    card.querySelector('.cm-delete')?.addEventListener('click', async () => {
      if (!confirm('Permanently delete this message?')) return;
      await AdminApi.deleteContactMessage(id);
      renderContactMessagesPage();
    });
    const replyBtn = card.querySelector('.cm-reply-btn');
    const replyBox = card.querySelector('.cm-reply-box');
    if (replyBtn) replyBtn.addEventListener('click', () => {
      replyBox.style.display = replyBox.style.display === 'none' ? 'block' : 'none';
    });
    const sendBtn = card.querySelector('.cm-reply-send');
    if (sendBtn) sendBtn.addEventListener('click', async () => {
      const textarea = card.querySelector('.cm-reply-text');
      const text = textarea.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      try {
        await AdminApi.replyContactMessage(id, text);
        toast('Reply sent');
        renderContactMessagesPage();
      } catch (e) {
        alert(`Failed to send: ${e.message}`);
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Reply';
      }
    });
  });
}

function renderMessageCard(m) {
  return `
    <div class="cm-card" data-id="${m.id}" style="border:1px solid var(--border);padding:12px;margin-bottom:10px;${m.archived ? 'opacity:.7' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div>
          <b>${escapeHtml(m.name || '(no name)')}</b> &lt;${escapeHtml(m.email)}&gt;
          ${m.subject ? ` — <span>${escapeHtml(m.subject)}</span>` : ''}
        </div>
        <span class="hint">${formatDate(m.created_at)}</span>
      </div>
      <p style="white-space:pre-wrap;margin:8px 0">${escapeHtml(m.message)}</p>
      ${m.reply_text ? `
        <div style="background:#f4f6f8;padding:8px 10px;margin:8px 0;border-left:3px solid var(--cta)">
          <div class="hint">Your reply (${formatDate(m.replied_at)}):</div>
          <p style="white-space:pre-wrap;margin:4px 0 0">${escapeHtml(m.reply_text)}</p>
        </div>
      ` : ''}
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn btn-sm cm-reply-btn" type="button">Reply</button>
        <button class="btn btn-sm btn-outline cm-archive-toggle" type="button">${m.archived ? 'Unarchive' : 'Archive'}</button>
        <button class="btn btn-sm btn-danger cm-delete" type="button">Delete</button>
      </div>
      <div class="cm-reply-box" style="display:none;margin-top:10px">
        <textarea class="cm-reply-text" rows="4" style="width:100%" placeholder="Type your reply…">${m.reply_text ? escapeHtml(m.reply_text) : ''}</textarea>
        <button class="btn btn-sm btn-gold cm-reply-send" type="button" style="margin-top:6px">Send Reply</button>
      </div>
    </div>
  `;
}
