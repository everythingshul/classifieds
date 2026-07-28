// Strips emoji / pictographic symbols from search input as the user types.
const EMOJI_STRIP_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
function stripEmoji(str) {
  return String(str || '').replace(EMOJI_STRIP_RE, '');
}

function renderLayout(siteName) {
  document.getElementById('layout').innerHTML = `
    <header class="site-header">
      <div class="container">
        <button class="hamburger" id="hamburgerBtn" aria-label="Menu"><span></span><span></span><span></span></button>
        <a href="/" class="brand"><img src="/img/logo.png" onerror="this.style.display='none'" alt="">${escapeHtml(siteName)}</a>
        <nav class="main-nav" id="mainNav">
          <a href="/" data-i18n="nav_home">Home</a>
          <a href="/classifieds" data-i18n="nav_classifieds">Classifieds</a>
          <a href="/listings" data-i18n="nav_listings">Listings</a>
          <a href="/simchas" data-i18n="nav_simchas">Simchas</a>
          <a href="/bookmarks" data-i18n="nav_bookmarks">Bookmarks</a>
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
    <main id="app"></main>
    <footer class="site-footer">
      <div class="container">
        <div class="footer-links">
          <a href="/contact" data-i18n="contact_us">Contact Us</a>
          <a href="/terms" data-i18n="terms">Terms &amp; Conditions</a>
          <a href="/refund-policy" data-i18n="refund_policy">Refund Policy</a>
        </div>
        <div>&copy; ${new Date().getFullYear()} ${escapeHtml(siteName)}</div>
      </div>
    </footer>
  `;

  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('mainNav').classList.toggle('open');
  });
  document.getElementById('langToggle').addEventListener('click', () => {
    I18N.set(I18N.get() === 'he' ? 'en' : 'he');
    renderLayout(siteName);
    Router.resolve();
  });

  const searchInput = document.getElementById('siteSearchInput');
  searchInput.addEventListener('input', () => {
    const clean = stripEmoji(searchInput.value);
    if (clean !== searchInput.value) searchInput.value = clean;
  });
  document.getElementById('siteSearchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = stripEmoji(searchInput.value).trim();
    if (q) Router.navigate(`/search?q=${encodeURIComponent(q)}`);
  });

  I18N.apply();
}
