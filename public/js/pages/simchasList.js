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
