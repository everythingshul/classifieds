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
          <select name="taxonomyId"><option value="">Any</option>${simchaTaxonomies.map((t) => `<option value="${t.id}" ${String(query.taxonomyId) === String(t.id) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label data-i18n="location">City</label><input type="text" name="city" value="${escapeHtml(query.city || '')}"></div>
        <div class="field"><label>From</label><input type="date" name="dateFrom" value="${escapeHtml(query.dateFrom || '')}"></div>
        <div class="field"><label>To</label><input type="date" name="dateTo" value="${escapeHtml(query.dateTo || '')}"></div>
        <button class="btn btn-sm" type="button" id="nearMeBtn">Near Me</button>
        <button class="btn btn-sm" type="submit" data-i18n="filter">Filter</button>
      </form>

      <div class="results-grid">${listData.posts.map(postCardHtml).join('') || `<p class="empty-state">${I18N.t('no_results')}</p>`}</div>
      ${renderSimchaPagination(listData.page, listData.totalPages, query)}
    </div>
  `;
  I18N.apply();

  document.getElementById('filtersForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    Router.navigate(`/simchas?${qs(next)}`);
  });
  document.getElementById('nearMeBtn').addEventListener('click', async () => {
    const loc = await getBrowserLocation();
    if (!loc) return toast('Location access denied or unavailable');
    Router.navigate(`/simchas?${qs({ ...query, lat: loc.lat, lng: loc.lng, radius: 25 })}`);
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
