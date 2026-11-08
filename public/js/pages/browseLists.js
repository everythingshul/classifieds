// Browse/list pages for the three core post types - one function set
// per type, grouped into a single file since each is a small, similar
// filter-form + grid + pagination pattern.

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
            <select name="taxonomyId"><option value="">Any</option>${reTaxonomies.map((t) => `<option value="${t.id}" ${String(query.taxonomyId) === String(t.id) ? 'selected' : ''}>${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select>
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

const LISTING_CAT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9 20v-6h6v6"/></svg>';
const LISTING_CAT_ACCENTS = ['navy', 'gold', 'cta', 'success'];

// Landing view for /listings with no category chosen yet - a picker grid
// instead of dumping every business at once, so a visitor narrows down to
// what they actually want first. Only categories with at least one live
// listing show up (an empty category is a dead end, not a useful choice).
async function renderListingCategoryChooser() {
  const cfg = window.SITE_CONFIG;
  const counts = await Api.listingCategoryCounts();
  const heb = I18N.get() === 'he';
  const withBusinesses = cfg.listingCategories.filter((c) => (counts[c.key] || 0) > 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="page-header">
        <h1 data-i18n="nav_listings">Listings</h1>
        <p class="sub" style="color:var(--ink-soft)">Which kind of business are you looking for?</p>
      </div>
      ${withBusinesses.length ? `
        <div class="listing-cat-chooser">
          ${withBusinesses.map((c, i) => `
            <a class="listing-cat-card" href="/listings?category=${c.key}">
              <span class="listing-cat-icon accent-${LISTING_CAT_ACCENTS[i % LISTING_CAT_ACCENTS.length]}">${LISTING_CAT_ICON}</span>
              <span class="cat-name">${escapeHtml(heb && c.labelHe ? c.labelHe : c.label)}</span>
              <span class="cat-count">${counts[c.key]} ${counts[c.key] === 1 ? 'business' : 'businesses'}</span>
            </a>
          `).join('')}
          <a class="listing-cat-card listing-cat-viewall" href="/listings?all=1">
            <span class="listing-cat-icon accent-navy">${LISTING_CAT_ICON}</span>
            <span class="cat-name" data-i18n="view_all">View All</span>
            <span class="cat-count">${total} ${total === 1 ? 'business' : 'businesses'} total</span>
          </a>
        </div>
      ` : `<p class="empty-state">No businesses have been listed yet - check back soon.</p>`}
    </div>
  `;
  I18N.apply();
  setPageTitle('Listings', 'Browse community business listings on JListings, by category.');
}

async function renderListingsListPage({ query }) {
  if (!query.category && !query.all) return renderListingCategoryChooser();

  const cfg = window.SITE_CONFIG;
  const category = query.category || '';
  const page = parseInt(query.page, 10) || 1;
  const catDef = cfg.listingCategories.find((c) => c.key === category);

  const params = { ...query, page };
  const [listData] = await Promise.all([Api.listings(params)]);

  const pills = [{ key: '', label: I18N.t('view_all'), count: Object.values(listData.categoryCounts).reduce((a, b) => a + b, 0) }]
    .concat(cfg.listingCategories.map((c) => ({ key: c.key, label: I18N.get() === 'he' ? c.labelHe : c.label, count: listData.categoryCounts[c.key] || 0 })));

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="page-header">
        <h1>${catDef ? escapeHtml(I18N.get() === 'he' ? catDef.labelHe : catDef.label) : escapeHtml(I18N.t('view_all_listings'))}</h1>
        <div class="category-pills">
          <a href="/listings">&larr; Choose a different category</a>
          ${pills.map((p) => `<a href="/listings${p.key ? `?category=${p.key}` : '?all=1'}" class="${p.key === category ? 'active' : ''}">${escapeHtml(p.label)} <span class="count">(${p.count})</span></a>`).join('')}
        </div>
      </div>

      <form class="filters-bar" id="filtersForm">
        <div class="field"><label data-i18n="search">Search</label><input type="text" name="q" value="${escapeHtml(query.q || '')}" placeholder="${I18N.t('search')}…"></div>
        <div class="field"><label data-i18n="location">City</label><input type="text" name="city" value="${escapeHtml(query.city || '')}"></div>
        <div class="field"><label>Min Price</label><input type="number" name="minPrice" value="${escapeHtml(query.minPrice || '')}"></div>
        <div class="field"><label>Max Price</label><input type="number" name="maxPrice" value="${escapeHtml(query.maxPrice || '')}"></div>
        <div class="field"><label>Sort</label>
          <select name="sort"><option value="">Newest</option><option value="price_asc" ${query.sort === 'price_asc' ? 'selected' : ''}>Price: Low to High</option><option value="price_desc" ${query.sort === 'price_desc' ? 'selected' : ''}>Price: High to Low</option></select>
        </div>
        <button class="btn btn-sm" type="submit" data-i18n="filter">Filter</button>
      </form>

      ${renderGrid(listData.posts)}

      ${renderListingsPagination(listData.page, listData.totalPages, category)}
    </div>
  `;
  I18N.apply();
  setPageTitle(catDef ? (I18N.get() === 'he' ? catDef.labelHe : catDef.label) : 'Listings', catDef ? `${catDef.label} listings on JListings.` : 'Browse all community listings on JListings.');

  document.getElementById('filtersForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = category ? { category } : { all: 1 };
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    Router.navigate(`/listings?${qs(next)}`);
  });
}

function renderListingsPagination(page, totalPages, category) {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination">';
  for (let p = 1; p <= totalPages; p++) {
    if (p !== 1 && p !== totalPages && Math.abs(p - page) > 2) {
      if (p === page - 3 || p === page + 3) html += '<span>…</span>';
      continue;
    }
    html += `<a href="/listings?${qs(category ? { category, page: p } : { all: 1, page: p })}" class="${p === page ? 'active' : ''}">${p}</a>`;
  }
  html += '</div>';
  return html;
}

async function renderSimchasListPage({ query }) {
  const cfg = window.SITE_CONFIG;
  const page = parseInt(query.page, 10) || 1;
  const simchaTaxonomies = cfg.taxonomies.filter((t) => t.grp === 'simcha');

  const listData = await Api.simchas({ ...query, page });

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="page-header">
        <h1 data-i18n="view_all_simchas">All Simchas</h1>
      </div>

      <form class="filters-bar" id="filtersForm">
        <div class="field"><label data-i18n="search">Search</label><input type="text" name="q" value="${escapeHtml(query.q || '')}"></div>
        <div class="field"><label data-i18n="category">Category</label>
          <select name="taxonomyId"><option value="">Any</option>${simchaTaxonomies.map((t) => `<option value="${t.id}" ${String(query.taxonomyId) === String(t.id) ? 'selected' : ''}>${'— '.repeat(t.parent_id ? 1 : 0)}${escapeHtml(t.name)}</option>`).join('')}</select>
        </div>
        <button class="btn btn-sm" type="submit" data-i18n="filter">Filter</button>
      </form>

      ${renderGrid(listData.posts)}
      ${renderSimchaPagination(listData.page, listData.totalPages, query)}
    </div>
  `;
  I18N.apply();
  setPageTitle('Simchas', 'Browse recent simcha announcements on JListings.');

  document.getElementById('filtersForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    Router.navigate(`/simchas?${qs(next)}`);
  });
}

function renderSimchaPagination(page, totalPages, query) {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination">';
  for (let p = 1; p <= totalPages; p++) {
    html += `<a href="/simchas?${qs({ ...query, page: p })}" class="${p === page ? 'active' : ''}">${p}</a>`;
  }
  html += '</div>';
  return html;
}
