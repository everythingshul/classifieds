async function renderSearchPage({ query }) {
  const q = query.q || '';
  document.getElementById('app').innerHTML = `<div class="container"><p class="hint">Searching…</p></div>`;
  if (!q.trim()) {
    document.getElementById('app').innerHTML = `<div class="container"><h1 data-i18n="search_results">Search Results</h1><p class="empty-state">${I18N.t('no_results')}</p></div>`;
    I18N.apply();
    setPageTitle('Search');
    return;
  }

  const [classifieds, listings, simchas] = await Promise.all([
    Api.classifieds({ q, pageSize: 12 }),
    Api.listings({ q, pageSize: 12 }),
    Api.simchas({ q, pageSize: 12 }),
  ]);

  const totalResults = classifieds.total + listings.total + simchas.total;

  document.getElementById('app').innerHTML = `
    <div class="container">
      <h1 data-i18n="search_results">Search Results</h1>
      <p class="sub" style="color:var(--ink-soft)">"${escapeHtml(q)}" — ${totalResults} ${I18N.t('results')}</p>

      ${classifieds.posts.length ? `
        <div class="section-heading">
          <h2 data-i18n="recent_classifieds">Classifieds</h2>
          <a href="/classifieds?q=${encodeURIComponent(q)}" data-i18n="view_all_classifieds">View All Classifieds</a>
        </div>
        ${renderGrid(classifieds.posts)}
      ` : ''}

      ${listings.posts.length ? `
        <div class="section-heading">
          <h2 data-i18n="recent_listings">Listings</h2>
          <a href="/listings?q=${encodeURIComponent(q)}" data-i18n="view_all_listings">View All Listings</a>
        </div>
        ${renderGrid(listings.posts)}
      ` : ''}

      ${simchas.posts.length ? `
        <div class="section-heading">
          <h2 data-i18n="recent_simchas">Simchas</h2>
          <a href="/simchas?q=${encodeURIComponent(q)}" data-i18n="view_all_simchas">View All Simchas</a>
        </div>
        ${renderGrid(simchas.posts)}
      ` : ''}

      ${totalResults === 0 ? `<p class="empty-state">${I18N.t('no_results')}</p>` : ''}
    </div>
  `;
  I18N.apply();
  setPageTitle(`Search: "${q}"`);
}
