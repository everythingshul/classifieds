// Admin -> Export. Every dataset in the admin as an Excel file, one at a time or
// all together as tabs of a single workbook, optionally for a date range.
async function renderExportPage() {
  const root = document.getElementById('adminContent');
  const { datasets } = await AdminApi.exportCatalog();
  root.innerHTML = `
    <h1>Export to Excel</h1>
    <p class="hint">Everything in the admin as .xlsx files that open in Excel, Numbers and Google Sheets. Hebrew text is kept. Passwords, API keys and admin accounts are never included.</p>
    <div class="admin-card">
      <div class="form-cols">
        <div class="form-row"><label>From (optional)</label><input type="date" id="exFrom"></div>
        <div class="form-row"><label>To (optional)</label><input type="date" id="exTo"></div>
      </div>
      <p class="hint">The date range applies to anything with a date (posts, payments, messages, visits and so on). Settings-style lists such as pricing and locations always export in full.</p>
      <button type="button" class="btn" data-export="all" data-range="1">Download everything (one workbook, one tab per list)</button>
    </div>
    <div class="admin-card">
      <h3 style="margin-top:0">Or one list at a time</h3>
      <table class="admin-table"><thead><tr><th>List</th><th>Rows</th><th></th></tr></thead><tbody>
        ${datasets.map((d) => `<tr><td>${escapeHtml(d.label)}</td><td>${d.count.toLocaleString()}</td><td><button type="button" class="btn btn-sm btn-outline" data-export="${d.kind}" data-range="1">Download</button></td></tr>`).join('')}
      </tbody></table>
    </div>`;
}

// One handler for every Export button in the admin (page headers and this page).
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-export]');
  if (!b) return;
  e.preventDefault();
  const params = {};
  if (b.dataset.range) {
    const f = document.getElementById('exFrom'); const t = document.getElementById('exTo');
    if (f && f.value) params.from = f.value;
    if (t && t.value) params.to = t.value;
  }
  const label = b.textContent;
  b.disabled = true; b.textContent = 'Preparing...';
  try { await AdminApi.exportXlsx(b.dataset.export, params); } catch (err) { toast(err.message); }
  b.disabled = false; b.textContent = label;
});
