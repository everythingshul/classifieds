async function renderClassifiedsListPage({ query }) {
  const cfg = window.SITE_CONFIG;
  const category = query.category || '';
  const page = parseInt(query.page, 10) || 1;
  const catDef = cfg.categories.find((c) => c.key === category);

  const params = { ...query, page };
  const [listData] = await Promise.all([Api.classifieds(params)]);

  const pills = [{ key: '', label: I18N.t('view_all'), count: Object.values(listData.categoryCounts).reduce((a, b) => a + b, 0) }]
    .concat(cfg.categories.map((c) => ({ key: c.key, label: I18N.get() === 'he' ? c.labelHe : c.label, count: listData.categoryCounts[c.key] || 0 })));

  const jobTaxonomies = cfg.taxonomies.filter((t) => t.grp === 'job' && !t.parent_id);
  const reTaxonomies = cfg.taxonomies.filter((t) => t.grp === 'real_estate');

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="page-header">
        <h1>${catDef ? escapeHtml(I18N.get() === 'he' ? catDef.labelHe : catDef.label) : escapeHtml(I18N.t('view_all_classifieds'))}</h1>
        <div class="category-pills">
          ${pills.map((p) => `<a href="/classifieds${p.key ? `?category=${p.key}` : ''}" class="${p.key === category ? 'active' : ''}">${escapeHtml(p.label)} <span class="count">(${p.count})</span></a>`).join('')}
        </div>
      </div>

      <form class="filters-bar" id="filtersForm">
        <div class="field"><label data-i18n="search">Search</label><input type="text" name="q" value="${escapeHtml(query.q || '')}" placeholder="${I18N.t('search')}…"></div>
        <div class="field"><label data-i18n="location">City</label><input type="text" name="city" value="${escapeHtml(query.city || '')}"></div>
        ${category === 'job-offers' ? `
          <div class="field"><label>Job Type</label>
            <select name="jobType"><option value="">Any</option>${cfg.jobTypes.map((t) => `<option value="${t}" ${query.jobType === t ? 'selected' : ''}>${t.replace('_', ' ')}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Category</label>
            <select name="taxonomyId"><option value="">Any</option>${jobTaxonomies.map((t) => `<option value="${t.id}" ${String(query.taxonomyId) === String(t.id) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Pay Period</label>
            <select name="payPeriod"><option value="">Any</option>${cfg.payPeriods.map((p) => `<option value="${p}" ${query.payPeriod === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Min Pay</label><input type="number" name="minPay" value="${escapeHtml(query.minPay || '')}"></div>
          <div class="field"><label>Max Pay</label><input type="number" name="maxPay" value="${escapeHtml(query.maxPay || '')}"></div>
        ` : ''}
        ${category === 'seeking-a-job' ? `
          <div class="field"><label>Category</label>
            <select name="taxonomyId"><option value="">Any</option>${jobTaxonomies.map((t) => `<option value="${t.id}" ${String(query.taxonomyId) === String(t.id) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select>
          </div>
        ` : ''}
        ${['items-for-sale', 'items-for-rent'].includes(category) ? `
          <div class="field"><label>Min Price</label><input type="number" name="minPrice" value="${escapeHtml(query.minPrice || '')}"></div>
          <div class="field"><label>Max Price</label><input type="number" name="maxPrice" value="${escapeHtml(query.maxPrice || '')}"></div>
          <div class="field"><label>Sort</label>
            <select name="sort"><option value="">Newest</option><option value="price_asc" ${query.sort === 'price_asc' ? 'selected' : ''}>Price: Low to High</option><option value="price_desc" ${query.sort === 'price_desc' ? 'selected' : ''}>Price: High to Low</option></select>
          </div>
        ` : ''}
        ${category === 'lost-found' ? `
          <div class="field"><label>Type</label>
            <select name="lostOrFound"><option value="">Any</option><option value="lost" ${query.lostOrFound === 'lost' ? 'selected' : ''}>Lost</option><option value="found" ${query.lostOrFound === 'found' ? 'selected' : ''}>Found</option></select>
          </div>
        ` : ''}
        ${category === 'real-estate' ? `
          <div class="field"><label>Category</label>
            <select name="taxonomyId"><option value="">Any</option>${reTaxonomies.map((t) => `<option value="${t.id}" ${String(query.taxonomyId) === String(t.id) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Min Price</label><input type="number" name="minPrice" value="${escapeHtml(query.minPrice || '')}"></div>
          <div class="field"><label>Max Price</label><input type="number" name="maxPrice" value="${escapeHtml(query.maxPrice || '')}"></div>
        ` : ''}
        <button class="btn btn-sm" type="submit" data-i18n="filter">Filter</button>
      </form>

      ${renderGrid(listData.posts)}

      ${renderPagination(listData.page, listData.totalPages, category)}
    </div>
  `;
  I18N.apply();
  setPageTitle(catDef ? (I18N.get() === 'he' ? catDef.labelHe : catDef.label) : 'Classifieds', catDef ? `${catDef.label} classifieds on JListings.` : 'Browse all community classifieds on JListings.');

  document.getElementById('filtersForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = { category };
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    Router.navigate(`/classifieds?${qs(next)}`);
  });
}

function renderPagination(page, totalPages, category) {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination">';
  for (let p = 1; p <= totalPages; p++) {
    if (p !== 1 && p !== totalPages && Math.abs(p - page) > 2) {
      if (p === page - 3 || p === page + 3) html += '<span>…</span>';
      continue;
    }
    html += `<a href="/classifieds?${qs({ category, page: p })}" class="${p === page ? 'active' : ''}">${p}</a>`;
  }
  html += '</div>';
  return html;
}
