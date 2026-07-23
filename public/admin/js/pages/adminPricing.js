const CLASSIFIED_KEYS = ['job-offers', 'seeking-a-job', 'items-for-sale', 'items-for-rent', 'free-giveaways', 'lost-found', 'wanted', 'services', 'real-estate'];

async function renderPricingPage() {
  const [tiers, addons] = await Promise.all([AdminApi.tiers(), AdminApi.addons()]);
  const root = document.getElementById('adminContent');

  root.innerHTML = `
    <h1>Pricing</h1>

    <div class="admin-card">
      <h3 style="margin-top:0">Listing Duration Tiers</h3>
      <table class="admin-table">
        <thead><tr><th>Category</th><th>Name</th><th>Days</th><th>Price</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${tiers.map((t) => `
            <tr data-id="${t.id}">
              <td>${t.category || 'All categories'}</td>
              <td><input class="tier-name" value="${escapeHtml(t.name)}" style="width:130px"></td>
              <td><input class="tier-days" type="number" value="${t.duration_days}" style="width:70px"></td>
              <td><input class="tier-price" type="number" step="0.01" value="${(t.price_cents / 100).toFixed(2)}" style="width:90px"></td>
              <td><input class="tier-active" type="checkbox" ${t.active ? 'checked' : ''}></td>
              <td><button class="btn btn-sm save-tier">Save</button> <button class="btn btn-sm btn-danger del-tier">Delete</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <form id="addTierForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:16px">
        <div class="field"><label>Category</label><select name="category"><option value="">All categories</option>${CLASSIFIED_KEYS.map((k) => `<option value="${k}">${k}</option>`).join('')}<option value="simcha">simcha</option></select></div>
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
  `;

  root.querySelectorAll('tr[data-id]').forEach((row) => {
    row.querySelector('.save-tier').addEventListener('click', async () => {
      await AdminApi.updateTier(row.dataset.id, {
        name: row.querySelector('.tier-name').value,
        durationDays: Number(row.querySelector('.tier-days').value),
        priceCents: Math.round(Number(row.querySelector('.tier-price').value) * 100),
        active: row.querySelector('.tier-active').checked,
      });
      toast('Saved');
    });
    row.querySelector('.del-tier').addEventListener('click', async () => {
      if (!confirm('Deactivate this tier?')) return;
      await AdminApi.deleteTier(row.dataset.id);
      renderPricingPage();
    });
  });

  root.querySelectorAll('tr[data-key]').forEach((row) => {
    row.querySelector('.save-addon').addEventListener('click', async () => {
      await AdminApi.updateAddon(row.dataset.key, { priceCents: Math.round(Number(row.querySelector('.addon-price').value) * 100) });
      toast('Saved');
    });
  });

  document.getElementById('addTierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await AdminApi.createTier({
      category: fd.get('category') || null,
      name: fd.get('name'),
      durationDays: Number(fd.get('durationDays')),
      priceCents: Math.round(Number(fd.get('price')) * 100),
    });
    renderPricingPage();
  });
}
