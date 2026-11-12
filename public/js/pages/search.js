async function renderSearchPage({ query }) {
  const q = query.q || '';
  const cityTop = (query.city || '').trim();
  document.getElementById('app').innerHTML = `<div class="container"><p class="hint">Searching…</p></div>`;
  if (!q.trim() && !cityTop) {
    document.getElementById('app').innerHTML = `<div class="container"><h1 data-i18n="search_results">Search Results</h1><p class="empty-state">${I18N.t('no_results')}</p></div>`;
    I18N.apply();
    setPageTitle('Search');
    return;
  }

  // Optional: only one section (the home search's "Search in"), and a place.
  const only = ['classifieds', 'listings', 'editorials'].includes(query.only) ? query.only : '';
  const city = query.city || '';
  const none = { posts: [], total: 0 };
  const [classifieds, listings, editorials, simchas] = await Promise.all([
    !only || only === 'classifieds' ? Api.classifieds({ q, city, pageSize: 12 }) : none,
    !only || only === 'listings' ? Api.listings({ q, city, pageSize: 12 }) : none,
    !only || only === 'editorials' ? Api.editorials({ q, pageSize: 6 }) : none,
    !only && Api.simchasOn() ? Api.simchas({ q, pageSize: 12 }) : none,
  ]);

  const totalResults = classifieds.total + listings.total + editorials.total + simchas.total;
  Analytics.track('se', 'search', { v: totalResults, p: location.pathname, x: { q: q.trim().toLowerCase().slice(0, 60) } });

  document.getElementById('app').innerHTML = `
    <div class="container">
      <h1 data-i18n="search_results">Search Results</h1>
      <p class="sub" style="color:var(--ink-soft)">"${escapeHtml(q)}"${city ? ` in ${escapeHtml(city)}` : ''}${only ? ` · ${only}` : ''} — ${totalResults} ${I18N.t('results')}</p>

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

      ${editorials.posts.length ? `
        <div class="section-heading">
          <h2>Editorials</h2>
          <a href="/editorials?q=${encodeURIComponent(q)}">View All Editorials</a>
        </div>
        <div class="editorial-grid">${editorials.posts.map((ed) => editorialCardHtml(ed)).join('')}</div>
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
