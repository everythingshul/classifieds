(async function bootstrap() {
  try {
    window.SITE_CONFIG = await Api.config();
  } catch (e) {
    document.getElementById('layout').innerHTML = `<div class="container"><p class="error-list">Failed to load site configuration. Please refresh the page.</p></div>`;
    console.error(e);
    return;
  }

  renderLayout(window.SITE_CONFIG.siteName);

  Router.add('/', renderHomePage);
  Router.add('/classifieds', renderClassifiedsListPage);
  Router.add('/classifieds/:id', ({ id }) => renderDetailPage(id, 'classified'));
  Router.add('/listings', renderListingsListPage);
  Router.add('/listings/:id', ({ id }) => renderDetailPage(id, 'listing'));
  Router.add('/simchas', renderSimchasListPage);
  Router.add('/simchas/:id', ({ id }) => renderDetailPage(id, 'simcha'));
  Router.add('/search', renderSearchPage);
  Router.add('/post', renderPostWizard);
  Router.add('/bookmarks', renderBookmarksPage);
  Router.add('/terms', renderTermsPage);
  Router.add('/refund-policy', renderRefundPolicyPage);
  Router.add('/contact', renderContactPage);

  Router.init();
})();
