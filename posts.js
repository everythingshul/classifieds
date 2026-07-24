function renderPostWizard() {
  const cfg = window.SITE_CONFIG;
  const state = { step: 0, postType: null, category: null, data: {}, files: [] };

  function stepsList() {
    return state.postType === 'simcha'
      ? ['Type', 'Category', 'Details', 'Review']
      : ['Type', 'Category', 'Details', 'Pricing', 'Review'];
  }

  function shell(inner) {
    const steps = stepsList();
    document.getElementById('app').innerHTML = `
      <div class="container" style="padding:30px 0 60px">
        <h1 data-i18n="nav_post">Post an Ad</h1>
        <div class="wizard-steps">${steps.map((s, i) => `<span class="${i === state.step ? 'active' : ''}">${i + 1}. ${s}</span>`).join('')}</div>
        <div class="form-card">${inner}</div>
      </div>
    `;
    I18N.apply();
  }

  function go(step) { state.step = step; render(); }

  function render() {
    if (state.step === 0) return renderTypeStep();
    if (state.step === 1) return state.postType === 'simcha' ? renderSimchaCategoryStep() : renderCategoryStep();
    if (state.step === 2) return state.postType === 'simcha' ? renderSimchaDetailsStep() : renderClassifiedDetailsStep();
    if (state.postType === 'simcha') {
      if (state.step === 3) return renderReviewStep();
    } else {
      if (state.step === 3) return renderPricingStep();
      if (state.step === 4) return renderReviewStep();
    }
  }

  function renderTypeStep() {
    shell(`
      <div class="category-grid">
        <button type="button" class="category-tile ${state.postType === 'classified' ? 'selected' : ''}" data-v="classified">Classified</button>
        <button type="button" class="category-tile ${state.postType === 'simcha' ? 'selected' : ''}" data-v="simcha">Simcha</button>
      </div>
      <div style="margin-top:20px;text-align:end"><button class="btn" id="nextBtn">Next</button></div>
    `);
    document.querySelectorAll('.category-tile').forEach((btn) => btn.addEventListener('click', () => {
      state.postType = btn.dataset.v;
      state.category = null;
      render();
    }));
    document.getElementById('nextBtn').addEventListener('click', () => { if (state.postType) go(1); else toast('Choose Classified or Simcha'); });
  }

  function renderCategoryStep() {
    shell(`
      <div class="category-grid">
        ${cfg.categories.map((c) => `<button type="button" class="category-tile ${state.category === c.key ? 'selected' : ''}" data-v="${c.key}">${escapeHtml(I18N.get() === 'he' ? c.labelHe : c.label)}${c.free ? ' <span class="tag">Free</span>' : ''}</button>`).join('')}
      </div>
      <div style="margin-top:20px;display:flex;justify-content:space-between"><button class="btn btn-outline" id="backBtn">Back</button><button class="btn" id="nextBtn">Next</button></div>
    `);
    document.querySelectorAll('.category-tile').forEach((btn) => btn.addEventListener('click', () => { state.category = btn.dataset.v; render(); }));
    document.getElementById('backBtn').addEventListener('click', () => go(0));
    document.getElementById('nextBtn').addEventListener('click', () => { if (state.category) go(2); else toast('Choose a category'); });
  }

  function renderSimchaCategoryStep() {
    const simchaTax = cfg.taxonomies.filter((t) => t.grp === 'simcha');
    shell(`
      <div class="form-row">
        <label>Simcha Category</label>
        <select id="taxonomyId">
          <option value="">Select…</option>
          ${simchaTax.map((t) => `<option value="${t.id}" ${state.data.taxonomyId == t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:space-between"><button class="btn btn-outline" id="backBtn">Back</button><button class="btn" id="nextBtn">Next</button></div>
    `);
    document.getElementById('backBtn').addEventListener('click', () => go(0));
    document.getElementById('nextBtn').addEventListener('click', () => {
      const taxonomyId = document.getElementById('taxonomyId').value;
      if (!taxonomyId) return toast('Choose a category');
      state.data.taxonomyId = taxonomyId;
      go(2);
    });
  }

  function categorySpecificFieldsHtml() {
    const jobTax = cfg.taxonomies.filter((t) => t.grp === 'job');
    const reTax = cfg.taxonomies.filter((t) => t.grp === 'real_estate');
    switch (state.category) {
      case 'job-offers':
        return `
          <div class="form-cols">
            <div class="form-row"><label>Job Type</label><select id="f_jobType">${cfg.jobTypes.map((t) => `<option value="${t}">${t.replace('_', ' ')}</option>`).join('')}</select></div>
            <div class="form-row"><label>Job Category</label><select id="f_taxonomyId"><option value="">Select…</option>${jobTax.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></div>
          </div>
          <div class="form-cols">
            <div class="form-row"><label>Pay Amount <span class="hint">(optional)</span></label><input type="number" id="f_payAmount" min="0" step="0.01"></div>
            <div class="form-row"><label>Per</label><select id="f_payPeriod">${cfg.payPeriods.map((p) => `<option value="${p}">${p}</option>`).join('')}</select></div>
          </div>`;
      case 'seeking-a-job':
        return `
          <div class="form-row"><label>Job Category</label><select id="f_taxonomyId"><option value="">Select…</option>${jobTax.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></div>
          <div class="form-row"><label>Experience</label><textarea id="f_experience" rows="3"></textarea></div>`;
      case 'items-for-sale':
      case 'items-for-rent':
        return `<div class="form-row"><label>Price</label><input type="number" id="f_price" min="0" step="0.01" required></div>`;
      case 'lost-found':
        return `<div class="form-row"><label>Lost or Found</label><select id="f_lostOrFound"><option value="lost">Lost</option><option value="found">Found</option></select></div>`;
      case 'real-estate':
        return `
          <div class="form-row"><label>Category</label><select id="f_taxonomyId"><option value="">Select…</option>${reTax.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>
          <div class="form-row"><label>Price <span class="hint">(optional)</span></label><input type="number" id="f_price" min="0" step="0.01"></div>`;
      default: {
        // Admin-added custom category type.
        const catDef = cfg.categories.find((c) => c.key === state.category);
        return catDef?.hasPrice ? `<div class="form-row"><label>Price <span class="hint">(optional)</span></label><input type="number" id="f_price" min="0" step="0.01"></div>` : '';
      }
    }
  }

  function imageUploadHtml() {
    const catDef = cfg.categories.find((c) => c.key === state.category);
    if (!catDef?.hasImages) return '';
    return `
      <div class="form-row">
        <label>Photos <span class="hint">(up to 6 — do not upload photos of people; all photos are reviewed before your post goes live)</span></label>
        <input type="file" id="f_images" accept="image/png,image/jpeg,image/webp" multiple>
        <div id="imagePreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div>
      </div>`;
  }

  function renderClassifiedDetailsStep() {
    const catDef = cfg.categories.find((c) => c.key === state.category);
    shell(`
      <h3 style="margin-top:0">${escapeHtml(catDef.label)}</h3>
      <div class="form-row"><label>Title</label><input type="text" id="f_title" maxlength="${cfg.charLimits.title}" value="${escapeHtml(state.data.title || '')}" required></div>
      <div class="form-row"><label>Description</label><textarea id="f_description" rows="5" maxlength="${cfg.charLimits.description}">${escapeHtml(state.data.description || '')}</textarea></div>
      ${categorySpecificFieldsHtml()}
      <div class="form-row"><label>Location</label><input type="text" id="f_location" placeholder="City, State" value="${escapeHtml(state.data.locationText || '')}" required></div>
      ${imageUploadHtml()}
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>Contact Info (shown on the listing)</h3>
      <div class="form-cols">
        <div class="form-row"><label>Phone</label><div style="display:flex;gap:6px"><select id="c_phoneCountry" style="width:90px"></select><input type="tel" id="c_phone" value="${escapeHtml(state.data.contactPhone || '')}"></div></div>
        <div class="form-row"><label>Ext.</label><input type="text" id="c_phoneExt" value="${escapeHtml(state.data.contactPhoneExt || '')}"></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Email</label><input type="email" id="c_email" value="${escapeHtml(state.data.contactEmail || '')}"></div>
        <div class="form-row"><label>Website <span class="hint">(reviewed before it links live)</span></label><input type="text" id="c_url" value="${escapeHtml(state.data.contactUrl || '')}"></div>
      </div>
      <div class="hint">At least one contact method is required.</div>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>Your Info</h3>
      <div class="form-cols">
        <div class="form-row"><label>First Name <span class="hint">(optional)</span></label><input type="text" id="p_first" value="${escapeHtml(state.data.posterFirstName || '')}"></div>
        <div class="form-row"><label>Last Name <span class="hint">(optional)</span></label><input type="text" id="p_last" value="${escapeHtml(state.data.posterLastName || '')}"></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Phone <span class="hint">(optional)</span></label><div style="display:flex;gap:6px"><select id="p_phoneCountry" style="width:90px"></select><input type="tel" id="p_phone" value="${escapeHtml(state.data.posterPhone || '')}"></div></div>
        <div class="form-row"><label>Email <span class="hint">(required)</span></label><input type="email" id="p_email" value="${escapeHtml(state.data.posterEmail || '')}" required></div>
      </div>
      <div id="stepError" class="error-list" style="display:none"></div>
      <div style="margin-top:10px;display:flex;justify-content:space-between"><button class="btn btn-outline" id="backBtn">Back</button><button class="btn" id="nextBtn">Next</button></div>
    `);
    populateCountrySelect(document.getElementById('c_phoneCountry'), state.data.contactPhoneCountry);
    populateCountrySelect(document.getElementById('p_phoneCountry'), state.data.posterPhoneCountry);
    attachLocationAutocomplete(document.getElementById('f_location'), {
      onSelect: (p) => { state.data._locFromMaps = p; },
    });
    const fileInput = document.getElementById('f_images');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        state.files = Array.from(fileInput.files).slice(0, 6);
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = '';
        state.files.forEach((f) => {
          const img = document.createElement('img');
          img.style.cssText = 'width:70px;height:70px;object-fit:cover';
          img.src = URL.createObjectURL(f);
          preview.appendChild(img);
        });
      });
    }
    document.getElementById('backBtn').addEventListener('click', () => go(1));
    document.getElementById('nextBtn').addEventListener('click', () => {
      const errs = [];
      const title = document.getElementById('f_title').value.trim();
      if (!title) errs.push('Title is required');
      const location = document.getElementById('f_location').value.trim();
      if (!location) errs.push('Location is required');
      const posterEmail = document.getElementById('p_email').value.trim();
      if (!posterEmail || !posterEmail.includes('@') || !posterEmail.split('@')[1]?.includes('.')) errs.push('A valid email address is required');
      const contactPhone = document.getElementById('c_phone').value.trim();
      const contactEmail = document.getElementById('c_email').value.trim();
      const contactUrl = document.getElementById('c_url').value.trim();
      if (!contactPhone && !contactEmail && !contactUrl) errs.push('At least one contact method is required');

      const fields = {};
      if (state.category === 'job-offers') {
        fields.jobType = document.getElementById('f_jobType').value;
        fields.taxonomyId = document.getElementById('f_taxonomyId').value;
        const pay = document.getElementById('f_payAmount').value;
        if (pay) { fields.payAmount = pay; fields.payPeriod = document.getElementById('f_payPeriod').value; }
      } else if (state.category === 'seeking-a-job') {
        fields.taxonomyId = document.getElementById('f_taxonomyId').value;
        fields.experience = document.getElementById('f_experience').value;
      } else if (['items-for-sale', 'items-for-rent'].includes(state.category)) {
        fields.price = document.getElementById('f_price').value;
        if (!fields.price) errs.push('Price is required');
      } else if (state.category === 'lost-found') {
        fields.lostOrFound = document.getElementById('f_lostOrFound').value;
      } else if (state.category === 'real-estate') {
        fields.taxonomyId = document.getElementById('f_taxonomyId').value;
        fields.price = document.getElementById('f_price').value;
      } else if (document.getElementById('f_price')) {
        fields.price = document.getElementById('f_price').value;
      }

      if (errs.length) {
        const box = document.getElementById('stepError');
        box.style.display = 'block';
        box.innerHTML = `<ul>${errs.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
        return;
      }

      Object.assign(state.data, {
        title, description: document.getElementById('f_description').value.trim(),
        locationText: location,
        locationCity: state.data._locFromMaps?.city || null,
        locationState: state.data._locFromMaps?.state || null,
        locationLat: state.data._locFromMaps?.lat || null,
        locationLng: state.data._locFromMaps?.lng || null,
        locationPlaceId: state.data._locFromMaps?.placeId || null,
        contactPhone, contactPhoneCountry: document.getElementById('c_phoneCountry').value,
        contactPhoneExt: document.getElementById('c_phoneExt').value.trim(), contactEmail, contactUrl,
        posterFirstName: document.getElementById('p_first').value.trim(),
        posterLastName: document.getElementById('p_last').value.trim(),
        posterPhone: document.getElementById('p_phone').value.trim(),
        posterPhoneCountry: document.getElementById('p_phoneCountry').value,
        posterEmail,
        fields: { ...(state.data.fields || {}), ...fields, taxonomyId: fields.taxonomyId },
      });
      if (fields.taxonomyId !== undefined) state.data.taxonomyId = fields.taxonomyId;
      go(3);
    });
  }

  function renderSimchaDetailsStep() {
    shell(`
      <div class="form-row"><label>Details <span class="hint">(optional)</span></label><textarea id="f_description" rows="4" maxlength="${cfg.simchaCharLimits.description}" placeholder="Any details you'd like to share">${escapeHtml(state.data.description || '')}</textarea></div>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>Contact Info <span class="hint">(optional)</span></h3>
      <div class="form-cols">
        <div class="form-row"><label>Phone</label><div style="display:flex;gap:6px"><select id="c_phoneCountry" style="width:90px"></select><input type="tel" id="c_phone" value="${escapeHtml(state.data.contactPhone || '')}"></div></div>
        <div class="form-row"><label>Email</label><input type="email" id="c_email" value="${escapeHtml(state.data.contactEmail || '')}"></div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>Your Info</h3>
      <div class="form-cols">
        <div class="form-row"><label>First Name <span class="hint">(optional)</span></label><input type="text" id="p_first" value="${escapeHtml(state.data.posterFirstName || '')}"></div>
        <div class="form-row"><label>Last Name <span class="hint">(optional)</span></label><input type="text" id="p_last" value="${escapeHtml(state.data.posterLastName || '')}"></div>
      </div>
      <div class="form-row"><label>Email <span class="hint">(required)</span></label><input type="email" id="p_email" value="${escapeHtml(state.data.posterEmail || '')}" required></div>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>Surprise a Friend! <span class="hint">(optional)</span></h3>
      <p class="hint">Enter one friend's email and we'll surprise them with a Mazel Tov message and a link to this simcha.</p>
      <div class="form-row"><input type="email" id="surpriseEmail" placeholder="friend@example.com" value="${escapeHtml(state.data.surpriseEmails?.[0]?.email || '')}"></div>
      <div id="stepError" class="error-list" style="display:none"></div>
      <div style="margin-top:20px;display:flex;justify-content:space-between"><button class="btn btn-outline" id="backBtn">Back</button><button class="btn" id="nextBtn">Next</button></div>
    `);
    populateCountrySelect(document.getElementById('c_phoneCountry'), state.data.contactPhoneCountry);
    document.getElementById('backBtn').addEventListener('click', () => go(1));
    document.getElementById('nextBtn').addEventListener('click', () => {
      const errs = [];
      const posterEmail = document.getElementById('p_email').value.trim();
      if (!posterEmail || !posterEmail.includes('@') || !posterEmail.split('@')[1]?.includes('.')) errs.push('A valid email address is required');
      const surpriseEmailVal = document.getElementById('surpriseEmail').value.trim();
      if (errs.length) {
        const box = document.getElementById('stepError');
        box.style.display = 'block';
        box.innerHTML = `<ul>${errs.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
        return;
      }
      const senderName = `${document.getElementById('p_first').value.trim()} ${document.getElementById('p_last').value.trim()}`.trim();
      const surpriseEmails = surpriseEmailVal ? [{ email: surpriseEmailVal, senderDisplayName: senderName }] : [];
      Object.assign(state.data, {
        description: document.getElementById('f_description').value.trim(),
        contactPhone: document.getElementById('c_phone').value.trim(),
        contactPhoneCountry: document.getElementById('c_phoneCountry').value,
        contactEmail: document.getElementById('c_email').value.trim(),
        posterFirstName: document.getElementById('p_first').value.trim(), posterLastName: document.getElementById('p_last').value.trim(),
        posterEmail, surpriseEmails,
      });
      go(3);
    });
  }

  function renderPricingStep() {
    const tiers = cfg.pricingTiers.filter((t) => (t.category === state.category || t.category === null) && t.active);
    const isFree = state.category === 'lost-found';
    shell(`
      ${isFree ? '<p class="tag">This category is always free to post.</p>' : `
      <h3 style="margin-top:0">Choose how long to run your ad</h3>
      <div class="tier-grid" id="tierGrid">
        ${tiers.map((t) => `<div class="tier-tile ${state.data.pricingTierId == t.id ? 'selected' : ''}" data-id="${t.id}"><div>${escapeHtml(t.name)}</div><div class="price">${formatCents(t.price_cents)}</div></div>`).join('')}
      </div>`}
      <h3>Add-ons</h3>
      <label class="addon-row"><input type="checkbox" id="wantsStrike" ${state.data.wantsStrike ? 'checked' : ''}> Featured / Striking listing — ${cfg.addons.strike ? formatCents(cfg.addons.strike.price_cents) : ''}</label>
      <label class="addon-row"><input type="checkbox" id="wantsOversized" ${state.data.wantsOversized ? 'checked' : ''}> Oversized post (longer title/description) — ${cfg.addons.oversized ? formatCents(cfg.addons.oversized.price_cents) : ''}</label>
      <div style="margin-top:10px;display:flex;justify-content:space-between"><button class="btn btn-outline" id="backBtn">Back</button><button class="btn" id="nextBtn">Next</button></div>
    `);
    document.querySelectorAll('.tier-tile').forEach((el) => el.addEventListener('click', () => {
      state.data.pricingTierId = el.dataset.id;
      document.querySelectorAll('.tier-tile').forEach((t) => t.classList.remove('selected'));
      el.classList.add('selected');
    }));
    document.getElementById('backBtn').addEventListener('click', () => go(2));
    document.getElementById('nextBtn').addEventListener('click', () => {
      if (!isFree && !state.data.pricingTierId) return toast('Choose a pricing option');
      state.data.wantsStrike = document.getElementById('wantsStrike').checked;
      state.data.wantsOversized = document.getElementById('wantsOversized').checked;
      go(4);
    });
  }

  function renderReviewStep() {
    const simchaCatName = state.postType === 'simcha'
      ? cfg.taxonomies.find((t) => String(t.id) === String(state.data.taxonomyId))?.name
      : null;
    shell(`
      <h3 style="margin-top:0">Review Your ${state.postType === 'simcha' ? 'Simcha' : 'Listing'}</h3>
      <ul class="detail-meta-list">
        ${state.postType === 'simcha'
          ? `<li><span>Category</span><span>${escapeHtml(simchaCatName || '')}</span></li>`
          : `<li><span>Title</span><span>${escapeHtml(state.data.title)}</span></li><li><span>Location</span><span>${escapeHtml(state.data.locationText)}</span></li>`}
        <li><span>Email</span><span>${escapeHtml(state.data.posterEmail)}</span></li>
      </ul>
      <p class="hint">By submitting, you agree to our <a href="/terms" target="_blank">Terms &amp; Conditions</a> and <a href="/refund-policy" target="_blank">Refund Policy</a>.</p>
      <div id="stepError" class="error-list" style="display:none"></div>
      <div style="margin-top:10px;display:flex;justify-content:space-between">
        <button class="btn btn-outline" id="backBtn">Back</button>
        <button class="btn btn-gold" id="submitBtn">Submit${state.postType === 'classified' && state.category !== 'lost-found' ? ' & Pay' : ''}</button>
      </div>
    `);
    document.getElementById('backBtn').addEventListener('click', () => go(state.postType === 'simcha' ? 3 : 3));
    document.getElementById('submitBtn').addEventListener('click', submitPost);
  }

  async function submitPost() {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const fd = new FormData();
      fd.set('type', state.postType);
      if (state.postType === 'classified') {
        fd.set('category', state.category);
        fd.set('title', state.data.title);
        fd.set('description', state.data.description || '');
        fd.set('locationText', state.data.locationText);
        if (state.data.locationCity) fd.set('locationCity', state.data.locationCity);
        if (state.data.locationState) fd.set('locationState', state.data.locationState);
        if (state.data.locationLat) fd.set('locationLat', state.data.locationLat);
        if (state.data.locationLng) fd.set('locationLng', state.data.locationLng);
        fd.set('contactPhone', state.data.contactPhone || '');
        fd.set('contactPhoneCountry', state.data.contactPhoneCountry || 'US');
        fd.set('contactPhoneExt', state.data.contactPhoneExt || '');
        fd.set('contactEmail', state.data.contactEmail || '');
        fd.set('contactUrl', state.data.contactUrl || '');
        fd.set('posterFirstName', state.data.posterFirstName || '');
        fd.set('posterLastName', state.data.posterLastName || '');
        fd.set('posterPhone', state.data.posterPhone || '');
        fd.set('posterPhoneCountry', state.data.posterPhoneCountry || 'US');
        fd.set('posterEmail', state.data.posterEmail);
        fd.set('fields', JSON.stringify(state.data.fields || {}));
        if (state.data.taxonomyId) fd.set('taxonomyId', state.data.taxonomyId);
        if (state.data.pricingTierId) fd.set('pricingTierId', state.data.pricingTierId);
        fd.set('wantsStrike', state.data.wantsStrike ? '1' : '');
        fd.set('wantsOversized', state.data.wantsOversized ? '1' : '');
        state.files.forEach((f) => fd.append('images', f));
      } else {
        fd.set('description', state.data.description || '');
        fd.set('taxonomyId', state.data.taxonomyId);
        fd.set('contactPhone', state.data.contactPhone || '');
        fd.set('contactPhoneCountry', state.data.contactPhoneCountry || 'US');
        fd.set('contactEmail', state.data.contactEmail || '');
        fd.set('posterFirstName', state.data.posterFirstName || '');
        fd.set('posterLastName', state.data.posterLastName || '');
        fd.set('posterEmail', state.data.posterEmail);
        fd.set('surpriseEmails', JSON.stringify(state.data.surpriseEmails || []));
      }

      const result = await Api.createPost(fd);
      if (result.requiresPayment) {
        window.location.href = result.checkoutUrl;
      } else {
        document.getElementById('app').innerHTML = `
          <div class="container" style="padding:60px 0;text-align:center">
            <h1>🎉 Your post is live!</h1>
            <p><a href="/${result.post.type === 'simcha' ? 'simchas' : 'classifieds'}/${result.post.id}" class="btn">View your post</a></p>
          </div>`;
      }
    } catch (e) {
      const box = document.getElementById('stepError');
      box.style.display = 'block';
      box.innerHTML = `<ul>${(e.data?.details || [e.message]).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
      btn.disabled = false;
      btn.textContent = 'Submit & Pay';
    }
  }

  render();
}
