// Hidden listing-category management tool. Not part of the main SPA (no
// router/i18n) - a small standalone page sharing only utils.js (escapeHtml/
// toast) and main.css for a consistent look. Mirrors public/js/bulkPost.js's
// auth pattern exactly, but with its own token/password - this tool and the
// bulk-add tool are independent credentials, neither works for the other.
(() => {
  const CAT_TOKEN_KEY = 'esc_catmgr_token';
  const ADMIN_TOKEN_KEY = 'esc_admin_token';

  function getToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(CAT_TOKEN_KEY);
  }
  function clearTokens() {
    localStorage.removeItem(CAT_TOKEN_KEY);
    // Never clear the admin token here - a stale/expired tool session
    // shouldn't be able to log an admin out of the admin portal too.
  }

  let listings = [];
  let categories = [];

  async function api(path, opts = {}) {
    const res = await fetch(`/api/category-manage${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      clearTokens();
      showAuthGate('Your session expired - please re-enter the password.');
      throw new Error('__auth__');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function renderBulkCategorySelect() {
    const select = document.getElementById('bulkCategorySelect');
    select.innerHTML = categories.map((c) => `<option value="${c.key}">${escapeHtml(c.label)}${c.active ? '' : ' (inactive)'}</option>`).join('')
      || '<option value="">No categories yet - add one above</option>';
  }

  function renderListingsTable() {
    const body = document.getElementById('listingsBody');
    body.innerHTML = listings.length
      ? listings.map((l) => `
        <tr data-id="${l.id}">
          <td><input type="checkbox" class="catmgr-row-select" data-id="${l.id}"></td>
          <td>${escapeHtml(l.title || '(untitled)')}</td>
          <td>${escapeHtml(l.categoryLabel || l.category || '—')}</td>
          <td>${escapeHtml(l.status)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="4" class="hint">No business listings yet.</td></tr>';
    document.getElementById('catSummary').textContent = `${listings.length} listing${listings.length === 1 ? '' : 's'}`;
  }

  async function loadAll() {
    [listings, categories] = await Promise.all([api('/listings'), api('/categories')]);
    renderBulkCategorySelect();
    renderListingsTable();
  }

  function showAuthGate(message) {
    document.getElementById('catTool').style.display = 'none';
    document.getElementById('authGate').style.display = '';
    if (message) {
      const el = document.getElementById('authError');
      el.style.display = '';
      el.textContent = message;
    }
    document.getElementById('catPassword').focus();
  }

  async function showTool() {
    document.getElementById('authGate').style.display = 'none';
    document.getElementById('catTool').style.display = '';
    try {
      await loadAll();
    } catch (e) {
      if (e.message !== '__auth__') toast(e.message);
    }
  }

  function init() {
    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('catPassword').value;
      const errEl = document.getElementById('authError');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/api/category-manage/auth', {
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
        localStorage.setItem(CAT_TOKEN_KEY, data.token);
        showTool();
      } catch (e2) {
        errEl.style.display = '';
        errEl.textContent = 'Network error - please try again.';
      }
    });

    document.getElementById('addCatForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/categories', {
          method: 'POST',
          body: JSON.stringify({
            label: document.getElementById('newCatLabel').value.trim(),
            labelHe: document.getElementById('newCatLabelHe').value.trim() || null,
            hasPrice: document.getElementById('newCatHasPrice').checked,
            hasImages: document.getElementById('newCatHasImages').checked,
            free: document.getElementById('newCatFree').checked,
          }),
        });
        e.target.reset();
        toast('Category added');
        await loadAll();
      } catch (e2) {
        if (e2.message !== '__auth__') toast(e2.message);
      }
    });

    document.getElementById('selectAllBox').addEventListener('change', (e) => {
      document.querySelectorAll('.catmgr-row-select').forEach((box) => { box.checked = e.target.checked; });
    });

    document.getElementById('applyBulkBtn').addEventListener('click', async () => {
      const category = document.getElementById('bulkCategorySelect').value;
      const postIds = Array.from(document.querySelectorAll('.catmgr-row-select:checked')).map((box) => Number(box.dataset.id));
      if (!category) return toast('Add a category first');
      if (!postIds.length) return toast('Select at least one listing');
      try {
        const result = await api('/listings/category', { method: 'PUT', body: JSON.stringify({ postIds, category }) });
        toast(`Updated ${result.updated} listing${result.updated === 1 ? '' : 's'}`);
        document.getElementById('selectAllBox').checked = false;
        await loadAll();
      } catch (e) {
        if (e.message !== '__auth__') toast(e.message);
      }
    });

    if (getToken()) showTool();
    else showAuthGate();
  }

  init();
})();
