async function renderListingsListPage({ query }) {
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
          ${pills.map((p) => `<a href="/listings${p.key ? `?category=${p.key}` : ''}" class="${p.key === category ? 'active' : ''}">${escapeHtml(p.label)} <span class="count">(${p.count})</span></a>`).join('')}
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

  document.getElementById('filtersForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = { category };
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
    html += `<a href="/listings?${qs({ category, page: p })}" class="${p === page ? 'active' : ''}">${p}</a>`;
  }
  html += '</div>';
  return html;
}
