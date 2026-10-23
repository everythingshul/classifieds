const AdminRouter = (() => {
  const routes = {};
  function add(hash, fn) { routes[hash] = fn; }
  function current() { return (window.location.hash || '#/dashboard').split('?')[0]; }
  function query() {
    const q = window.location.hash.split('?')[1];
    return Object.fromEntries(new URLSearchParams(q || ''));
  }
  async function resolve() {
    if (!AdminApi.token() && current() !== '#/login') { window.location.hash = '#/login'; return; }
    if (AdminApi.token() && current() === '#/login') { window.location.hash = '#/dashboard'; return; }
    renderShell();
    const fn = routes[current()] || routes['#/dashboard'];
    const root = document.getElementById('adminContent');
    root.innerHTML = '<div class="spinner">Loading…</div>';
    try {
      await fn(query());
    } catch (e) {
      root.innerHTML = `<div class="error-list">${escapeHtml(e.message)}</div>`;
    }
    highlightNav();
    closeMobileNav();
    if (typeof refreshNotificationBadges === 'function') refreshNotificationBadges();
  }
  function init() {
    window.addEventListener('hashchange', resolve);
    resolve();
  }
  function highlightNav() {
    document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === current()));
  }
  return { add, resolve, init, current, query };
})();

const ADMIN_NAV_ITEMS = [
  { href: '#/dashboard', label: 'Dashboard', badge: 'badge-dashboard' },
  { href: '#/analytics', label: 'Analytics' },
  { href: '#/new-post', label: '+ New Post' },
  { href: '#/moderation', label: 'Moderation', badge: 'badge-moderation' },
  { href: '#/posts', label: 'All Posts' },
  { href: '#/editorials', label: 'Editorials', badge: 'badge-editorials' },
  { href: '#/contact-messages', label: 'Messages', badge: 'badge-contact' },
  { href: '#/crm', label: 'CRM Search' },
  { href: '#/categories', label: 'Categories' },
  { href: '#/pricing', label: 'Pricing' },
  { href: '#/settings', label: 'Settings' },
];

function renderShell() {
  if (AdminApi.token()) {
    if (!document.getElementById('adminShell')) {
      document.getElementById('adminRoot').innerHTML = `
        <div id="adminShell">
          <header class="app-header">
            <button class="header-menu-btn" id="hamburgerBtn" aria-label="Menu">&#9776;</button>
            <div class="brand">
              <img src="/img/logo.png" onerror="this.style.display='none'" alt="">
              <span class="brand-name">Admin<span>JListings</span></span>
            </div>
            <nav id="top-nav">
              ${ADMIN_NAV_ITEMS.map((item) => `<a class="nav-item" href="${item.href}">${escapeHtml(item.label)}${item.badge ? ` <span class="nav-badge" id="${item.badge}" style="display:none"></span>` : ''}</a>`).join('')}
            </nav>
            <div class="header-right">
              <div class="header-user">
                <button id="logoutBtn">Log Out</button>
              </div>
            </div>
          </header>
          <div class="mobile-nav-overlay" id="mobileNavOverlay"></div>
          <main class="admin-page"><div id="adminContent"></div></main>
        </div>`;
      document.getElementById('logoutBtn').addEventListener('click', () => {
        AdminApi.setToken(null);
        window.location.hash = '#/login';
      });
      document.getElementById('hamburgerBtn').addEventListener('click', toggleMobileNav);
      document.getElementById('mobileNavOverlay').addEventListener('click', closeMobileNav);
      startNotificationPolling();
    }
  } else {
    closeMobileNav();
    document.getElementById('adminRoot').innerHTML = `<div id="adminContent"></div>`;
  }
}

function toggleMobileNav() {
  document.getElementById('top-nav').classList.toggle('mob-open');
  document.getElementById('mobileNavOverlay').classList.toggle('show');
}
function closeMobileNav() {
  document.getElementById('top-nav')?.classList.remove('mob-open');
  document.getElementById('mobileNavOverlay')?.classList.remove('show');
}

let _notifPollTimer = null;
function startNotificationPolling() {
  refreshNotificationBadges();
  if (_notifPollTimer) clearInterval(_notifPollTimer);
  _notifPollTimer = setInterval(refreshNotificationBadges, 60000);
}

async function refreshNotificationBadges() {
  if (!AdminApi.token()) return;
  let summary;
  try {
    summary = await AdminApi.notificationSummary();
  } catch (e) {
    return;
  }
  const setBadge = (id, count) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = count > 99 ? '99+' : String(count); el.style.display = 'inline-block'; }
    else { el.style.display = 'none'; }
  };
  setBadge('badge-dashboard', (summary.reports || 0) + (summary.pendingApproval || 0));
  setBadge('badge-moderation', (summary.pendingApproval || 0) + (summary.pendingUrlApproval || 0));
  setBadge('badge-contact', summary.contactMessages || 0);
  setBadge('badge-editorials', (summary.pendingEditorials || 0) + (summary.pendingEditorialComments || 0));
  const totalUnread = (summary.reports || 0) + (summary.pendingApproval || 0) + (summary.pendingUrlApproval || 0) + (summary.contactMessages || 0)
    + (summary.pendingEditorials || 0) + (summary.pendingEditorialComments || 0);
  document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) Admin — JListings` : 'Admin — JListings';
}

document.addEventListener('DOMContentLoaded', () => {
  AdminRouter.add('#/login', renderLoginPage);
  AdminRouter.add('#/dashboard', renderDashboardPage);
  AdminRouter.add('#/analytics', renderAnalyticsPage);
  AdminRouter.add('#/new-post', renderCreatePostPage);
  AdminRouter.add('#/moderation', renderModerationPage);
  AdminRouter.add('#/posts', renderPostsPage);
  AdminRouter.add('#/editorials', renderEditorialsPage);
  AdminRouter.add('#/editorials/new', renderCreateEditorialPage);
  AdminRouter.add('#/contact-messages', renderContactMessagesPage);
  AdminRouter.add('#/crm', renderCrmPage);
  AdminRouter.add('#/categories', renderCategoriesPage);
  AdminRouter.add('#/pricing', renderPricingPage);
  AdminRouter.add('#/settings', renderSettingsPage);
  AdminRouter.init();
});
