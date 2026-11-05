// Strips emoji / pictographic symbols from search input as the user types.
const EMOJI_STRIP_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
function stripEmoji(str) {
  return String(str || '').replace(EMOJI_STRIP_RE, '');
}

// Registered once (not inside renderLayout/wireSiteSearch, which re-run on
// every language toggle) - looks up the live form each time instead of
// closing over a specific render's now-possibly-detached element.
document.addEventListener('click', (e) => {
  const form = document.getElementById('siteSearchForm');
  if (form && !form.contains(e.target)) document.getElementById('siteSearchDropdown')?.remove();
});

function renderLayout(siteName) {
  document.getElementById('layout').innerHTML = `
    <header class="site-header">
      <div class="container">
        <button class="hamburger" id="hamburgerBtn" aria-label="Menu"><span></span><span></span><span></span></button>
        <a href="/" class="brand">
          <img src="/img/logo.png" alt="${escapeHtml(siteName)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline'">
          <span class="brand-fallback" style="display:none">${escapeHtml(siteName)}</span>
        </a>
        <nav class="main-nav" id="mainNav">
          <a href="/" data-i18n="nav_home">Home</a>
          <a href="/classifieds" data-i18n="nav_classifieds">Classifieds</a>
          <a href="/listings" data-i18n="nav_listings">Listings</a>
          <a href="/simchas" data-i18n="nav_simchas">Simchas</a>
          <a href="/editorials" class="nav-editorials"><span data-i18n="nav_editorials">Editorials</span> <span class="badge-new-pill" data-i18n="badge_new">${I18N.t('badge_new')}</span></a>
          <a href="/bookmarks" data-i18n="nav_bookmarks">Bookmarks</a>
          <a href="/subscribe" class="nav-subscribe"><span class="nav-subscribe-icon" aria-hidden="true">✉</span> <span data-i18n="subscribe_nav">Email Updates</span></a>
        </nav>
        <form class="site-search" id="siteSearchForm">
          <input type="search" id="siteSearchInput" name="q" data-i18n-placeholder="search_everything" placeholder="${I18N.t('search_everything')}" autocomplete="off">
        </form>
        <div class="header-actions">
          <button class="lang-toggle" id="langToggle" data-i18n="lang_toggle">עברית</button>
          <a class="btn-post" href="/post" data-i18n="nav_post">Post an Ad</a>
        </div>
      </div>
    </header>
    <div class="container"><div id="topBannerSlot" style="display:none"></div></div>
    <main id="app"></main>
    <footer class="site-footer">
      <div class="container footer-row">
        <div>
          <div class="footer-links">
            <a href="/subscribe" data-i18n="subscribe_nav">Email Updates</a>
            <a href="/contact" data-i18n="contact_us">Contact Us</a>
            <a href="/terms" data-i18n="terms">Terms &amp; Conditions</a>
            <a href="/refund-policy" data-i18n="refund_policy">Refund Policy</a>
            <a href="/privacy-policy" data-i18n="privacy_policy">Privacy Policy</a>
          </div>
          <div>&copy; ${new Date().getFullYear()} ${escapeHtml(siteName)}</div>
        </div>
        <img class="footer-logo" src="/img/logo.png" onerror="this.style.display='none'" alt="${escapeHtml(siteName)}">
      </div>
    </footer>
  `;

  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('mainNav').classList.toggle('open');
    document.getElementById('hamburgerBtn').classList.toggle('open');
  });
  document.getElementById('langToggle').addEventListener('click', () => {
    I18N.set(I18N.get() === 'he' ? 'en' : 'he');
    renderLayout(siteName);
    Router.resolve();
  });

  wireSiteSearch();
  I18N.apply();
}

// Live-as-you-type results dropdown under the header search box, so visitors
// see what's actually posted before committing to the full /search page.
function wireSiteSearch() {
  const form = document.getElementById('siteSearchForm');
  const searchInput = document.getElementById('siteSearchInput');
  let searchToken = 0;

  function closeDropdown() {
    document.getElementById('siteSearchDropdown')?.remove();
  }

  function showDropdown(html) {
    closeDropdown();
    const dd = document.createElement('div');
    dd.className = 'search-dd';
    dd.id = 'siteSearchDropdown';
    dd.innerHTML = html;
    form.appendChild(dd);
  }

  async function runLiveSearch(q) {
    const myToken = ++searchToken;
    showDropdown(`<div class="search-dd-loading">${I18N.t('searching')}</div>`);
    let classifieds, listings, simchas;
    try {
      [classifieds, listings, simchas] = await Promise.all([
        Api.classifieds({ q, pageSize: 4 }),
        Api.listings({ q, pageSize: 4 }),
        Api.simchas({ q, pageSize: 3 }),
      ]);
    } catch (e) {
      if (myToken === searchToken) closeDropdown();
      return;
    }
    if (myToken !== searchToken || searchInput.value.trim() !== q) return; // a newer keystroke superseded this

    const groups = [
      { label: I18N.t('nav_classifieds'), posts: classifieds.posts },
      { label: I18N.t('nav_listings'), posts: listings.posts },
      { label: I18N.t('nav_simchas'), posts: simchas.posts },
    ].filter((g) => g.posts.length);
    const total = classifieds.total + listings.total + simchas.total;

    if (!groups.length) {
      showDropdown(`<div class="search-dd-empty">${I18N.t('no_results')}</div>`);
      return;
    }
    const groupsHtml = groups.map((g) => `
      <div class="search-dd-group">
        <div class="search-dd-group-label">${escapeHtml(g.label)}</div>
        ${g.posts.map((p) => `
          <a class="search-dd-item" href="${postUrl(p)}">
            <span class="search-dd-item-title">${escapeHtml(p.title)}</span>
            <span class="search-dd-item-meta">${escapeHtml(categoryLabelFor(p))}</span>
          </a>
        `).join('')}
      </div>
    `).join('');
    showDropdown(`${groupsHtml}<a class="search-dd-seeall" href="/search?q=${encodeURIComponent(q)}">${I18N.t('view_all')} (${total} ${I18N.t('results')})</a>`);
  }

  const debouncedSearch = debounce((q) => {
    if (q.length < 2) { closeDropdown(); return; }
    runLiveSearch(q);
  }, 300);

  searchInput.addEventListener('input', () => {
    const clean = stripEmoji(searchInput.value);
    if (clean !== searchInput.value) searchInput.value = clean;
    const q = searchInput.value.trim();
    if (!q) { closeDropdown(); return; }
    debouncedSearch(q);
  });
  searchInput.addEventListener('focus', () => {
    const q = searchInput.value.trim();
    if (q.length >= 2 && !document.getElementById('siteSearchDropdown')) runLiveSearch(q);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = stripEmoji(searchInput.value).trim();
    closeDropdown();
    if (q) Router.navigate(`/search?q=${encodeURIComponent(q)}`);
  });
  // A dropdown result/See-all link navigates via Router's own delegated
  // click handler (router.js) - just close the dropdown so it doesn't
  // linger over whatever page renders next.
  form.addEventListener('click', (e) => {
    if (e.target.closest('.search-dd-item, .search-dd-seeall')) closeDropdown();
  });
}
