const PROMO_SECTION_LABELS = { classified: 'Classifieds', listing: 'Listings', simcha: 'Simchas' };
const PROMO_FEATURE_LABELS = { listing: 'Base Listing', strike: 'Featured/Striking', oversized: 'Oversized' };
let editingPromoId = null;

function parseJsonArray(json) {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch (e) {
    return null;
  }
}

function labelList(keys, labels) {
  return keys.map((k) => labels[k] || k).join(', ');
}

function promoRowHtml(p) {
  const sections = parseJsonArray(p.applies_to);
  const included = parseJsonArray(p.included_features);
  const excluded = parseJsonArray(p.excluded_features);
  const featureParts = [];
  featureParts.push(included ? `Only: ${labelList(included, PROMO_FEATURE_LABELS)}` : 'All features');
  if (excluded) featureParts.push(`Excl: ${labelList(excluded, PROMO_FEATURE_LABELS)}`);
  const featuresText = featureParts.join('; ');
  return `
    <tr data-id="${p.id}">
      <td><b>${escapeHtml(p.code)}</b></td>
      <td>${p.percent_off ? p.percent_off + '% off' : formatCents(p.amount_off_cents) + ' off'}</td>
      <td>${escapeHtml(sections ? labelList(sections, PROMO_SECTION_LABELS) : 'All sections')}</td>
      <td>${escapeHtml(featuresText)}</td>
      <td>${p.used_count}${p.max_uses ? ' / ' + p.max_uses : ''}</td>
      <td>${p.expires_at ? formatDate(p.expires_at) : '—'}</td>
      <td>${p.active ? 'Yes' : 'No'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm edit-promo">Edit</button>
        <button class="btn btn-sm toggle-promo">${p.active ? 'Deactivate' : 'Activate'}</button>
        <button class="btn btn-sm btn-danger del-promo">Delete</button>
      </td>
    </tr>`;
}

function editPromoRowHtml(p) {
  const sections = parseJsonArray(p.applies_to) || [];
  const included = parseJsonArray(p.included_features) || [];
  const excluded = parseJsonArray(p.excluded_features) || [];
  return `
    <tr data-id="${p.id}">
      <td colspan="8">
        <form class="edit-promo-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;padding:8px 0">
          <div class="field"><label>Code</label><input name="code" value="${escapeHtml(p.code)}" required style="text-transform:uppercase;width:110px"></div>
          <div class="field"><label>% off</label><input name="percentOff" type="number" min="1" max="100" value="${p.percent_off || ''}" style="width:70px"></div>
          <div class="field"><label>or $ off</label><input name="amountOff" type="number" step="0.01" value="${p.amount_off_cents ? (p.amount_off_cents / 100).toFixed(2) : ''}" style="width:80px"></div>
          <div class="field"><label>Max uses</label><input name="maxUses" type="number" min="1" value="${p.max_uses || ''}" style="width:70px"></div>
          <div class="field"><label>Expires</label><input name="expiresAt" type="date" value="${p.expires_at ? toDateInputValue(p.expires_at) : ''}" style="width:130px"></div>
          <div class="field"><label>Active</label><select name="active" style="height:34px"><option value="1" ${p.active ? 'selected' : ''}>Yes</option><option value="0" ${!p.active ? 'selected' : ''}>No</option></select></div>
          <div class="field">
            <label>Applies to</label>
            <div style="display:flex;gap:6px;align-items:center;height:34px">${Object.entries(PROMO_SECTION_LABELS).map(([k, label]) => `<label style="font-weight:400;display:flex;align-items:center;gap:3px"><input type="checkbox" name="appliesTo" value="${k}" ${!sections.length || sections.includes(k) ? 'checked' : ''}>${escapeHtml(label)}</label>`).join('')}</div>
          </div>
          <div class="field">
            <label>Include only</label>
            <div style="display:flex;gap:6px;align-items:center;height:34px">${Object.entries(PROMO_FEATURE_LABELS).map(([k, label]) => `<label style="font-weight:400;display:flex;align-items:center;gap:3px"><input type="checkbox" name="includedFeatures" value="${k}" ${included.includes(k) ? 'checked' : ''}>${escapeHtml(label)}</label>`).join('')}</div>
          </div>
          <div class="field">
            <label>Exclude</label>
            <div style="display:flex;gap:6px;align-items:center;height:34px">${Object.entries(PROMO_FEATURE_LABELS).map(([k, label]) => `<label style="font-weight:400;display:flex;align-items:center;gap:3px"><input type="checkbox" name="excludedFeatures" value="${k}" ${excluded.includes(k) ? 'checked' : ''}>${escapeHtml(label)}</label>`).join('')}</div>
          </div>
          <button class="btn btn-sm" type="submit">Save</button>
          <button class="btn btn-sm btn-outline cancel-edit-promo" type="button">Cancel</button>
        </form>
      </td>
    </tr>`;
}

