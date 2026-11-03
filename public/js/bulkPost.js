// Hidden bulk-posting tool. Not part of the main SPA (no router/i18n) - a
// small standalone page sharing only utils.js (escapeHtml/toast/
// populateCountrySelect) and main.css for a consistent look.
(() => {
  const BULK_TOKEN_KEY = 'esc_bulk_token';
  const ADMIN_TOKEN_KEY = 'esc_admin_token';

  function getToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(BULK_TOKEN_KEY);
  }
  function clearTokens() {
    localStorage.removeItem(BULK_TOKEN_KEY);
    // Never clear the admin token here - a stale/expired bulk session
    // shouldn't be able to log an admin out of the admin portal too.
  }

  let blocks = [];
  let uidCounter = 0;

  function currentCategories(type) {
    return type === 'listing' ? (window.SITE_CONFIG.listingCategories || []) : (window.SITE_CONFIG.categories || []);
  }
  function catDefFor(type, key) {
    return currentCategories(type).find((c) => c.key === key);
  }

  function priceFieldHtml() {
    const currencies = window.SITE_CONFIG.currencies || [{ code: 'USD' }];
    return `
      <div class="form-row"><label>Price <span class="hint">(optional - amount, text like "Call for price", or leave blank)</span></label>
        <div style="display:flex;gap:6px">
          <input type="text" data-field="price" style="flex:1">
          <select data-field="currency" style="width:110px">${currencies.map((c) => `<option value="${c.code}" ${c.code === 'USD' ? 'selected' : ''}>${escapeHtml(c.code)}</option>`).join('')}</select>
        </div>
      </div>`;
  }
  function genericTaxonomyFieldHtml(type, categoryKey) {
    const catDef = catDefFor(type, categoryKey);
    const grp = catDef?.taxonomyGroup;
    if (!grp || grp === 'job' || grp === 'real_estate') return '';
    const opts = (window.SITE_CONFIG.taxonomies || []).filter((t) => t.grp === grp);
    if (!opts.length) return '';
    return `<div class="form-row"><label>Category</label><select data-field="taxonomyId"><option value="">Select…</option>${opts.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>`;
  }

  // Mirrors the public post wizard's category-specific fields exactly (see
  // public/js/pages/postWizard.js's categorySpecificFieldsHtml) so this tool
  // offers the same full field set, just without a payment step.
  function categoryFieldsHtml(type, categoryKey) {
    if (type === 'simcha') return '';
    const jobTax = (window.SITE_CONFIG.taxonomies || []).filter((t) => t.grp === 'job');
    const reTax = (window.SITE_CONFIG.taxonomies || []).filter((t) => t.grp === 'real_estate');
    const key = type === 'listing' ? null : categoryKey;
    switch (key) {
      case 'job-offers':
        return `
          <div class="form-cols">
            <div class="form-row"><label>Job Type</label><select data-field="jobType">${(window.SITE_CONFIG.jobTypes || []).map((t) => `<option value="${t}">${t.replace('_', ' ')}</option>`).join('')}</select></div>
            <div class="form-row"><label>Job Category</label><select data-field="taxonomyId"><option value="">Select…</option>${jobTax.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>
          </div>
          <div class="form-cols">
            <div class="form-row"><label>Pay Amount <span class="hint">(optional)</span></label>
              <div style="display:flex;gap:6px">
                <input type="text" data-field="payAmount" style="flex:1">
                <select data-field="payCurrency" style="width:90px">${(window.SITE_CONFIG.currencies || [{ code: 'USD' }]).map((c) => `<option value="${c.code}" ${c.code === 'USD' ? 'selected' : ''}>${escapeHtml(c.code)}</option>`).join('')}</select>
              </div>
            </div>
            <div class="form-row"><label>Per</label><select data-field="payPeriod">${(window.SITE_CONFIG.payPeriods || []).map((p) => `<option value="${p}">${p}</option>`).join('')}</select></div>
          </div>`;
      case 'seeking-a-job':
        return `
          <div class="form-row"><label>Job Category</label><select data-field="taxonomyId"><option value="">Select…</option>${jobTax.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>
          <div class="form-row"><label>Experience</label><textarea data-field="experience" rows="3"></textarea></div>`;
      case 'items-for-sale':
      case 'items-for-rent':
        return `${genericTaxonomyFieldHtml(type, categoryKey)}${priceFieldHtml()}`;
      case 'lost-found':
        return `${genericTaxonomyFieldHtml(type, categoryKey)}<div class="form-row"><label>Lost or Found</label><select data-field="lostOrFound"><option value="lost">Lost</option><option value="found">Found</option></select></div>`;
      case 'real-estate':
        return `
          <div class="form-row"><label>Category</label><select data-field="taxonomyId"><option value="">Select…</option>${reTax.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>
          ${priceFieldHtml()}`;
      default: {
        const catDef = catDefFor(type, categoryKey);
        return `${genericTaxonomyFieldHtml(type, categoryKey)}${catDef?.hasPrice ? priceFieldHtml() : ''}`;
      }
    }
  }

  function readCategoryFields(fieldsEl, type, categoryKey) {
    const val = (name) => fieldsEl.querySelector(`[data-field="${name}"]`)?.value ?? '';
    const has = (name) => !!fieldsEl.querySelector(`[data-field="${name}"]`);
    const fields = {};
    if (type === 'listing') {
      if (has('price')) { fields.price = val('price'); fields.currency = val('currency'); }
      if (has('taxonomyId')) fields.taxonomyId = val('taxonomyId');
    } else if (categoryKey === 'job-offers') {
      fields.jobType = val('jobType');
      fields.taxonomyId = val('taxonomyId');
      const pay = val('payAmount');
      if (pay) { fields.payAmount = pay; fields.payPeriod = val('payPeriod'); fields.payCurrency = val('payCurrency'); }
    } else if (categoryKey === 'seeking-a-job') {
      fields.taxonomyId = val('taxonomyId');
      fields.experience = val('experience');
    } else if (categoryKey === 'items-for-sale' || categoryKey === 'items-for-rent') {
      fields.price = val('price');
      fields.currency = val('currency');
      if (has('taxonomyId')) fields.taxonomyId = val('taxonomyId');
    } else if (categoryKey === 'lost-found') {
      fields.lostOrFound = val('lostOrFound');
      if (has('taxonomyId')) fields.taxonomyId = val('taxonomyId');
    } else if (categoryKey === 'real-estate') {
      fields.taxonomyId = val('taxonomyId');
      fields.price = val('price');
      fields.currency = val('currency');
    } else {
      if (has('price')) { fields.price = val('price'); fields.currency = val('currency'); }
      if (has('taxonomyId')) fields.taxonomyId = val('taxonomyId');
    }
    return fields;
  }

  function simchaCategoryHtml() {
    const opts = (window.SITE_CONFIG.taxonomies || []).filter((t) => t.grp === 'simcha');
    return `<div class="form-row"><label>Simcha Category</label><select data-field="taxonomyId"><option value="">Select…</option>${opts.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>`;
  }

  function blockHtml(block) {
    const n = blocks.indexOf(block) + 1;
    return `
      <div class="bulk-block" data-uid="${block.uid}">
        <div class="bulk-block-head">
          <span class="bulk-block-num">Listing ${n}</span>
          <span class="bulk-status" data-role="status"></span>
          <button type="button" class="bulk-remove-btn" data-action="remove">Remove</button>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Type</label>
            <select data-field="type">
              <option value="classified">Classified</option>
              <option value="listing">Listing</option>
              <option value="simcha">Simcha</option>
            </select>
          </div>
          <div class="form-row" data-role="categoryRow"><label>Category</label>
            <select data-field="category"></select>
          </div>
        </div>
        <div class="form-row" data-role="titleRow"><label>Title</label><input type="text" data-field="title"></div>
        <div class="form-row"><label>Description</label><textarea data-field="description"></textarea></div>
        <div class="form-row" data-role="simchaCategory" style="display:none"></div>
        <div data-role="categoryFields"></div>
        <div class="form-row"><label>Location</label><input type="text" data-field="locationText" placeholder="City, State"></div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h3 style="margin:0 0 10px;font-size:.95rem">Contact Info (shown on the listing)</h3>
        <div class="form-cols">
          <div class="form-row"><label>Phone</label><div style="display:flex;gap:6px"><select data-field="contactPhoneCountry" style="width:90px"></select><input type="tel" data-field="contactPhone"></div></div>
          <div class="form-row"><label>Ext.</label><input type="text" data-field="contactPhoneExt"></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Email</label><input type="email" data-field="contactEmail"></div>
          <div class="form-row"><label>Website</label><input type="text" data-field="contactUrl"></div>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h3 style="margin:0 0 10px;font-size:.95rem">Poster Info</h3>
        <div class="form-cols">
          <div class="form-row"><label>First Name</label><input type="text" data-field="posterFirstName"></div>
          <div class="form-row"><label>Last Name</label><input type="text" data-field="posterLastName"></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Phone</label><div style="display:flex;gap:6px"><select data-field="posterPhoneCountry" style="width:90px"></select><input type="tel" data-field="posterPhone"></div></div>
          <div class="form-row"><label>Email <span class="hint">(required)</span></label><input type="email" data-field="posterEmail"></div>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <div class="form-cols">
          <div class="form-row"><label>Photos <span class="hint">(up to 6, optional)</span></label><input type="file" data-field="images" accept="image/png,image/jpeg,image/webp" multiple></div>
          <div class="form-row"><label>Duration (days)</label><input type="number" data-field="durationDays" value="30" min="1"></div>
        </div>
        <label class="addon-row"><input type="checkbox" data-field="wantsStrike"> Feature this listing (no charge from this tool)</label>
        <div class="error-list" data-role="blockError" style="display:none"></div>
      </div>`;
  }

  function applyCategoryOptions(blockEl, type) {
    const categorySelect = blockEl.querySelector('[data-field="category"]');
    const cats = currentCategories(type);
    categorySelect.innerHTML = cats.map((c) => `<option value="${c.key}">${escapeHtml(c.label)}${c.free ? ' (Free)' : ''}</option>`).join('');
  }

  function renderCategoryFields(blockEl, type) {
    const fieldsHost = blockEl.querySelector('[data-role="categoryFields"]');
    const categoryKey = blockEl.querySelector('[data-field="category"]')?.value;
    fieldsHost.innerHTML = categoryFieldsHtml(type, categoryKey);
  }

  function applyTypeChange(blockEl) {
    const type = blockEl.querySelector('[data-field="type"]').value;
    const categoryRow = blockEl.querySelector('[data-role="categoryRow"]');
    const titleRow = blockEl.querySelector('[data-role="titleRow"]');
    const simchaRow = blockEl.querySelector('[data-role="simchaCategory"]');
    if (type === 'simcha') {
      categoryRow.style.display = 'none';
      titleRow.querySelector('label').textContent = 'Title (optional - defaults to the simcha category name)';
      simchaRow.style.display = '';
      simchaRow.innerHTML = simchaCategoryHtml();
      blockEl.querySelector('[data-role="categoryFields"]').innerHTML = '';
    } else {
      categoryRow.style.display = '';
      titleRow.querySelector('label').textContent = type === 'listing' ? 'Business/Organization Name' : 'Title';
      simchaRow.style.display = 'none';
      simchaRow.innerHTML = '';
      applyCategoryOptions(blockEl, type);
      renderCategoryFields(blockEl, type);
    }
  }

  function addBlock() {
    const block = { uid: `b${uidCounter++}`, status: 'pending', error: null };
    blocks.push(block);
    document.getElementById('blocksContainer').insertAdjacentHTML('beforeend', blockHtml(block));
    const blockEl = document.querySelector(`.bulk-block[data-uid="${block.uid}"]`);
    wireBlock(blockEl, block);
    applyTypeChange(blockEl);
    populateCountrySelect(blockEl.querySelector('[data-field="contactPhoneCountry"]'));
    populateCountrySelect(blockEl.querySelector('[data-field="posterPhoneCountry"]'));
    updateSummary();
  }

  function wireBlock(blockEl, block) {
    blockEl.querySelector('[data-field="type"]').addEventListener('change', () => applyTypeChange(blockEl));
    blockEl.querySelector('[data-action="remove"]').addEventListener('click', () => {
      blocks = blocks.filter((b) => b.uid !== block.uid);
      blockEl.remove();
      renumber();
      updateSummary();
    });
    // Delegated so it also covers the category select re-rendered on type change.
    blockEl.addEventListener('change', (e) => {
      if (e.target.matches('[data-field="category"]')) {
        const type = blockEl.querySelector('[data-field="type"]').value;
        renderCategoryFields(blockEl, type);
      }
    });
  }

  function renumber() {
    document.querySelectorAll('.bulk-block').forEach((el, i) => {
      el.querySelector('.bulk-block-num').textContent = `Listing ${i + 1}`;
    });
  }

  function updateSummary() {
    const created = blocks.filter((b) => b.status === 'created').length;
    document.getElementById('bulkSummary').textContent = blocks.length
      ? `${blocks.length} listing${blocks.length === 1 ? '' : 's'}${created ? ` · ${created} created` : ''}`
      : '';
  }

  function setBlockStatus(blockEl, block, status, message) {
    block.status = status;
    blockEl.classList.toggle('created', status === 'created');
    blockEl.classList.toggle('errored', status === 'error');
    const statusEl = blockEl.querySelector('[data-role="status"]');
    statusEl.className = `bulk-status ${status === 'created' ? 'ok' : status === 'error' ? 'err' : ''}`;
    statusEl.textContent = status === 'created' ? 'Created ✓' : status === 'error' ? 'Failed' : status === 'creating' ? 'Creating…' : '';
    const errEl = blockEl.querySelector('[data-role="blockError"]');
    if (message) {
      errEl.style.display = '';
      errEl.textContent = message;
    } else {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
  }

  function buildFormData(blockEl, type) {
    const val = (name) => blockEl.querySelector(`[data-field="${name}"]`)?.value ?? '';
    const checked = (name) => !!blockEl.querySelector(`[data-field="${name}"]`)?.checked;
    const categoryKey = type === 'simcha' ? null : val('category');
    const fieldsHost = blockEl.querySelector('[data-role="categoryFields"]');
    const fields = type === 'simcha' ? {} : readCategoryFields(fieldsHost, type, categoryKey);
    if (type === 'simcha') {
      const simchaTaxSelect = blockEl.querySelector('[data-role="simchaCategory"] [data-field="taxonomyId"]');
      fields.taxonomyId = simchaTaxSelect?.value || '';
    }

    const fd = new FormData();
    fd.set('type', type);
    if (type !== 'simcha') fd.set('category', categoryKey || '');
    fd.set('title', val('title'));
    fd.set('description', val('description'));
    fd.set('fields', JSON.stringify(fields));
    // Sent both nested in fields (what the post's own fields JSON stores)
    // and top-level (what insertPost reads for the posts.taxonomy_id
    // column) - the public wizard submits it the same redundant way.
    if (fields.taxonomyId) fd.set('taxonomyId', fields.taxonomyId);
    fd.set('locationText', val('locationText'));
    fd.set('contactPhone', val('contactPhone'));
    fd.set('contactPhoneExt', val('contactPhoneExt'));
    fd.set('contactEmail', val('contactEmail'));
    fd.set('contactUrl', val('contactUrl'));
    fd.set('posterFirstName', val('posterFirstName'));
    fd.set('posterLastName', val('posterLastName'));
    fd.set('posterPhone', val('posterPhone'));
    fd.set('posterEmail', val('posterEmail'));
    fd.set('durationDays', val('durationDays') || '30');
    if (checked('wantsStrike')) fd.set('wantsStrike', '1');
    const fileInput = blockEl.querySelector('[data-field="images"]');
    Array.from(fileInput?.files || []).slice(0, 6).forEach((f) => fd.append('images', f));
    return fd;
  }

  async function createOne(block) {
    const blockEl = document.querySelector(`.bulk-block[data-uid="${block.uid}"]`);
    const type = blockEl.querySelector('[data-field="type"]').value;
    setBlockStatus(blockEl, block, 'creating');
    try {
      const fd = buildFormData(blockEl, type);
      const res = await fetch('/api/bulk-post/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (res.status === 401) {
        clearTokens();
        showAuthGate('Your session expired - please re-enter the password.');
        throw new Error('__auth__');
      }
      const data = await res.json();
      if (!res.ok) {
        const msg = data.details ? `${data.error}: ${data.details.join(', ')}` : data.error || 'Failed to create this listing';
        setBlockStatus(blockEl, block, 'error', msg);
        return false;
      }
      setBlockStatus(blockEl, block, 'created');
      return true;
    } catch (e) {
      if (e.message !== '__auth__') setBlockStatus(blockEl, block, 'error', e.message || 'Network error');
      return false;
    }
  }

  async function createAll() {
    const pending = blocks.filter((b) => b.status !== 'created');
    if (!pending.length) { toast('Nothing to create - every listing is already marked Created.'); return; }
    const btn = document.getElementById('createAllBtn');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    let okCount = 0;
    for (const block of pending) {
      // Sequential, not parallel - so a flood of requests never looks like
      // abuse, and so results land in the same order the listings are in.
      const ok = await createOne(block);
      if (ok) okCount++;
      if (!getToken()) break; // auth gate just took over
    }
    btn.disabled = false;
    btn.textContent = 'Create All Listings';
    updateSummary();
    if (okCount) toast(`${okCount} listing${okCount === 1 ? '' : 's'} created`);
  }

  function showAuthGate(message) {
    document.getElementById('bulkTool').style.display = 'none';
    document.getElementById('authGate').style.display = '';
    if (message) {
      const el = document.getElementById('authError');
      el.style.display = '';
      el.textContent = message;
    }
    document.getElementById('bulkPassword').focus();
  }

  function showTool() {
    document.getElementById('authGate').style.display = 'none';
    document.getElementById('bulkTool').style.display = '';
    if (!blocks.length) addBlock();
  }

  async function init() {
    try {
      const res = await fetch('/api/config');
      window.SITE_CONFIG = await res.json();
    } catch (e) {
      window.SITE_CONFIG = {};
    }

    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('bulkPassword').value;
      const errEl = document.getElementById('authError');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/api/bulk-post/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.style.display = '';
          errEl.textContent = data.error || 'Incorrect password';
          return;
        }
        localStorage.setItem(BULK_TOKEN_KEY, data.token);
        showTool();
      } catch (e2) {
        errEl.style.display = '';
        errEl.textContent = 'Network error - please try again.';
      }
    });

    document.getElementById('addBlockBtn').addEventListener('click', addBlock);
    document.getElementById('createAllBtn').addEventListener('click', createAll);

    if (getToken()) showTool();
    else showAuthGate();
  }

  init();
})();
