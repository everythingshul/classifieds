async function renderPostsPage(query) {
  const root = document.getElementById('adminContent');
  const page = parseInt(query.page, 10) || 1;
  const filters = { status: query.status || '', type: query.type || '', category: query.category || '', q: query.q || '' };

  const data = await AdminApi.posts({ ...filters, page, pageSize: 25 });

  root.innerHTML = `
    <h1>All Posts (${data.total})</h1>
    <form class="filters-bar" id="filterForm">
      <div class="field"><label>Search</label><input type="text" name="q" value="${escapeHtml(filters.q)}" placeholder="title, email, phone, name…"></div>
      <div class="field"><label>Status</label>
        <select name="status"><option value="">Any</option>${['pending_payment', 'pending_approval', 'live', 'rejected', 'expired', 'removed'].map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Type</label><select name="type"><option value="">Any</option><option value="classified" ${filters.type === 'classified' ? 'selected' : ''}>Classified</option><option value="listing" ${filters.type === 'listing' ? 'selected' : ''}>Listing</option><option value="simcha" ${filters.type === 'simcha' ? 'selected' : ''}>Simcha</option></select></div>
      <button class="btn btn-sm" type="submit">Filter</button>
    </form>

    <table class="admin-table">
      <thead><tr><th>Title</th><th>Type</th><th>Category</th><th>Status</th><th>Views</th><th>Clicks</th><th>Expires</th><th></th></tr></thead>
      <tbody>
        ${data.posts.map((p) => `
          <tr>
            <td>${escapeHtml(p.title)}<br><span class="hint">${escapeHtml(p.poster.email)}</span></td>
            <td>${p.type}</td>
            <td>${escapeHtml(p.categoryLabel)}</td>
            <td><span class="status-pill status-${p.status}">${p.status}</span></td>
            <td>${p.viewCount}</td>
            <td>${p.clickCount}</td>
            <td>${p.expiresAt ? formatDate(p.expiresAt) : (p.savedForever ? 'Never' : '—')}</td>
            <td><button class="btn btn-sm edit-btn" data-id="${p.id}">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="pagination">
      ${Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => `<a href="#/posts?${new URLSearchParams({ ...filters, page: p })}" class="${p === data.page ? 'active' : ''}">${p}</a>`).join('')}
    </div>
    <div id="editorPanel"></div>
  `;

  document.getElementById('filterForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    window.location.hash = `#/posts?${new URLSearchParams(next)}`;
  });
  root.querySelectorAll('.edit-btn').forEach((btn) => btn.addEventListener('click', () => openEditor(btn.dataset.id)));

  if (query.q) {
    const exact = data.posts.find((p) => p.publicId === query.q);
    if (exact) openEditor(exact.id);
  }
}