async function renderPricingPage() {
  const [tiers, addons, promoCodes, cfg] = await Promise.all([
    AdminApi.tiers(), AdminApi.addons(), AdminApi.promoCodes(), fetch('/api/config').then((r) => r.json()),
  ]);
  const root = document.getElementById('adminContent');
  const categoryKeys = cfg.categories.map((c) => c.key);
  const listingCategoryKeys = (cfg.listingCategories || []).map((c) => c.key);
  const classifiedTiers = tiers.filter((t) => (t.post_type || 'classified') === 'classified');
  const listingTiers = tiers.filter((t) => t.post_type === 'listing');
  const simchaTiers = tiers.filter((t) => t.post_type === 'simcha');

  function tierTableRows(list) {
    return list.map((t) => `
      <tr data-id="${t.id}">
        <td>${t.category || 'All categories'}</td>
        <td><input class="tier-name" value="${escapeHtml(t.name)}" style="width:130px"></td>
        <td><input class="tier-days" type="number" value="${t.duration_days}" style="width:70px"></td>
        <td><input class="tier-price" type="number" step="0.01" value="${(t.price_cents / 100).toFixed(2)}" style="width:90px"></td>
        <td><input class="tier-active" type="checkbox" ${t.active ? 'checked' : ''}></td>
        <td><button class="btn btn-sm save-tier">Save</button> <button class="btn btn-sm btn-danger del-tier">Delete</button></td>
      </tr>
    `).join('');
  }

  root.innerHTML = `
    <h1>Pricing</h1>

    <div class="admin-card">
      <h3 style="margin-top:0">Classifieds Duration Tiers</h3>
      <table class="admin-table">
        <thead><tr><th>Category</th><th>Name</th><th>Days</th><th>Price</th><th>Active</th><th></th></tr></thead>
        <tbody>${tierTableRows(classifiedTiers)}</tbody>
      </table>
      <form id="addTierForm" data-post-type="classified" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:16px">
        <div class="field"><label>Category</label><select name="category"><option value="">All categories</option>${categoryKeys.map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
        <div class="field"><label>Name</label><input name="name" required></div>
        <div class="field"><label>Days</label><input name="durationDays" type="number" required></div>
        <div class="field"><label>Price ($)</label><input name="price" type="number" step="0.01" required></div>
        <button class="btn btn-sm" type="submit">Add Tier</button>
      </form>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Listing Duration Tiers <span class="hint">(separate pricing/rules from Classifieds)</span></h3>
      <table class="admin-table">
        <thead><tr><th>Category</th><th>Name</th><th>Days</th><th>Price</th><th>Active</th><th></th></tr></thead>
        <tbody>${tierTableRows(listingTiers)}</tbody>
      </table>
      <form id="addListingTierForm" data-post-type="listing" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:16px">
        <div class="field"><label>Category</label><select name="category"><option value="">All categories</option>${listingCategoryKeys.map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
        <div class="field"><label>Name</label><input name="name" required></div>
        <div class="field"><label>Days</label><input name="durationDays" type="number" required></div>
        <div class="field"><label>Price ($)</label><input name="price" type="number" step="0.01" required></div>
        <button class="btn btn-sm" type="submit">Add Tier</button>
      </form>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Simcha Pricing <span class="hint">(separate from Classifieds/Listings)</span></h3>
      <table class="admin-table">
        <thead><tr><th>Category</th><th>Name</th><th>Days</th><th>Price</th><th>Active</th><th></th></tr></thead>
        <tbody>${tierTableRows(simchaTiers)}</tbody>
      </table>
      <form id="addSimchaTierForm" data-post-type="simcha" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:16px">
        <div class="field"><label>Name</label><input name="name" required></div>
        <div class="field"><label>Days</label><input name="durationDays" type="number" required></div>
        <div class="field"><label>Price ($)</label><input name="price" type="number" step="0.01" required></div>
        <button class="btn btn-sm" type="submit">Add Tier</button>
      </form>
    </div>

    ${(() => {
      // Striking/oversized/boost pricing is separate per post type -
      // simchas don't offer any of these add-ons at all.
      function addonTable(prefix, label) {
        const rows = addons.filter((a) => a.key.startsWith(`${prefix}_`));
        return `
          <div class="admin-card">
            <h3 style="margin-top:0">${label} Add-ons</h3>
            <table class="admin-table">
              <thead><tr><th>Add-on</th><th>Price</th><th></th></tr></thead>
              <tbody>
                ${rows.map((a) => `
                  <tr data-key="${a.key}">
                    <td>${escapeHtml(a.config.label || a.key)}</td>
                    <td><input class="addon-price" type="number" step="0.01" value="${(a.price_cents / 100).toFixed(2)}" style="width:90px"></td>
                    <td><button class="btn btn-sm save-addon">Save</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`;
      }
      return addonTable('classified', 'Classifieds') + addonTable('listing', 'Listings');
    })()}

    <div class="admin-card">
      <h3 style="margin-top:0">Promo Codes</h3>
      <table class="admin-table">
        <thead><tr><th>Code</th><th>Discount</th><th>Applies To</th><th>Features</th><th>Uses</th><th>Expires</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${promoCodes.map((p) => (editingPromoId === p.id ? editPromoRowHtml(p) : promoRowHtml(p))).join('')}
        </tbody>
      </table>
      <form id="addPromoForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:16px">
        <div class="field"><label>Code</label><input name="code" required style="text-transform:uppercase"></div>
        <div class="field"><label>% off</label><input name="percentOff" type="number" min="1" max="100" placeholder="e.g. 20"></div>
        <div class="field"><label>or $ off</label><input name="amountOff" type="number" step="0.01" placeholder="e.g. 5.00"></div>
        <div class="field"><label>Max uses <span class="hint">(optional)</span></label><input name="maxUses" type="number" min="1"></div>
        <div class="field">
          <label>Applies to <span class="hint">(default: all)</span></label>
          <div style="display:flex;gap:8px;align-items:center;height:34px">
            <label style="font-weight:400;display:flex;align-items:center;gap:3px"><input type="checkbox" name="appliesTo" value="classified" checked>Classifieds</label>
            <label style="font-weight:400;display:flex;align-items:center;gap:3px"><input type="checkbox" name="appliesTo" value="listing" checked>Listings</label>
            <label style="font-weight:400;display:flex;align-items:center;gap:3px"><input type="checkbox" name="appliesTo" value="simcha" checked>Simchas</label>
          </div>
        </div>
        <div class="field">
          <label>Include only features <span class="hint">(optional, default: all)</span></label>
          <div style="display:flex;gap:8px;align-items:center;height:34px">
            ${Object.entries(PROMO_FEATURE_LABELS).map(([k, label]) => `<label style="font-weight:400;display:flex;align-items:center;gap:3px"><input type="checkbox" name="includedFeatures" value="${k}">${escapeHtml(label)}</label>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Exclude features <span class="hint">(optional)</span></label>
          <div style="display:flex;gap:8px;align-items:center;height:34px">
            ${Object.entries(PROMO_FEATURE_LABELS).map(([k, label]) => `<label style="font-weight:400;display:flex;align-items:center;gap:3px"><input type="checkbox" name="excludedFeatures" value="${k}">${escapeHtml(label)}</label>`).join('')}
          </div>
        </div>
        <button class="btn btn-sm" type="submit">Add Code</button>
      </form>
    </div>
  `;

  root.querySelectorAll('tr[data-id]').forEach((row) => {
    const saveTier = row.querySelector('.save-tier');
    if (saveTier) saveTier.addEventListener('click', async () => {
      await AdminApi.updateTier(row.dataset.id, {
        name: row.querySelector('.tier-name').value,
        durationDays: Number(row.querySelector('.tier-days').value),
        priceCents: Math.round(Number(row.querySelector('.tier-price').value) * 100),
        active: row.querySelector('.tier-active').checked,
      });
      toast('Saved');
    });
    const delTier = row.querySelector('.del-tier');
    if (delTier) delTier.addEventListener('click', async () => {
      if (!confirm('Deactivate this tier?')) return;
      await AdminApi.deleteTier(row.dataset.id);
      renderPricingPage();
    });
    const togglePromo = row.querySelector('.toggle-promo');
    if (togglePromo) togglePromo.addEventListener('click', async () => {
      const p = promoCodes.find((x) => String(x.id) === row.dataset.id);
      await AdminApi.updatePromoCode(row.dataset.id, { active: !p.active });
      renderPricingPage();
    });
    const delPromo = row.querySelector('.del-promo');
    if (delPromo) delPromo.addEventListener('click', async () => {
      if (!confirm('Delete this promo code?')) return;
      await AdminApi.deletePromoCode(row.dataset.id);
      renderPricingPage();
    });
    const editPromo = row.querySelector('.edit-promo');
    if (editPromo) editPromo.addEventListener('click', () => {
      editingPromoId = Number(row.dataset.id);
      renderPricingPage();
    });
    const cancelEditPromo = row.querySelector('.cancel-edit-promo');
    if (cancelEditPromo) cancelEditPromo.addEventListener('click', () => {
      editingPromoId = null;
      renderPricingPage();
    });
    const editPromoForm = row.querySelector('.edit-promo-form');
    if (editPromoForm) editPromoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await AdminApi.updatePromoCode(row.dataset.id, {
          code: fd.get('code'),
          percentOff: fd.get('percentOff') || null,
          amountOffCents: fd.get('amountOff') ? Math.round(Number(fd.get('amountOff')) * 100) : null,
          maxUses: fd.get('maxUses') || null,
          expiresAt: fd.get('expiresAt') ? new Date(`${fd.get('expiresAt')}T23:59:59Z`).getTime() : null,
          active: fd.get('active') === '1',
          appliesTo: fd.getAll('appliesTo'),
          includedFeatures: fd.getAll('includedFeatures'),
          excludedFeatures: fd.getAll('excludedFeatures'),
        });
        editingPromoId = null;
        renderPricingPage();
      } catch (err) {
        toast(err.message);
      }
    });
  });

  root.querySelectorAll('tr[data-key]').forEach((row) => {
    row.querySelector('.save-addon').addEventListener('click', async () => {
      await AdminApi.updateAddon(row.dataset.key, { priceCents: Math.round(Number(row.querySelector('.addon-price').value) * 100) });
      toast('Saved');
    });
  });

  ['addTierForm', 'addListingTierForm', 'addSimchaTierForm'].forEach((formId) => {
    document.getElementById(formId).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await AdminApi.createTier({
        category: fd.get('category') || null,
        postType: e.target.dataset.postType,
        name: fd.get('name'),
        durationDays: Number(fd.get('durationDays')),
        priceCents: Math.round(Number(fd.get('price')) * 100),
      });
      renderPricingPage();
    });
  });

  document.getElementById('addPromoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await AdminApi.createPromoCode({
        code: fd.get('code'),
        percentOff: fd.get('percentOff') || null,
        amountOffCents: fd.get('amountOff') ? Math.round(Number(fd.get('amountOff')) * 100) : null,
        maxUses: fd.get('maxUses') || null,
        appliesTo: fd.getAll('appliesTo'),
        includedFeatures: fd.getAll('includedFeatures'),
        excludedFeatures: fd.getAll('excludedFeatures'),
      });
      renderPricingPage();
    } catch (err) {
      toast(err.message);
    }
  });
}
