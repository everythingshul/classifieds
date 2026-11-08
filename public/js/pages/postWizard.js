function renderPostWizard() {
  const cfg = window.SITE_CONFIG;
  const state = { step: 0, postType: null, category: null, data: {}, files: [] };

  // What this site itself charges for `row` (a pricing tier or add-on),
  // shown here as a preview - the actual charge is always resolved
  // authoritatively server-side at submit time (routes/public/posts.js),
  // falling back the whole order to USD if any involved item lacks a GBP
  // price, so a partially-configured GBP price list can rarely make this
  // per-row preview differ slightly from the final checkout currency.
  function siteAmount(row) {
    if (!row) return { amount: 0, currency: 'usd' };
    if (cfg.currency === 'gbp' && row.price_cents_gbp !== null && row.price_cents_gbp !== undefined) {
      return { amount: row.price_cents_gbp, currency: 'gbp' };
    }
    return { amount: row.price_cents, currency: 'usd' };
  }
  function formatSiteAmount(row) {
    const { amount, currency } = siteAmount(row);
    return formatCents(amount, currency);
  }

  const AI_SPARKLE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.6 4.9 4.9 1.6-4.9 1.6-1.6 4.9-1.6-4.9-4.9-1.6 4.9-1.6 1.6-4.9z"/><path d="M19 13.5l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3z"/></svg>';
  const AI_UNDO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.5 13a8.5 8.5 0 1 0 2-8.5L3 7"/></svg>';

  // Small icon button meant to sit inside an input/textarea (wrap the
  // field in a .ai-field-wrap div) - just the icon plus a hover tooltip,
  // a gentle pulse nudges a poster to notice it's there.
  function aiPolishBtnHtml(id) {
    return `<button type="button" class="ai-polish-icon-btn" id="${id}" aria-label="Polish with AI" data-tooltip="Polish with AI">${AI_SPARKLE_ICON}</button>`;
  }

  // Wires an in-field "Polish with AI" icon button (see aiPolishBtnHtml).
  // Swaps to an "Undo" icon/tooltip after a successful polish; typing
  // again manually drops it back to the fresh "Polish" icon, since
  // there's nothing left to undo to once the poster's edited past it.
  function setAiBtnIdle(btn) {
    delete btn.dataset.applied;
    btn.classList.remove('is-applied');
    btn.innerHTML = AI_SPARKLE_ICON;
    btn.setAttribute('aria-label', 'Polish with AI');
    btn.setAttribute('data-tooltip', 'Polish with AI');
  }
  function setAiBtnApplied(btn) {
    btn.dataset.applied = '1';
    btn.classList.add('is-applied');
    btn.innerHTML = AI_UNDO_ICON;
    btn.setAttribute('aria-label', 'Undo AI polish');
    btn.setAttribute('data-tooltip', 'Undo AI polish');
  }
  function wireAiPolish(btn, input, field) {
    if (!btn || !input) return;
    let previousValue = null;
    input.addEventListener('input', () => {
      if (btn.dataset.applied) setAiBtnIdle(btn);
    });
    btn.addEventListener('click', async () => {
      if (btn.dataset.applied) {
        input.value = previousValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const current = input.value.trim();
      if (!current) { toast('Write something first'); return; }
      btn.disabled = true;
      try {
        const result = await Api.polishPost({ field, text: current, type: state.postType, category: state.category });
        previousValue = current;
        input.value = input.maxLength > 0 ? result.text.slice(0, input.maxLength) : result.text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setAiBtnApplied(btn);
      } catch (e) {
        toast(e.message || 'AI polish failed, please try again');
        setAiBtnIdle(btn);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function stepsList() {
    return state.postType === 'simcha'
      ? ['Type', 'Category', 'Details', 'Review']
      : ['Type', 'Category', 'Details', 'Pricing', 'Review'];
  }

  function shell(inner) {
    const steps = stepsList();
    const progressPct = steps.length > 1 ? Math.round((state.step / (steps.length - 1)) * 100) : 0;
    document.getElementById('app').innerHTML = `
      <div class="container" style="padding:30px 0 60px">
        <h1 data-i18n="nav_post">Post an Ad</h1>
        <div class="wizard-steps">
          <div class="wizard-progress-track"><div class="wizard-progress-fill" id="wizardProgressFill"></div></div>
          <div class="wizard-steps-row">${steps.map((s, i) => `<span class="${i === state.step ? 'active' : i < state.step ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div>
        </div>
        <div class="form-card">${inner}</div>
      </div>
    `;
    I18N.apply();
    setPageTitle('Post an Ad');
    // Set after insertion (rather than inline in the markup above) so the
    // width change is picked up as a transition by .wizard-progress-fill's
    // CSS instead of just appearing at its final value immediately.
    requestAnimationFrame(() => { document.getElementById('wizardProgressFill').style.width = `${progressPct}%`; });
  }

  function go(step) { state.step = step; render(); }

  function currentCategories() {
    return state.postType === 'listing' ? cfg.listingCategories : cfg.categories;
  }
  function currentCatDef() {
    return currentCategories().find((c) => c.key === state.category);
  }
  // Striking/oversized/boost pricing is separate per post type (simchas
  // don't offer any of these, so this is undefined for that type).
  function currentAddons() {
    return cfg.addons?.[state.postType];
  }

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
        <button type="button" class="category-tile ${state.postType === 'listing' ? 'selected' : ''}" data-v="listing">Listing</button>
        <button type="button" class="category-tile ${state.postType === 'simcha' ? 'selected' : ''}" data-v="simcha">Simcha</button>
      </div>
    `);
    document.querySelectorAll('.category-tile').forEach((btn) => btn.addEventListener('click', () => {
      state.postType = btn.dataset.v;
      state.category = null;
      go(1);
    }));
  }

  function renderCategoryStep() {
    const categories = currentCategories();
    shell(`
      ${categories.length ? `<div class="category-grid">
        ${categories.map((c) => `<button type="button" class="category-tile ${state.category === c.key ? 'selected' : ''}" data-v="${c.key}">${escapeHtml(I18N.get() === 'he' ? c.labelHe : c.label)}${c.free ? ' <span class="tag">Free</span>' : ''}</button>`).join('')}
      </div>` : `<p class="hint">No categories are available for this section yet. Please check back soon.</p>`}
      <div style="margin-top:20px"><button class="btn btn-outline" id="backBtn">Back</button></div>
    `);
    // Picking a category is the whole point of this step - advance right
    // away instead of making the poster click a separate Next.
    document.querySelectorAll('.category-tile').forEach((btn) => btn.addEventListener('click', () => { state.category = btn.dataset.v; go(2); }));
    document.getElementById('backBtn').addEventListener('click', () => go(0));
  }

  function renderSimchaCategoryStep() {
    const simchaTax = cfg.taxonomies.filter((t) => t.grp === 'simcha');
    shell(`
      <div class="form-row">
        <label>Simcha Category</label>
        <select id="taxonomyId">
          <option value="">Select…</option>
          ${simchaTax.map((t) => `<option value="${t.id}" ${state.data.taxonomyId == t.id ? 'selected' : ''}>${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
      <div style="margin-top:10px"><button class="btn btn-outline" id="backBtn">Back</button></div>
    `);
    document.getElementById('backBtn').addEventListener('click', () => go(0));
    document.getElementById('taxonomyId').addEventListener('change', (e) => {
      if (!e.target.value) return;
      state.data.taxonomyId = e.target.value;
      go(2);
    });
  }

  // A generic "Category" sub-selector for any category (built-in or
  // admin-added, classifieds or listing) that has admin-defined
  // sub-categories under it - job-offers/seeking-a-job/real-estate render
  // their own version of this inline below since they pair it with other
  // category-specific fields, so this is only used for everything else.
  function genericTaxonomyFieldHtml() {
    const catDef = currentCatDef();
    const grp = catDef?.taxonomyGroup;
    if (!grp || grp === 'job' || grp === 'real_estate') return '';
    const opts = cfg.taxonomies.filter((t) => t.grp === grp);
    if (!opts.length) return '';
    return `<div class="form-row"><label>Category</label><select id="f_taxonomyId"><option value="">Select…</option>${opts.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>`;
  }

  // Listings only: let a business appear under up to 4 more categories.
  // The primary category stays authoritative for pricing.
  function extraCategoriesHtml() {
    if (state.postType !== 'listing') return '';
    const others = currentCategories().filter((c) => c.key !== state.category);
    if (!others.length) return '';
    const picked = state.data.categories || [];
    return `<div class="form-row"><label>Also show under <span class="hint">(optional - up to 4 more categories)</span></label>
      <div class="extra-cats" style="display:flex;flex-wrap:wrap;gap:6px 14px">${others.map((c) => `<label style="font-weight:normal"><input type="checkbox" class="f-extra-cat" value="${c.key}" ${picked.includes(c.key) ? 'checked' : ''}> ${escapeHtml(I18N.get() === 'he' ? c.labelHe : c.label)}</label>`).join('')}</div></div>`;
  }

  function priceFieldHtml() {
    const currencies = cfg.currencies || [{ code: 'USD', symbol: '$', label: 'US Dollar (USD)' }];
    return `
      <div class="form-row"><label>Price <span class="hint">(optional - enter an amount, text like "Call for price", or leave blank)</span></label>
        <div style="display:flex;gap:6px">
          <input type="text" id="f_price" style="flex:1">
          <select id="f_currency" style="width:110px">${currencies.map((c) => `<option value="${c.code}" ${c.code === 'USD' ? 'selected' : ''}>${escapeHtml(c.code)}</option>`).join('')}</select>
        </div>
      </div>`;
  }

  function categorySpecificFieldsHtml() {
    const jobTax = cfg.taxonomies.filter((t) => t.grp === 'job');
    const reTax = cfg.taxonomies.filter((t) => t.grp === 'real_estate');
    // Listings are always generic (admin-defined, no specialized fields) -
    // skip straight to the default case regardless of what the category's
    // slug happens to look like.
    switch (state.postType === 'listing' ? null : state.category) {
      case 'job-offers':
        return `
          <div class="form-cols">
            <div class="form-row"><label>Job Type</label><select id="f_jobType">${cfg.jobTypes.map((t) => `<option value="${t}">${t.replace('_', ' ')}</option>`).join('')}</select></div>
            <div class="form-row"><label>Job Category</label><select id="f_taxonomyId"><option value="">Select…</option>${jobTax.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>
          </div>
          <div class="form-cols">
            <div class="form-row"><label>Pay Amount <span class="hint">(optional - enter an amount, text like "DOE", or leave blank)</span></label>
              <div style="display:flex;gap:6px">
                <input type="text" id="f_payAmount" style="flex:1">
                <select id="f_payCurrency" style="width:90px">${(cfg.currencies || [{ code: 'USD' }]).map((c) => `<option value="${c.code}" ${c.code === 'USD' ? 'selected' : ''}>${escapeHtml(c.code)}</option>`).join('')}</select>
              </div>
            </div>
            <div class="form-row"><label>Per <span class="hint">(only used with a numeric amount)</span></label><select id="f_payPeriod">${cfg.payPeriods.map((p) => `<option value="${p}">${p}</option>`).join('')}</select></div>
          </div>`;
      case 'seeking-a-job':
        return `
          <div class="form-row"><label>Job Category</label><select id="f_taxonomyId"><option value="">Select…</option>${jobTax.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>
          <div class="form-row"><label>Experience</label><textarea id="f_experience" rows="3"></textarea></div>`;
      case 'items-for-sale':
      case 'items-for-rent':
        return `${genericTaxonomyFieldHtml()}${priceFieldHtml()}`;
      case 'lost-found':
        return `${genericTaxonomyFieldHtml()}<div class="form-row"><label>Lost or Found</label><select id="f_lostOrFound"><option value="lost">Lost</option><option value="found">Found</option></select></div>`;
      case 'real-estate':
        return `
          <div class="form-row"><label>Category</label><select id="f_taxonomyId"><option value="">Select…</option>${reTax.map((t) => `<option value="${t.id}">${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select></div>
          ${priceFieldHtml()}`;
      default: {
        // Admin-added custom classifieds category, or a Listing (always generic).
        const catDef = currentCatDef();
        return `${genericTaxonomyFieldHtml()}${catDef?.hasPrice ? priceFieldHtml() : ''}`;
      }
    }
  }

  function imageUploadHtml() {
    const catDef = currentCatDef();
    if (!catDef?.hasImages) return '';
    return `
      <div class="form-row">
        <label>Photos <span class="hint">(up to 6 — do not upload photos of people; all photos are reviewed before your post goes live)</span></label>
        <input type="file" id="f_images" accept="image/png,image/jpeg,image/webp" multiple>
        <div id="imagePreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div>
      </div>`;
  }

  function baseCharLimits() {
    return state.postType === 'listing' ? cfg.listingCharLimits : cfg.charLimits;
  }

  function renderClassifiedDetailsStep() {
    const catDef = currentCatDef();
    // Typing/pasting is never blocked by a maxlength attribute - going over
    // the current limit shows a red warning with a button to pay for more
    // room (see renderLimitWarning/updateCounters below) instead of the
    // browser silently refusing to accept any more characters.
    const initialTitle = state.data.title || '';
    const initialDescription = state.data.description || '';
    shell(`
      <h3 style="margin-top:0">${escapeHtml(catDef.label)}</h3>
      <div class="form-row">
        <label>${state.postType === 'listing' ? 'Business/Organization Name' : 'Title'}</label>
        <div class="ai-field-wrap">
          <input type="text" id="f_title" value="${escapeHtml(initialTitle)}" required>
          ${aiPolishBtnHtml('polishTitleBtn')}
        </div>
        <div class="char-counter" id="titleCounter"></div>
        <div class="field-limit-warning error-list" id="titleLimitWarning" style="display:none"></div>
      </div>
      <div class="form-row">
        <label>Description</label>
        <div class="ai-field-wrap">
          <textarea id="f_description" rows="5">${escapeHtml(initialDescription)}</textarea>
          ${aiPolishBtnHtml('polishDescBtn')}
        </div>
        <div class="char-counter" id="descCounter"></div>
        <div class="field-limit-warning error-list" id="descriptionLimitWarning" style="display:none"></div>
      </div>
      ${categorySpecificFieldsHtml()}
      ${extraCategoriesHtml()}
      <div class="form-row"><label>Location</label><input type="text" id="f_location" placeholder="City, State" value="${escapeHtml(state.data.locationText || '')}" required></div>
      ${imageUploadHtml()}
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>Contact Info (shown on the listing)</h3>
      <div class="form-cols">
        <div class="form-row"><label>Phone</label><div style="display:flex;gap:6px"><select id="c_phoneCountry" style="width:90px"></select><input type="tel" id="c_phone" value="${escapeHtml(state.data.contactPhone || '')}"></div></div>
        <div class="form-row"><label>Ext.</label><input type="text" id="c_phoneExt" value="${escapeHtml(state.data.contactPhoneExt || '')}"></div>
      </div>
      <div class="form-row" id="phoneMethodsRow">
        <label>Also reachable by <span class="hint">(this number can always be called)</span></label>
        <div style="display:flex;gap:16px;align-items:center;height:34px">
          ${['sms', 'whatsapp'].map((m) => `
            <label style="font-weight:400;display:flex;align-items:center;gap:5px">
              <input type="checkbox" class="c-phone-method" value="${m}" ${(state.data.contactPhoneMethods || []).includes(m) ? 'checked' : ''}>
              ${m === 'sms' ? 'Text/SMS' : 'WhatsApp'}
            </label>`).join('')}
        </div>
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

    const titleInput = document.getElementById('f_title');
    const descInput = document.getElementById('f_description');
    // Shared by both fields - the oversized add-on is one purchase that
    // raises both caps at once, so extending from either field's warning
    // button applies to both.
    let oversized = !!state.data.wantsOversized;
    function activeLimits() {
      return oversized ? cfg.oversizedCharLimits : baseCharLimits();
    }
    function renderLimitWarning(field, label, input, counterEl, warningEl) {
      const limits = activeLimits();
      const len = input.value.length;
      const over = len > limits[field];
      counterEl.textContent = `${len} / ${limits[field]}`;
      counterEl.style.color = over ? 'var(--danger)' : '';
      if (!over) { warningEl.style.display = 'none'; warningEl.innerHTML = ''; return; }
      warningEl.style.display = 'flex';
      const addon = currentAddons()?.oversized;
      const overLimits = cfg.oversizedCharLimits;
      warningEl.innerHTML = oversized
        ? `<span>${label} is over the ${limits[field]}-character limit.</span>`
        : `<span>${label} is over the ${limits[field]}-character limit.</span>
           <button type="button" class="btn btn-sm btn-gold extend-limit-btn">Extend to ${overLimits[field]} characters${addon ? ` — ${formatSiteAmount(addon)}` : ''}</button>`;
      const btn = warningEl.querySelector('.extend-limit-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          oversized = true;
          state.data.wantsOversized = true;
          updateCounters();
        });
      }
    }
    function updateCounters() {
      renderLimitWarning('title', 'Title', titleInput, document.getElementById('titleCounter'), document.getElementById('titleLimitWarning'));
      renderLimitWarning('description', 'Description', descInput, document.getElementById('descCounter'), document.getElementById('descriptionLimitWarning'));
    }
    titleInput.addEventListener('input', updateCounters);
    descInput.addEventListener('input', updateCounters);
    updateCounters();
    wireAiPolish(document.getElementById('polishTitleBtn'), titleInput, 'title');
    wireAiPolish(document.getElementById('polishDescBtn'), descInput, 'description');
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
      // Typing was never blocked, so this is the actual gate - checked
      // against whichever limit is currently active (base, or the extended
      // one once the add-on button was clicked) so the field's own red
      // warning and this error can never disagree.
      const limits = activeLimits();
      if (title.length > limits.title) errs.push(`Title must be ${limits.title} characters or fewer (currently ${title.length}).`);
      const description = descInput.value.trim();
      if (description.length > limits.description) errs.push(`Description must be ${limits.description} characters or fewer (currently ${description.length}).`);
      const location = document.getElementById('f_location').value.trim();
      if (!location) errs.push('Location is required');
      const posterEmail = document.getElementById('p_email').value.trim();
      if (!posterEmail || !posterEmail.includes('@') || !posterEmail.split('@')[1]?.includes('.')) errs.push('A valid email address is required');
      const contactPhone = document.getElementById('c_phone').value.trim();
      const contactEmail = document.getElementById('c_email').value.trim();
      const contactUrl = document.getElementById('c_url').value.trim();
      if (!contactPhone && !contactEmail && !contactUrl) errs.push('At least one contact method is required');
      // 'call' is always included - the checkboxes only add text/WhatsApp on top of it.
      const contactPhoneMethods = ['call', ...Array.from(document.querySelectorAll('.c-phone-method:checked')).map((el) => el.value)];

      let extraCats = Array.from(document.querySelectorAll('.f-extra-cat:checked')).map((el) => el.value);
      if (extraCats.length > 4) { errs.push('Choose at most 4 additional categories'); extraCats = extraCats.slice(0, 4); }
      state.data.categories = extraCats;

      const fields = {};
      const genericTaxSelect = document.getElementById('f_taxonomyId');
      if (state.postType === 'listing') {
        if (document.getElementById('f_price')) fields.price = document.getElementById('f_price').value;
        if (genericTaxSelect) fields.taxonomyId = genericTaxSelect.value;
      } else if (state.category === 'job-offers') {
        fields.jobType = document.getElementById('f_jobType').value;
        fields.taxonomyId = document.getElementById('f_taxonomyId').value;
        if (!fields.taxonomyId) errs.push('Job category is required');
        const pay = document.getElementById('f_payAmount').value;
        if (pay) { fields.payAmount = pay; fields.payPeriod = document.getElementById('f_payPeriod').value; fields.payCurrency = document.getElementById('f_payCurrency').value; }
      } else if (state.category === 'seeking-a-job') {
        fields.taxonomyId = document.getElementById('f_taxonomyId').value;
        if (!fields.taxonomyId) errs.push('Job category is required');
        fields.experience = document.getElementById('f_experience').value;
      } else if (['items-for-sale', 'items-for-rent'].includes(state.category)) {
        fields.price = document.getElementById('f_price').value;
        if (genericTaxSelect) fields.taxonomyId = genericTaxSelect.value;
      } else if (state.category === 'lost-found') {
        fields.lostOrFound = document.getElementById('f_lostOrFound').value;
        if (genericTaxSelect) fields.taxonomyId = genericTaxSelect.value;
      } else if (state.category === 'real-estate') {
        fields.taxonomyId = document.getElementById('f_taxonomyId').value;
        if (!fields.taxonomyId) errs.push('Real estate category is required');
        fields.price = document.getElementById('f_price').value;
      } else {
        if (document.getElementById('f_price')) fields.price = document.getElementById('f_price').value;
        if (genericTaxSelect) fields.taxonomyId = genericTaxSelect.value;
      }
      const currencySelect = document.getElementById('f_currency');
      if (currencySelect && fields.price !== undefined) fields.currency = currencySelect.value;

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
        contactPhoneExt: document.getElementById('c_phoneExt').value.trim(), contactPhoneMethods, contactEmail, contactUrl,
        posterFirstName: document.getElementById('p_first').value.trim(),
        posterLastName: document.getElementById('p_last').value.trim(),
        posterPhone: document.getElementById('p_phone').value.trim(),
        posterPhoneCountry: document.getElementById('p_phoneCountry').value,
        posterEmail,
        wantsOversized: oversized,
        fields: { ...(state.data.fields || {}), ...fields, taxonomyId: fields.taxonomyId },
      });
      if (fields.taxonomyId !== undefined) state.data.taxonomyId = fields.taxonomyId;
      go(3);
    });
  }

  function renderSimchaDetailsStep() {
    shell(`
      <div class="form-row">
        <label>Details <span class="hint">(optional)</span></label>
        <textarea id="f_description" rows="4" maxlength="${cfg.simchaCharLimits.description}" placeholder="Any details you'd like to share">${escapeHtml(state.data.description || '')}</textarea>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>Your Info <span class="hint">(never shown publicly - for our records only)</span></h3>
      <div class="form-cols">
        <div class="form-row"><label>First Name <span class="hint">(optional)</span></label><input type="text" id="p_first" value="${escapeHtml(state.data.posterFirstName || '')}"></div>
        <div class="form-row"><label>Last Name <span class="hint">(optional)</span></label><input type="text" id="p_last" value="${escapeHtml(state.data.posterLastName || '')}"></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Phone <span class="hint">(optional)</span></label><div style="display:flex;gap:6px"><select id="p_phoneCountry" style="width:90px"></select><input type="tel" id="p_phone" value="${escapeHtml(state.data.posterPhone || '')}"></div></div>
        <div class="form-row"><label>Email <span class="hint">(required)</span></label><input type="email" id="p_email" value="${escapeHtml(state.data.posterEmail || '')}" required></div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>Surprise a Friend! <span class="hint">(optional)</span></h3>
      <p class="hint">Enter one friend's email and we'll surprise them with a Mazel Tov message and a link to this simcha.</p>
      <div class="form-row"><input type="email" id="surpriseEmail" placeholder="friend@example.com" value="${escapeHtml(state.data.surpriseEmails?.[0]?.email || '')}"></div>
      <div id="stepError" class="error-list" style="display:none"></div>
      <div style="margin-top:20px;display:flex;justify-content:space-between"><button class="btn btn-outline" id="backBtn">Back</button><button class="btn" id="nextBtn">Next</button></div>
    `);
    populateCountrySelect(document.getElementById('p_phoneCountry'), state.data.posterPhoneCountry);
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
        posterFirstName: document.getElementById('p_first').value.trim(), posterLastName: document.getElementById('p_last').value.trim(),
        posterPhone: document.getElementById('p_phone').value.trim(),
        posterPhoneCountry: document.getElementById('p_phoneCountry').value,
        posterEmail, surpriseEmails,
      });
      go(3);
    });
  }

  function renderPricingStep() {
    const wantedType = state.postType === 'listing' ? 'listing' : 'classified';
    const tiers = cfg.pricingTiers.filter((t) => t.post_type === wantedType && (t.category === state.category || t.category === null) && t.active);
    const isFree = !!currentCatDef()?.free;
    shell(`
      ${isFree ? '<p class="tag">This category is always free to post.</p>' : `
      <h3 style="margin-top:0">Choose how long to run your ad</h3>
      <div class="tier-grid" id="tierGrid">
        ${tiers.map((t) => `<div class="tier-tile ${state.data.pricingTierId == t.id ? 'selected' : ''}" data-id="${t.id}"><div>${escapeHtml(t.name)}</div><div class="price">${formatSiteAmount(t)}</div></div>`).join('')}
      </div>`}
      <h3>Add-ons</h3>
      <label class="addon-row"><input type="checkbox" id="wantsStrike" ${state.data.wantsStrike ? 'checked' : ''}> Featured / Striking listing — ${currentAddons()?.strike ? formatSiteAmount(currentAddons().strike) : ''}</label>
      ${state.data.wantsOversized ? `<p class="hint">Oversized post add-on selected on the Details step${currentAddons()?.oversized ? ` — ${formatSiteAmount(currentAddons().oversized)}` : ''}.</p>` : ''}
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
      go(4);
    });
  }

  function renderReviewStep() {
    const simchaCatName = state.postType === 'simcha'
      ? cfg.taxonomies.find((t) => String(t.id) === String(state.data.taxonomyId))?.name
      : null;

    function fieldSummaryRows() {
      const f = state.data.fields || {};
      const rows = [];
      if (f.jobType) rows.push(['Job Type', f.jobType]);
      if (f.taxonomyId) {
        const tax = cfg.taxonomies.find((t) => String(t.id) === String(f.taxonomyId));
        if (tax) rows.push([state.category === 'real-estate' ? 'Real Estate Category' : 'Job Category', tax.name]);
      }
      if (f.payAmount) {
        const pay = parseAmountOrText(f.payAmount);
        rows.push(['Pay', pay.amount !== null ? `${formatMoney(pay.amount * 100, f.payCurrency)} / ${f.payPeriod}` : pay.text]);
      }
      if (f.experience) rows.push(['Experience', f.experience]);
      if (f.lostOrFound) rows.push(['Status', f.lostOrFound === 'lost' ? 'Lost' : 'Found']);
      if (f.price !== undefined && f.price !== null && f.price !== '') {
        const price = parseAmountOrText(f.price);
        rows.push(['Price', price.amount !== null ? formatMoney(price.amount * 100, f.currency) : price.text]);
      }
      return rows;
    }

    function contactSummaryRows() {
      const rows = [];
      if (state.data.contactPhone) {
        const methodLabels = { call: 'Call', sms: 'Text', whatsapp: 'WhatsApp' };
        const methods = (state.data.contactPhoneMethods || ['call']).map((m) => methodLabels[m] || m).join(', ');
        rows.push(['Contact Phone', `${state.data.contactPhone}${state.data.contactPhoneExt ? ` x${state.data.contactPhoneExt}` : ''} (${methods})`]);
      }
      if (state.data.contactEmail) rows.push(['Contact Email', state.data.contactEmail]);
      if (state.data.contactUrl) rows.push(['Contact Website', state.data.contactUrl]);
      return rows;
    }

    // Mirrors services/pricing.js's resolveCurrency: GBP only if every row
    // involved has a GBP price configured, otherwise the whole order's
    // preview (like the real checkout) falls back to USD rather than mixing.
    function resolveOrderCurrency(rows) {
      if (cfg.currency !== 'gbp') return 'usd';
      return rows.every((r) => r.price_cents_gbp !== null && r.price_cents_gbp !== undefined) ? 'gbp' : 'usd';
    }

    function currentChargeLines() {
      if (state.postType === 'simcha') {
        const simchaTier = cfg.pricingTiers.find((t) => t.post_type === 'simcha' && t.active);
        if (!simchaTier || simchaTier.price_cents === 0) return null;
        const currency = resolveOrderCurrency([simchaTier]);
        return { currency, lines: [{ kind: 'listing', label: simchaTier.name, amount: currency === 'gbp' ? simchaTier.price_cents_gbp : simchaTier.price_cents }] };
      }
      if (currentCatDef()?.free) return { currency: 'usd', lines: [{ label: 'Standard (Free)', amount: 0 }] };
      const tier = cfg.pricingTiers.find((t) => String(t.id) === String(state.data.pricingTierId));
      const strike = state.data.wantsStrike ? currentAddons()?.strike : null;
      const oversized = state.data.wantsOversized ? currentAddons()?.oversized : null;
      const currency = resolveOrderCurrency([tier, strike, oversized].filter(Boolean));
      const amt = (row) => (currency === 'gbp' ? row.price_cents_gbp : row.price_cents);
      const lines = [];
      if (tier) lines.push({ kind: 'listing', label: `${tier.name} listing`, amount: amt(tier) });
      if (strike) lines.push({ kind: 'strike', label: strike.config.label || 'Featured / Striking listing', amount: amt(strike) });
      if (oversized) lines.push({ kind: 'oversized', label: oversized.config.label || 'Oversized post', amount: amt(oversized) });
      return { currency, lines };
    }

    function pricingSummary() {
      const charge = currentChargeLines();
      if (!charge) return null;
      return { currency: charge.currency, ...applyPromoToLines(charge.lines) };
    }

    // Mirrors the server's per-feature promo scoping (routes/public/posts.js
    // applyPromoToCharges) so the review-step total the poster sees always
    // matches what they're actually charged at checkout, even when a promo
    // is scoped to only some of their selected add-ons.
    function applyPromoToLines(lines) {
      let total = lines.reduce((s, l) => s + l.amount, 0);
      const promo = state.data.promo;
      if (promo && total > 0) {
        const eligible = lines.filter((l) => promoCoversFeature(promo, l.kind));
        const ineligible = lines.filter((l) => !promoCoversFeature(promo, l.kind));
        if (eligible.length) {
          const eligibleSubtotal = eligible.reduce((s, l) => s + l.amount, 0);
          const discountedEligible = promo.percentOff
            ? Math.max(0, Math.round(eligibleSubtotal * (1 - promo.percentOff / 100)))
            : Math.max(0, eligibleSubtotal - (promo.amountOffCents || 0));
          lines = [...lines, { label: `Promo (${promo.code})`, amount: discountedEligible - eligibleSubtotal }];
          total = discountedEligible + ineligible.reduce((s, l) => s + l.amount, 0);
        }
      }
      return { lines, total };
    }

    const pricing = pricingSummary();

    shell(`
      <h3 style="margin-top:0">Review Your ${state.postType === 'simcha' ? 'Simcha' : 'Listing'}</h3>
      <ul class="detail-meta-list">
        ${state.postType === 'simcha'
          ? `<li><span>Category</span><span>${escapeHtml(simchaCatName || '')}</span></li>`
          : `<li><span>Category</span><span>${escapeHtml(currentCatDef()?.label || '')}</span></li>
             <li><span>Title</span><span>${escapeHtml(state.data.title)}</span></li>
             ${state.data.description ? `<li class="stacked"><span>Description</span><span>${escapeHtml(state.data.description)}</span></li>` : ''}
             ${fieldSummaryRows().map(([k, v]) => `<li><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></li>`).join('')}
             <li><span>Location</span><span>${escapeHtml(state.data.locationText)}</span></li>`}
        ${state.data.description && state.postType === 'simcha' ? `<li class="stacked"><span>Details</span><span>${escapeHtml(state.data.description)}</span></li>` : ''}
        ${contactSummaryRows().map(([k, v]) => `<li><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></li>`).join('')}
        ${state.data.posterFirstName || state.data.posterLastName ? `<li><span>Name</span><span>${escapeHtml(`${state.data.posterFirstName || ''} ${state.data.posterLastName || ''}`.trim())}</span></li>` : ''}
        <li><span>Email</span><span>${escapeHtml(state.data.posterEmail)}</span></li>
        ${state.data.posterPhone ? `<li><span>Phone</span><span>${escapeHtml(state.data.posterPhone)}</span></li>` : ''}
      </ul>
      ${pricing ? `
        <h3>Pricing</h3>
        <ul class="detail-meta-list">
          ${pricing.lines.map((l) => `<li ${l.label.startsWith('Promo') ? 'class="promo-line-new"' : ''}><span>${escapeHtml(l.label)}</span><span>${formatCents(l.amount, pricing.currency)}</span></li>`).join('')}
          <li><span><b>Total</b></span><span><b>${formatCents(pricing.total, pricing.currency)}</b></span></li>
        </ul>
        ${pricing.total > 0 || state.data.promo ? `
          <div class="form-row" id="promoRow" style="max-width:320px">
            <label>Promo code</label>
            <div style="display:flex;gap:6px">
              <input type="text" id="promoInput" style="flex:1;text-transform:uppercase" placeholder="e.g. SAVE10" value="${escapeHtml(state.data.promo?.code || '')}" ${state.data.promo ? 'disabled' : ''}>
              ${state.data.promo
                ? `<button type="button" class="btn btn-sm btn-outline" id="removePromoBtn">Remove</button>`
                : `<button type="button" class="btn btn-sm btn-outline" id="applyPromoBtn">Apply</button>`}
            </div>
            <div id="promoMsg" class="hint"></div>
          </div>
        ` : ''}
      ` : ''}
      <p class="hint">By submitting, you agree to our <a href="/terms" target="_blank">Terms &amp; Conditions</a> and <a href="/refund-policy" target="_blank">Refund Policy</a>.</p>
      <div id="stepError" class="error-list" style="display:none"></div>
      <div id="reviewActions" style="margin-top:10px;display:flex;justify-content:space-between">
        <button class="btn btn-outline" id="backBtn">Back</button>
        <button class="btn btn-gold" id="submitBtn">Submit${pricing && pricing.total > 0 ? ' & Pay' : ''}</button>
      </div>
      <div id="checkoutContainer" style="margin-top:16px"></div>
    `);
    document.getElementById('backBtn').addEventListener('click', () => go(state.postType === 'simcha' ? 3 : 3));
    document.getElementById('submitBtn').addEventListener('click', submitPost);

    const applyPromoBtn = document.getElementById('applyPromoBtn');
    if (applyPromoBtn) applyPromoBtn.addEventListener('click', async () => {
      const input = document.getElementById('promoInput');
      const code = input.value.trim();
      const msg = document.getElementById('promoMsg');
      if (!code) return;
      applyPromoBtn.disabled = true;
      applyPromoBtn.textContent = 'Checking…';
      try {
        const promo = await Api.validatePromo(code, state.postType);
        const lines = currentChargeLines()?.lines || [];
        if (lines.length && !lines.some((l) => promoCoversFeature(promo, l.kind))) {
          throw new Error(`That promo code doesn't apply to any of your selected options`);
        }
        state.data.promo = promo;
        renderReviewStep();
      } catch (e) {
        msg.textContent = e.message;
        msg.style.color = 'var(--danger)';
        applyPromoBtn.disabled = false;
        applyPromoBtn.textContent = 'Apply';
      }
    });
    const removePromoBtn = document.getElementById('removePromoBtn');
    if (removePromoBtn) removePromoBtn.addEventListener('click', () => {
      state.data.promo = null;
      renderReviewStep();
    });
  }

  async function submitPost() {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const fd = new FormData();
      fd.set('type', state.postType);
      if (state.postType === 'classified' || state.postType === 'listing') {
        fd.set('category', state.category);
        if (state.postType === 'listing' && (state.data.categories || []).length) fd.set('categories', JSON.stringify(state.data.categories));
        fd.set('title', state.data.title);
        fd.set('description', state.data.description || '');
        fd.set('locationText', state.data.locationText);
        if (state.data.locationCity) fd.set('locationCity', state.data.locationCity);
        if (state.data.locationState) fd.set('locationState', state.data.locationState);
        if (state.data.locationLat) fd.set('locationLat', state.data.locationLat);
        if (state.data.locationLng) fd.set('locationLng', state.data.locationLng);
        fd.set('contactPhone', state.data.contactPhone || '');
        fd.set('contactPhoneCountry', state.data.contactPhoneCountry || defaultPhoneCountry());
        fd.set('contactPhoneExt', state.data.contactPhoneExt || '');
        fd.set('contactPhoneMethods', JSON.stringify(state.data.contactPhoneMethods || ['call']));
        fd.set('contactEmail', state.data.contactEmail || '');
        fd.set('contactUrl', state.data.contactUrl || '');
        fd.set('posterFirstName', state.data.posterFirstName || '');
        fd.set('posterLastName', state.data.posterLastName || '');
        fd.set('posterPhone', state.data.posterPhone || '');
        fd.set('posterPhoneCountry', state.data.posterPhoneCountry || defaultPhoneCountry());
        fd.set('posterEmail', state.data.posterEmail);
        fd.set('fields', JSON.stringify(state.data.fields || {}));
        if (state.data.taxonomyId) fd.set('taxonomyId', state.data.taxonomyId);
        if (state.data.pricingTierId) fd.set('pricingTierId', state.data.pricingTierId);
        fd.set('wantsStrike', state.data.wantsStrike ? '1' : '');
        fd.set('wantsOversized', state.data.wantsOversized ? '1' : '');
        if (state.data.promo) fd.set('promoCode', state.data.promo.code);
        state.files.forEach((f) => fd.append('images', f));
      } else {
        fd.set('description', state.data.description || '');
        fd.set('taxonomyId', state.data.taxonomyId);
        fd.set('posterFirstName', state.data.posterFirstName || '');
        fd.set('posterLastName', state.data.posterLastName || '');
        fd.set('posterPhone', state.data.posterPhone || '');
        fd.set('posterPhoneCountry', state.data.posterPhoneCountry || defaultPhoneCountry());
        fd.set('posterEmail', state.data.posterEmail);
        fd.set('surpriseEmails', JSON.stringify(state.data.surpriseEmails || []));
        if (state.data.promo) fd.set('promoCode', state.data.promo.code);
      }

      const result = await Api.createPost(fd);
      if (result.requiresPayment) {
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
          return;
        }
        document.getElementById('reviewActions').style.display = 'none';
        // The promo code controls sit outside #reviewActions, so without this
        // they'd stay live after checkout mounts - applying/removing a promo
        // re-renders the review step, wiping #checkoutContainer without ever
        // destroying the mounted Stripe checkout first (mountEmbeddedCheckout
        // now guards against that too, but this avoids triggering it at all).
        const promoRow = document.getElementById('promoRow');
        if (promoRow) promoRow.style.display = 'none';
        const checkoutEl = document.getElementById('checkoutContainer');
        await mountEmbeddedCheckout(checkoutEl, result.clientSecret);
        checkoutEl.classList.add('show');
      } else {
        document.getElementById('app').innerHTML = postSubmittedHtml(result.post);
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

// Shared by the free-post success screen here and by post-success.html
// (after a paid checkout) - a post can go straight to 'live', or land on
// 'pending_approval' if it has photos awaiting moderation, in which case
// there's no public page to link to yet.
function postSubmittedHtml(post) {
  const path = `/${post.type === 'simcha' ? 'simchas' : post.type === 'listing' ? 'listings' : 'classifieds'}/${post.id}`;
  if (post.status === 'pending_approval') {
    return `
      <div class="container" style="padding:60px 0;text-align:center;max-width:520px">
        <div class="success-pop">
          ${successCheckHtml()}
          <h1>Your post has been submitted!</h1>
          <p>Since it includes photos, it needs a quick admin review before it goes live - usually within a day. You'll see it on the site as soon as it's approved.</p>
          <p><a href="/" class="btn btn-outline">Back to Home</a></p>
        </div>
      </div>`;
  }
  return `
    <div class="container" style="padding:60px 0;text-align:center">
      <div class="success-pop">
        ${successCheckHtml()}
        <h1>Your post is live!</h1>
        <p><a href="${path}" class="btn">View your post</a></p>
      </div>
    </div>`;
}
