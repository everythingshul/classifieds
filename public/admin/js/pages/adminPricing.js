async function renderPricingPage() {
  const [tiers, addons, promoCodes, cfg] = await Promise.all([
    AdminApi.tiers(), AdminApi.addons(), AdminApi.promoCodes(), fetch('/api/config').then((r) => r.json()),
  ]);
  const root = document.getElementById('adminContent');
  const categoryKeys = cfg.categories.map((c) => c.key);
  const listingCategoryKeys = (cfg.listingCategories || []).map((c) => c.key);
  const classifiedTiers = tiers.filter((t) => (t.post_type || 'classified') === 'classified');
  const listingTiers = tiers.filter((t) => t.post_type === 'listing');

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
        <div class="field"><label>Category</label><select name="category"><option value="">All categories</option>${categoryKeys.map((k) => `<option value="${k}">${k}</option>`).join('')}<option value="simcha">simcha</option></select></div>
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
      <h3 style="margin-top:0">Add-ons</h3>
      <table class="admin-table">
        <thead><tr><th>Add-on</th><th>Price</th><th></th></tr></thead>
        <tbody>
          ${addons.map((a) => `
            <tr data-key="${a.key}">
              <td>${a.config.label || a.key}</td>
              <td><input class="addon-price" type="number" step="0.01" value="${(a.price_cents / 100).toFixed(2)}" style="width:90px"></td>
              <td><button class="btn btn-sm save-addon">Save</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Promo Codes</h3>
      <table class="admin-table">
        <thead><tr><th>Code</th><th>Discount</th><th>Uses</th><th>Expires</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${promoCodes.map((p) => `
            <tr data-id="${p.id}">
              <td><b>${escapeHtml(p.code)}</b></td>
              <td>${p.percent_off ? p.percent_off + '% off' : formatCents(p.amount_off_cents) + ' off'}</td>
              <td>${p.used_count}${p.max_uses ? ' / ' + p.max_uses : ''}</td>
              <td>${p.expires_at ? formatDate(p.expires_at) : '—'}</td>
              <td>${p.active ? 'Yes' : 'No'}</td>
              <td><button class="btn btn-sm toggle-promo">${p.active ? 'Deactivate' : 'Activate'}</button> <button class="btn btn-sm btn-danger del-promo">Delete</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <form id="addPromoForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:16px">
        <div class="field"><label>Code</label><input name="code" required style="text-transform:uppercase"></div>
        <div class="field"><label>% off</label><input name="percentOff" type="number" min="1" max="100" placeholder="e.g. 20"></div>
        <div class="field"><label>or $ off</label><input name="amountOff" type="number" step="0.01" placeholder="e.g. 5.00"></div>
        <div class="field"><label>Max uses <span class="hint">(optional)</span></label><input name="maxUses" type="number" min="1"></div>
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
  });

  root.querySelectorAll('tr[data-key]').forEach((row) => {
    row.querySelector('.save-addon').addEventListener('click', async () => {
      await AdminApi.updateAddon(row.dataset.key, { priceCents: Math.round(Number(row.querySelector('.addon-price').value) * 100) });
      toast('Saved');
    });
  });

  ['addTierForm', 'addListingTierForm'].forEach((formId) => {
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
      });
      renderPricingPage();
    } catch (err) {
      toast(err.message);
    }
  });
}
