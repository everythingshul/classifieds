async function renderCreatePostPage() {
  const cfg = await fetch('/api/config').then((r) => r.json());
  const root = document.getElementById('adminContent');
  let type = 'classified';
  let category = cfg.categories[0].key;
  let files = [];

  function categoriesForType() {
    return type === 'listing' ? cfg.listingCategories : cfg.categories;
  }

  function categoryFieldsHtml() {
    const catDef = categoriesForType().find((c) => c.key === category);
    const jobTax = cfg.taxonomies.filter((t) => t.grp === 'job');
    const reTax = cfg.taxonomies.filter((t) => t.grp === 'real_estate');
    if (type === 'listing') {
      return catDef?.hasPrice ? `<div class="form-row"><label>Price</label><input type="number" id="f_price"></div>` : '';
    }
    if (category === 'job-offers') {
      return `
        <div class="form-cols">
          <div class="form-row"><label>Job Type</label><select id="f_jobType">${cfg.jobTypes.map((t) => `<option value="${t}">${t}</option>`).join('')}</select></div>
          <div class="form-row"><label>Job Category</label><select id="f_taxonomyId"><option value="">—</option>${jobTax.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></div>
        </div>`;
    }
    if (category === 'seeking-a-job') {
      return `<div class="form-row"><label>Job Category</label><select id="f_taxonomyId"><option value="">—</option>${jobTax.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></div>`;
    }
    if (category === 'lost-found') {
      return `<div class="form-row"><label>Lost or Found</label><select id="f_lostOrFound"><option value="lost">Lost</option><option value="found">Found</option></select></div>`;
    }
    if (category === 'real-estate') {
      return `<div class="form-row"><label>Real Estate Category</label><select id="f_taxonomyId"><option value="">—</option>${reTax.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></div><div class="form-row"><label>Price</label><input type="number" id="f_price"></div>`;
    }
    if (catDef?.hasPrice) return `<div class="form-row"><label>Price</label><input type="number" id="f_price"></div>`;
    return '';
  }

  function render() {
    const catDef = categoriesForType().find((c) => c.key === category);
    const simchaTax = cfg.taxonomies.filter((t) => t.grp === 'simcha');
    root.innerHTML = `
      <h1>+ New Post</h1>
      <div class="admin-card" style="max-width:640px">
        <div class="form-row">
          <label>Type</label>
          <select id="typeSelect"><option value="classified" ${type === 'classified' ? 'selected' : ''}>Classified</option><option value="listing" ${type === 'listing' ? 'selected' : ''}>Listing</option><option value="simcha" ${type === 'simcha' ? 'selected' : ''}>Simcha</option></select>
        </div>
        ${type !== 'simcha' ? `
          <div class="form-row">
            <label>Category</label>
            ${categoriesForType().length ? `<select id="categorySelect">${categoriesForType().map((c) => `<option value="${c.key}" ${category === c.key ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}</select>` : `<p class="hint">No ${type} categories exist yet - add one under Categories first.</p>`}
          </div>
          <div class="form-row"><label>Title</label><input type="text" id="f_title"></div>
          <div class="form-row"><label>Description</label><textarea id="f_description" rows="3"></textarea></div>
          <div id="catFields">${categoryFieldsHtml()}</div>
          <div class="form-row"><label>Location</label><input type="text" id="f_location"></div>
          ${catDef?.hasImages ? `<div class="form-row"><label>Photos</label><input type="file" id="f_images" accept="image/*" multiple></div>` : ''}
        ` : `
          <div class="form-row">
            <label>Simcha Category</label>
            <select id="taxonomySelect"><option value="">—</option>${simchaTax.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select>
          </div>
          <div class="form-row"><label>Details <span class="hint">(optional)</span></label><textarea id="f_description" rows="3"></textarea></div>
          <div class="form-row"><label>Surprise email <span class="hint">(optional, limited to one)</span></label><input type="email" id="f_surprise"></div>
        `}
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h3>Contact Info</h3>
        <div class="form-cols">
          <div class="form-row"><label>Phone</label><input type="tel" id="c_phone"></div>
          <div class="form-row"><label>Email</label><input type="email" id="c_email"></div>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h3>Poster Info</h3>
        <div class="form-cols">
          <div class="form-row"><label>First Name</label><input type="text" id="p_first"></div>
          <div class="form-row"><label>Last Name</label><input type="text" id="p_last"></div>
        </div>
        <div class="form-row"><label>Email <span class="hint">(defaults to your admin email if blank)</span></label><input type="email" id="p_email"></div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <div class="form-cols">
          <div class="form-row"><label>Live for (days)</label><input type="number" id="durationDays" value="30"></div>
          <div class="form-row"><label>Featured / Striking</label><select id="wantsStrike"><option value="">No</option><option value="1">Yes</option></select></div>
        </div>
        <div id="createError" class="error-list" style="display:none"></div>
        <button class="btn btn-gold" id="submitBtn">Create &amp; Publish</button>
      </div>
    `;

    document.getElementById('typeSelect').addEventListener('change', (e) => {
      type = e.target.value;
      category = categoriesForType()[0]?.key || null;
      render();
    });
    const categorySelect = document.getElementById('categorySelect');
    if (categorySelect) categorySelect.addEventListener('change', (e) => { category = e.target.value; render(); });
    const imgInput = document.getElementById('f_images');
    if (imgInput) imgInput.addEventListener('change', () => { files = Array.from(imgInput.files).slice(0, 6); });

    document.getElementById('submitBtn').addEventListener('click', submit);
  }

  async function submit() {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    try {
      const fd = new FormData();
      fd.set('type', type);
      fd.set('contactPhone', document.getElementById('c_phone').value.trim());
      fd.set('contactEmail', document.getElementById('c_email').value.trim());
      fd.set('posterFirstName', document.getElementById('p_first').value.trim());
      fd.set('posterLastName', document.getElementById('p_last').value.trim());
      fd.set('posterEmail', document.getElementById('p_email').value.trim());
      fd.set('durationDays', document.getElementById('durationDays').value || '30');
      fd.set('wantsStrike', document.getElementById('wantsStrike').value);

      if (type === 'classified' || type === 'listing') {
        if (!category) throw new Error(`No ${type} categories exist yet - add one under Categories first.`);
        fd.set('category', category);
        fd.set('title', document.getElementById('f_title').value.trim());
        fd.set('description', document.getElementById('f_description').value.trim());
        const fields = {};
        const jt = document.getElementById('f_jobType');
        if (jt) fields.jobType = jt.value;
        const tax = document.getElementById('f_taxonomyId');
        if (tax) fd.set('taxonomyId', tax.value);
        const lf = document.getElementById('f_lostOrFound');
        if (lf) fields.lostOrFound = lf.value;
        const price = document.getElementById('f_price');
        if (price) fields.price = price.value;
        fd.set('fields', JSON.stringify(fields));
        fd.set('locationText', document.getElementById('f_location').value.trim());
        files.forEach((f) => fd.append('images', f));
      } else {
        const taxSelect = document.getElementById('taxonomySelect');
        fd.set('taxonomyId', taxSelect.value);
        fd.set('description', document.getElementById('f_description').value.trim());
        const surprise = document.getElementById('f_surprise').value.trim();
        if (surprise) fd.set('surpriseEmail', surprise);
      }

      const post = await AdminApi.createPost(fd);
      toast('Post created and live');
      window.location.hash = `#/posts?q=${post.publicId}`;
    } catch (e) {
      const box = document.getElementById('createError');
      box.style.display = 'block';
      box.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  render();
}