// Category-specific fields (price, job type, pay amount, etc.) aren't plain
// post columns - they live in the fields JSON blob and vary by category, so
// the editor builds the same inputs the posting wizard/admin create-post
// screen use, pre-filled with the post's current values.
function fieldsEditorHtml(p, cfg) {
  if (p.type === 'simcha') return '';
  const f = p.fields || {};
  const currencies = cfg.currencies || [{ code: 'USD' }];
  const currencyOptions = (selected) => currencies.map((c) => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${escapeHtml(c.code)}</option>`).join('');
  const priceValue = f.price !== undefined && f.price !== null ? f.price : (f.priceText || '');
  const priceFieldHtml = () => `<div class="form-row"><label>Price <span class="hint">(amount, text, or blank)</span></label><div style="display:flex;gap:6px"><input type="text" name="f_price" value="${escapeHtml(String(priceValue))}" style="flex:1"><select name="f_currency" style="width:90px">${currencyOptions(f.currency)}</select></div></div>`;

  const catList = p.type === 'listing' ? cfg.listingCategories : cfg.categories;
  const catDef = catList.find((c) => c.key === p.category);

  if (p.type === 'classified' && p.category === 'job-offers') {
    const jobTax = cfg.taxonomies.filter((t) => t.grp === 'job');
    const payValue = f.payAmount !== undefined && f.payAmount !== null ? f.payAmount : (f.payAmountText || '');
    return `
      <h4 style="margin-bottom:6px">Category Details</h4>
      <div class="form-cols">
        <div class="form-row"><label>Job Type</label><select name="f_jobType">${(cfg.jobTypes || []).map((t) => `<option value="${t}" ${t === f.jobType ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="form-row"><label>Job Category</label><select name="f_taxonomyId"><option value="">—</option>${jobTax.map((t) => `<option value="${t.id}" ${String(t.id) === String(p.taxonomyId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Pay Amount <span class="hint">(amount, text, or blank)</span></label><div style="display:flex;gap:6px"><input type="text" name="f_payAmount" value="${escapeHtml(String(payValue))}" style="flex:1"><select name="f_payCurrency" style="width:90px">${currencyOptions(f.payCurrency)}</select></div></div>
        <div class="form-row"><label>Per</label><select name="f_payPeriod">${(cfg.payPeriods || []).map((per) => `<option value="${per}" ${per === f.payPeriod ? 'selected' : ''}>${per}</option>`).join('')}</select></div>
      </div>`;
  }
  if (p.type === 'classified' && p.category === 'seeking-a-job') {
    const jobTax = cfg.taxonomies.filter((t) => t.grp === 'job');
    return `
      <h4 style="margin-bottom:6px">Category Details</h4>
      <div class="form-row"><label>Job Category</label><select name="f_taxonomyId"><option value="">—</option>${jobTax.map((t) => `<option value="${t.id}" ${String(t.id) === String(p.taxonomyId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select></div>
      <div class="form-row"><label>Experience</label><textarea name="f_experience" rows="2">${escapeHtml(f.experience || '')}</textarea></div>`;
  }
  if (p.type === 'classified' && p.category === 'lost-found') {
    return `
      <h4 style="margin-bottom:6px">Category Details</h4>
      <div class="form-row"><label>Lost or Found</label><select name="f_lostOrFound"><option value="lost" ${f.lostOrFound === 'lost' ? 'selected' : ''}>Lost</option><option value="found" ${f.lostOrFound === 'found' ? 'selected' : ''}>Found</option></select></div>`;
  }
  if (p.type === 'classified' && p.category === 'real-estate') {
    const reTax = cfg.taxonomies.filter((t) => t.grp === 'real_estate');
    return `
      <h4 style="margin-bottom:6px">Category Details</h4>
      <div class="form-row"><label>Real Estate Category</label><select name="f_taxonomyId"><option value="">—</option>${reTax.map((t) => `<option value="${t.id}" ${String(t.id) === String(p.taxonomyId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select></div>
      ${priceFieldHtml()}`;
  }
  if (catDef?.hasPrice) return `<h4 style="margin-bottom:6px">${p.type === 'listing' ? 'Listing' : 'Category'} Details</h4>${priceFieldHtml()}`;
  return '';
}

async function openEditor(id) {
  const [p, cfg] = await Promise.all([AdminApi.post(id), fetch('/api/config').then((r) => r.json())]);
  const panel = document.getElementById('editorPanel');
  panel.innerHTML = `
    <div class="admin-card">
      <h3 style="margin-top:0">Edit: ${escapeHtml(p.title)} <span class="status-pill status-${p.status}">${p.status}</span></h3>
      <p class="hint">${p.viewCount} views · ${p.clickCount} clicks</p>
      <form id="editForm">
        <div class="form-cols">
          <div class="form-row"><label>Title</label><input name="title" value="${escapeHtml(p.title)}"></div>
          <div class="form-row"><label>Status</label>
            <select name="status">${['pending_payment', 'pending_approval', 'live', 'rejected', 'expired', 'removed'].map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-row"><label>Description</label><textarea name="description" rows="4">${escapeHtml(p.description || '')}</textarea></div>
        <div class="form-cols">
          <div class="form-row"><label>Location</label><input name="locationText" value="${escapeHtml(p.location.text || '')}"></div>
          <div class="form-row"><label>Featured/Striking</label><select name="isFeaturedStrike"><option value="0" ${!p.isFeaturedStrike ? 'selected' : ''}>No</option><option value="1" ${p.isFeaturedStrike ? 'selected' : ''}>Yes</option></select></div>
        </div>
        ${fieldsEditorHtml(p, cfg)}
        <div class="form-cols">
          <div class="form-row"><label>Contact Phone</label><input name="contactPhone" value="${escapeHtml(p.contact.phone || '')}"></div>
          <div class="form-row"><label>Contact Email</label><input name="contactEmail" value="${escapeHtml(p.contact.email || '')}"></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Contact Website</label><input name="contactUrl" value="${escapeHtml(p.contact.url || '')}"></div>
          <div class="form-row"><label>Website Approved</label><select name="contactUrlApproved"><option value="0" ${!p.contact.urlApproved ? 'selected' : ''}>No</option><option value="1" ${p.contact.urlApproved ? 'selected' : ''}>Yes</option></select></div>
        </div>
        <div class="form-row"><label>Admin Notes</label><textarea name="adminNotes" rows="2">${escapeHtml(p.adminNotes || '')}</textarea></div>
        <button class="btn" type="submit">Save Changes</button>
      </form>

      <hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${p.status === 'pending_approval' ? `<button class="btn btn-gold" id="approveBtn">Approve &amp; Publish</button><button class="btn btn-danger" id="rejectBtn">Reject</button>` : ''}
        ${p.type !== 'simcha' ? `<button class="btn btn-outline" id="boostBtn">Boost to Top</button>` : ''}
        <button class="btn btn-outline" id="extendBtn">Extend 30 Days</button>
        <button class="btn btn-outline" id="saveForeverBtn">${p.savedForever ? 'Saved Forever' : 'Save Forever'}</button>
        <button class="btn btn-danger" id="deleteBtn">Remove Listing</button>
      </div>

      <h4>Images ${p.images.length ? `(${p.images.length}/6)` : ''}</h4>
      ${p.images.length ? `<div id="imageList" style="display:flex;gap:10px;flex-wrap:wrap">${p.images.map((img) => `
        <div style="text-align:center">
          <img class="thumb-mini" style="width:100px;height:100px" src="${img.url}">
          <div class="hint">${img.approved ? 'Approved' : 'Pending'}</div>
          <button type="button" class="btn btn-sm btn-danger remove-image-btn" data-image-id="${img.id}" style="margin-top:4px">Remove</button>
        </div>`).join('')}</div>` : '<p class="hint">No images yet.</p>'}
      <form id="addImagesForm" style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" name="images" accept="image/*" multiple ${p.images.length >= 6 ? 'disabled' : ''}>
        <button class="btn btn-sm btn-outline" type="submit" ${p.images.length >= 6 ? 'disabled' : ''}>Upload</button>
        ${p.images.length >= 6 ? '<span class="hint">Max 6 images reached - remove one to add more.</span>' : ''}
      </form>

      ${p.payments?.length ? `<h4>Payment History</h4><table class="admin-table"><thead><tr><th>Kind</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>${p.payments.map((pay) => {
        const remaining = pay.amount_cents - (pay.refunded_cents || 0);
        const refundLabel = pay.refunded_cents > 0 ? (remaining <= 0 ? `Refunded ${formatCents(pay.refunded_cents)}` : `Partially refunded ${formatCents(pay.refunded_cents)}`) : '';
        const canRefund = pay.status === 'paid' && pay.stripe_payment_intent && remaining > 0;
        return `<tr>
          <td>${pay.kind}</td>
          <td>${formatCents(pay.amount_cents)}${refundLabel ? `<br><span class="hint">${refundLabel}</span>` : ''}</td>
          <td>${pay.status}</td>
          <td>${formatDate(pay.created_at)}</td>
          <td>${canRefund ? `<button type="button" class="btn btn-sm btn-danger refund-btn" data-payment-id="${pay.id}" data-remaining="${remaining}">Refund</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>` : ''}
      ${p.reports?.length ? `<h4>Reports (${p.reports.length})</h4><ul>${p.reports.map((r) => `<li>${escapeHtml(r.reason || '(no reason given)')} — ${formatDate(r.created_at)}</li>`).join('')}</ul>` : ''}
    </div>
  `;

  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.target).entries());
    const body = {
      title: raw.title, status: raw.status, description: raw.description,
      locationText: raw.locationText, isFeaturedStrike: raw.isFeaturedStrike === '1',
      contactPhone: raw.contactPhone, contactEmail: raw.contactEmail,
      contactUrl: raw.contactUrl, contactUrlApproved: raw.contactUrlApproved === '1',
      adminNotes: raw.adminNotes,
    };
    if ('f_taxonomyId' in raw) body.taxonomyId = raw.f_taxonomyId ? Number(raw.f_taxonomyId) : null;

    // Category-specific fields live in the fields JSON blob, not as top-level
    // post columns - merge any edited ones over the post's existing fields
    // rather than replacing the whole object, so untouched fields survive.
    const fields = { ...p.fields };
    if ('f_jobType' in raw) fields.jobType = raw.f_jobType;
    if ('f_lostOrFound' in raw) fields.lostOrFound = raw.f_lostOrFound;
    if ('f_experience' in raw) fields.experience = raw.f_experience;
    if ('f_price' in raw) {
      const parsed = parseAmountOrText(raw.f_price);
      fields.price = parsed.amount;
      fields.priceText = parsed.text;
      if (parsed.amount !== null) fields.currency = raw.f_currency;
      else delete fields.currency;
    }
    if ('f_payAmount' in raw) {
      const parsed = parseAmountOrText(raw.f_payAmount);
      fields.payAmount = parsed.amount;
      fields.payAmountText = parsed.text;
      if (parsed.amount !== null) { fields.payCurrency = raw.f_payCurrency; fields.payPeriod = raw.f_payPeriod; }
      else { delete fields.payCurrency; delete fields.payPeriod; }
    }
    body.fields = fields;

    await AdminApi.updatePost(id, body);
    toast('Saved');
    openEditor(id);
  });
  const boostBtn = document.getElementById('boostBtn');
  if (boostBtn) boostBtn.addEventListener('click', async () => { await AdminApi.boostPost(id); toast('Boosted'); });
  document.getElementById('extendBtn').addEventListener('click', async () => { await AdminApi.extendPost(id, 30); toast('Extended 30 days'); openEditor(id); });
  document.getElementById('saveForeverBtn').addEventListener('click', async () => { await AdminApi.saveForever(id); toast('Saved forever'); openEditor(id); });
  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!confirm('Remove this listing?')) return;
    await AdminApi.deletePost(id);
    toast('Removed');
    renderPostsPage(AdminRouter.query());
  });
  const approveBtn = document.getElementById('approveBtn');
  if (approveBtn) approveBtn.addEventListener('click', async () => { await AdminApi.approvePost(id); toast('Approved'); openEditor(id); });
  const rejectBtn = document.getElementById('rejectBtn');
  if (rejectBtn) rejectBtn.addEventListener('click', async () => {
    const reason = prompt('Reason for rejection:') || '';
    await AdminApi.rejectPost(id, reason);
    toast('Rejected');
    openEditor(id);
  });

  document.querySelectorAll('.remove-image-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this image?')) return;
      await AdminApi.removeImage(id, btn.dataset.imageId);
      toast('Image removed');
      openEditor(id);
    });
  });
  document.getElementById('addImagesForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input[type="file"]');
    if (!input.files.length) return;
    const fd = new FormData();
    for (const file of input.files) fd.append('images', file);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Uploading…';
    try {
      await AdminApi.addImages(id, fd);
      toast('Image(s) added');
      openEditor(id);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Upload';
    }
  });

  document.querySelectorAll('.refund-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const remaining = Number(btn.dataset.remaining);
      const input = prompt(`Refund amount in dollars (up to ${formatCents(remaining)}). Leave as-is for a full refund of the remaining amount.`, (remaining / 100).toFixed(2));
      if (input === null) return;
      const amountCents = input.trim() === '' ? remaining : Math.round(Number(input) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) return toast('Enter a valid refund amount');
      if (amountCents > remaining) return toast(`Cannot refund more than ${formatCents(remaining)}`);
      if (!confirm(`Refund ${formatCents(amountCents)}? This cannot be undone.`)) return;
      try {
        await AdminApi.refundPayment(id, btn.dataset.paymentId, amountCents);
        toast('Refunded');
        openEditor(id);
      } catch (err) {
        toast(err.message);
      }
    });
  });
}
