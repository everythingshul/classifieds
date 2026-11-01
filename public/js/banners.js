// Admin-managed clickable ad/promo banners (top-of-page + sidebar), shown
// per the page zones each one was targeted to in the admin portal. A slot
// with nothing active for the current page/position renders nothing at all
// - no empty placeholder box.
const Banners = (() => {
  function zoneForPath(pathname) {
    if (pathname === '/') return 'home';
    if (pathname.startsWith('/classifieds')) return 'classifieds';
    if (pathname.startsWith('/listings')) return 'listings';
    if (pathname.startsWith('/simchas')) return 'simchas';
    if (pathname.startsWith('/editorials')) return 'editorials';
    if (pathname.startsWith('/post')) return 'post';
    if (pathname.startsWith('/search')) return 'search';
    if (pathname.startsWith('/bookmarks')) return 'bookmarks';
    return null; // terms/refund-policy/contact/subscribe - no banner zone
  }

  function bannerHtml(b) {
    return `<a class="site-banner" href="${b.linkUrl}" data-banner-id="${b.id}" target="${/^https?:\/\//i.test(b.linkUrl) ? '_blank' : '_self'}" rel="noopener"><img src="${b.imageUrl}" alt="" loading="lazy"></a>`;
  }

  function render(container, banners) {
    if (!banners.length) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }
    container.style.display = '';
    container.innerHTML = banners.map(bannerHtml).join('');
    Api.registerBannerImpressions(banners.map((b) => b.id));
    container.querySelectorAll('.site-banner').forEach((el) => {
      el.addEventListener('click', () => Api.registerBannerClicks([el.dataset.bannerId]));
    });
  }

  async function refreshTop(zone) {
    const container = document.getElementById('topBannerSlot');
    if (!container) return;
    if (!zone) { container.innerHTML = ''; container.style.display = 'none'; return; }
    try {
      const { top } = await Api.banners(zone);
      render(container, top);
    } catch (e) { container.innerHTML = ''; container.style.display = 'none'; }
  }

  async function renderSidebar(zone, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const { sidebar } = await Api.banners(zone);
      render(container, sidebar);
    } catch (e) { container.innerHTML = ''; container.style.display = 'none'; }
  }

  return { zoneForPath, refreshTop, renderSidebar };
})();
