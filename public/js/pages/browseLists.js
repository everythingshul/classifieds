// Browse/list pages for the three core post types - one function set
// per type, grouped into a single file since each is a small, similar
// filter-form + grid + pagination pattern.

// Reports a typed search (the Search and City boxes on the browse pages) to
// the admin Analytics page - first page of results only, so paging through
// them doesn't count as searching again.
function trackFilterSearch(section, query, page, total) {
  if (page !== 1 || typeof Analytics === 'undefined') return;
  const q = [query.q, query.city].filter(Boolean).join(' in ').trim().toLowerCase().slice(0, 60);
  if (q) Analytics.track('se', section, { v: total, p: location.pathname, x: { q, c: query.category || '' } });
}

async function renderClassifiedsListPage({ query }) {
  const cfg = window.SITE_CONFIG;
  const category = query.category || '';
  const page = parseInt(query.page, 10) || 1;
  const catDef = cfg.categories.find((c) => c.key === category);

  const params = { ...query, page };
  const [listData] = await Promise.all([Api.classifieds(params)]);
  trackFilterSearch('classifieds', query, page, listData.total);

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

const LISTING_CAT_ACCENTS = ['navy', 'gold', 'cta', 'success'];

// Icons are matched to the category by keyword so the chooser grid shows
// something that actually fits the trade (a wrench for plumbers, a bolt
// for electricians, etc.) instead of one generic picture for everything.
// Anything that doesn't match a keyword gets a neutral storefront icon -
// never a literal picture that would be wrong for most categories.
const LISTING_CAT_ICON_RULES = [
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l1.4-1.4a3.5 3.5 0 0 1-4.6 4.6L5 22l-2-2 9.5-9.5a3.5 3.5 0 0 1 4.6-4.6l-1.4 1.4Z"/></svg>', words: ['plumb'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>', words: ['electric'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V2M8 2v6M11 2v6M14 2v6M9 12v10"/></svg>', words: ['restaurant', 'food', 'cater', 'bakery', 'bakeri', 'pizza', 'grocer', 'butcher'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.5-2 2-4 2-6a5 5 0 0 0-9-3 5 5 0 0 0-9 3c0 2 .5 4 2 6 2 2.5 7 6.5 7 6.5S17 16.5 19 14Z"/></svg>', words: ['doctor', 'medical', 'health', 'dentist', 'dental', 'clinic', 'therap', 'wellness'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M6 7l-3 6a3 3 0 0 0 6 0l-3-6ZM18 7l-3 6a3 3 0 0 0 6 0l-3-6ZM4 21h16M3 7h18"/></svg>', words: ['lawyer', 'legal', 'attorney', 'notary'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M12 10h2M16 10h2M8 14h2M12 14h2M16 14h2M8 18h2M12 18h2M16 18h2"/></svg>', words: ['account', 'bookkeep', 'tax', 'cpa', 'finan'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9 20v-6h6v6"/></svg>', words: ['real estate', 'realtor', 'realty', 'property', 'mortgage'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15c3-5 15-5 18 0M5 11 3 4l5 2M19 11l2-7-5 2M9 15v4M15 15v4"/></svg>', words: ['clean', 'maid', 'janitor'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12 3.5 23.5 2 22 13 11M12.5 7.5 17 3l4 4-4.5 4.5M16 8l2 2"/></svg>', words: ['contract', 'construct', 'renovat', 'handyman', 'builder', 'remodel'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/></svg>', words: ['photo', 'video', 'film'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.5 15.5M8.5 8.5 20 20"/></svg>', words: ['beauty', 'salon', 'hair', 'barber', 'spa', 'nail'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11 7 5h10l2 6M3 11h18v6a1 1 0 0 1-1 1h-2v-2H6v2H4a1 1 0 0 1-1-1v-6Z"/><circle cx="7.5" cy="14.5" r="1"/><circle cx="16.5" cy="14.5" r="1"/></svg>', words: ['automotive', 'mechanic', 'auto repair', 'car repair', 'tires', 'tire'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z"/></svg>', words: ['tutor', 'education', 'school', 'learning'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M2 20h20M8 20l1-4M16 20l-1-4"/></svg>', words: ['computer', 'tech', 'web', 'software', 'it support', 'it services'] },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>', words: ['event', 'wedding', 'party', 'planner'] },
];
const LISTING_CAT_ICON_FALLBACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v4H4V4ZM4 10h16v10H4V10Z"/><path d="M9 14h6"/></svg>';

function iconForListingCategory(cat) {
  // Every category created from here on gets its own AI-generated icon
  // (see services/taxonomy.js's createListingCategory) - the keyword rules
  // below are only a fallback for a category whose icon hasn't generated
  // yet, or failed to.
  if (cat.icon) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${cat.icon}</svg>`;
  }
  const haystack = `${cat.key} ${cat.label}`.toLowerCase();
  const rule = LISTING_CAT_ICON_RULES.find((r) => r.words.some((w) => haystack.includes(w)));
  return rule ? rule.icon : LISTING_CAT_ICON_FALLBACK;
}

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
              <span class="listing-cat-icon accent-${LISTING_CAT_ACCENTS[i % LISTING_CAT_ACCENTS.length]}">${iconForListingCategory(c)}</span>
              <span class="cat-name">${escapeHtml(heb && c.labelHe ? c.labelHe : c.label)}</span>
              <span class="cat-count">${counts[c.key]} ${counts[c.key] === 1 ? 'business' : 'businesses'}</span>
            </a>
          `).join('')}
          <a class="listing-cat-card listing-cat-viewall" href="/listings?all=1">
            <span class="listing-cat-icon accent-navy">${LISTING_CAT_ICON_FALLBACK}</span>
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

// Only the geo filter params, pulled out of the current query so every
// link on the page (category pills, pagination, the filters form) can
// carry the visitor's chosen location forward instead of losing it the
// moment they click anything else.
function listingLocParams(query) {
  if (query.lat && query.lng) {
    return { lat: query.lat, lng: query.lng, radius: query.radius || 25, locLabel: query.locLabel || '' };
  }
  if (query.loc === 'all') return { loc: 'all' };
  return {};
}

// Shown right after picking a category (and not yet again once a location
// or "show me everywhere" has been chosen for it) - narrows results to
// nearby businesses first, since "which plumber" usually means "which
// plumber near me", not every plumber on the whole site.
async function renderListingLocationChooser(catDef, category) {
  const heb = I18N.get() === 'he';
  const label = catDef ? (heb && catDef.labelHe ? catDef.labelHe : catDef.label) : '';

  document.getElementById('app').innerHTML = `
    <div class="container" style="max-width:520px;padding:40px 0">
      <div class="page-header">
        <a href="/listings" class="back-link">&larr; Choose a different category</a>
        <h1>Where are you looking for ${escapeHtml(label)}?</h1>
        <p class="sub" style="color:var(--ink-soft)">We'll show you the closest businesses first.</p>
      </div>
      <div class="loc-step-actions">
        <button type="button" class="btn" id="locStepMyLoc">${LOCATION_PIN_ICON} Use my current location</button>
        <form id="locStepForm" class="loc-step-form" autocomplete="off">
          <input type="text" id="locStepInput" placeholder="Enter a city or zip code">
          <button class="btn btn-outline" type="submit">Go</button>
        </form>
        <a href="/listings?${qs({ category, loc: 'all' })}" class="loc-step-skip">Show me everywhere</a>
      </div>
    </div>
  `;
  I18N.apply();
  setPageTitle(label ? `${label} Listings` : 'Listings');

  const goTo = (extra) => {
    if (typeof Analytics !== 'undefined') Analytics.track('lc', 'listings', { x: { l: String(extra.locLabel || '').slice(0, 60), c: category } });
    Router.navigate(`/listings?${qs({ category, ...extra })}`);
  };

  document.getElementById('locStepMyLoc').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Finding you…';
    const loc = await getBrowserLocation();
    if (!loc) {
      toast("Couldn't get your location - try entering a city or zip code instead.");
      btn.disabled = false;
      btn.innerHTML = `${LOCATION_PIN_ICON} Use my current location`;
      return;
    }
    goTo({ lat: loc.lat, lng: loc.lng, radius: 25, locLabel: 'your location' });
  });

  document.getElementById('locStepForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('locStepInput');
    const q = input.value.trim();
    if (!q) return;
    const result = await geocodeZipOrCity(q);
    if (!result) {
      toast("Couldn't find that location - try a different city or zip code.");
      return;
    }
    goTo({ lat: result.lat, lng: result.lng, radius: 25, locLabel: result.label });
  });
}

async function renderListingsListPage({ query }) {
  if (!query.category && !query.all) return renderListingCategoryChooser();

  const cfg = window.SITE_CONFIG;
  const category = query.category || '';
  const catDef = cfg.listingCategories.find((c) => c.key === category);

  if (category && !query.lat && query.loc !== 'all') {
    return renderListingLocationChooser(catDef, category);
  }

  const page = parseInt(query.page, 10) || 1;
  const locParams = listingLocParams(query);

  const params = { ...query, page };
  const [listData] = await Promise.all([Api.listings(params)]);
  trackFilterSearch('listings', query, page, listData.total);

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="page-header">
        <h1>${catDef ? escapeHtml(I18N.get() === 'he' ? catDef.labelHe : catDef.label) : escapeHtml(I18N.t('view_all_listings'))}</h1>
        <a href="/listings" class="back-link">&larr; Choose a different category</a>
        ${locParams.lat ? `
          <p class="loc-active-note">
            ${LOCATION_PIN_ICON} Near ${escapeHtml(locParams.locLabel || 'your area')}
            · <a href="/listings?${qs({ category })}">Change</a>
            · <a href="/listings?${qs({ category, loc: 'all' })}">Show everywhere</a>
          </p>` : ''}
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

      ${renderListingsPagination(listData.page, listData.totalPages, category, locParams)}
    </div>
  `;
  I18N.apply();
  setPageTitle(catDef ? (I18N.get() === 'he' ? catDef.labelHe : catDef.label) : 'Listings', catDef ? `${catDef.label} listings on JListings.` : 'Browse all community listings on JListings.');

  document.getElementById('filtersForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = category ? { category, ...locParams } : { all: 1, ...locParams };
    for (const [k, v] of fd.entries()) if (v) next[k] = v;
    Router.navigate(`/listings?${qs(next)}`);
  });
}

function renderListingsPagination(page, totalPages, category, locParams) {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination">';
  for (let p = 1; p <= totalPages; p++) {
    if (p !== 1 && p !== totalPages && Math.abs(p - page) > 2) {
      if (p === page - 3 || p === page + 3) html += '<span>…</span>';
      continue;
    }
    html += `<a href="/listings?${qs(category ? { category, page: p, ...locParams } : { all: 1, page: p, ...locParams })}" class="${p === page ? 'active' : ''}">${p}</a>`;
  }
  html += '</div>';
  return html;
}

async function renderSimchasListPage({ query }) {
  const cfg = window.SITE_CONFIG;
  const page = parseInt(query.page, 10) || 1;
  const simchaTaxonomies = cfg.taxonomies.filter((t) => t.grp === 'simcha');

  const listData = await Api.simchas({ ...query, page });
  trackFilterSearch('simchas', query, page, listData.total);

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
