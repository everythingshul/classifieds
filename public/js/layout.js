function renderLayout(siteName) {
  document.getElementById('layout').innerHTML = `
    <header class="site-header">
      <div class="container">
        <button class="hamburger" id="hamburgerBtn" aria-label="Menu">&#9776;</button>
        <a href="/" class="brand"><img src="/img/logo.png" onerror="this.style.display='none'" alt="">${escapeHtml(siteName)}</a>
        <nav class="main-nav" id="mainNav">
          <a href="/" data-i18n="nav_home">Home</a>
          <a href="/classifieds" data-i18n="nav_classifieds">Classifieds</a>
          <a href="/simchas" data-i18n="nav_simchas">Simchas</a>
          <a href="/bookmarks" data-i18n="nav_bookmarks">Bookmarks</a>
        </nav>
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
  I18N.apply();
}
