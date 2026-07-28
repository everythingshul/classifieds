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
    highlightSidebar();
    if (typeof refreshNotificationBadges === 'function') refreshNotificationBadges();
  }
  function init() {
    window.addEventListener('hashchange', resolve);
    resolve();
  }
  function highlightSidebar() {
    document.querySelectorAll('.admin-sidebar a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === current()));
  }
  return { add, resolve, init, current, query };
})();

function renderShell() {
  if (AdminApi.token()) {
    if (!document.getElementById('adminShell')) {
      document.getElementById('adminRoot').innerHTML = `
        <div class="admin-shell" id="adminShell">
          <aside class="admin-sidebar">
            <div class="brand">Admin Portal</div>
            <a href="#/dashboard">Dashboard <span class="nav-badge" id="badge-dashboard" style="display:none"></span></a>
            <a href="#/new-post">+ New Post</a>
            <a href="#/moderation">Moderation Queue <span class="nav-badge" id="badge-moderation" style="display:none"></span></a>
            <a href="#/posts">All Posts</a>
            <a href="#/contact-messages">Contact Messages <span class="nav-badge" id="badge-contact" style="display:none"></span></a>
            <a href="#/crm">CRM Search</a>
            <a href="#/categories">Categories</a>
            <a href="#/pricing">Pricing</a>
            <a href="#/settings">Settings</a>
          </aside>
          <div class="admin-main">
            <div class="admin-topbar">
              <div></div>
              <button id="logoutBtn">Log Out</button>
            </div>
            <div id="adminContent"></div>
          </div>
        </div>`;
      document.getElementById('logoutBtn').addEventListener('click', () => {
        AdminApi.setToken(null);
        window.location.hash = '#/login';
      });
      startNotificationPolling();
    }
  } else {
    document.getElementById('adminRoot').innerHTML = `<div id="adminContent"></div>`;
  }
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
  const totalUnread = (summary.reports || 0) + (summary.pendingApproval || 0) + (summary.pendingUrlApproval || 0) + (summary.contactMessages || 0);
  document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) Admin — JListings` : 'Admin — JListings';
}

document.addEventListener('DOMContentLoaded', () => {
  AdminRouter.add('#/login', renderLoginPage);
  AdminRouter.add('#/dashboard', renderDashboardPage);
  AdminRouter.add('#/new-post', renderCreatePostPage);
  AdminRouter.add('#/moderation', renderModerationPage);
  AdminRouter.add('#/posts', renderPostsPage);
  AdminRouter.add('#/contact-messages', renderContactMessagesPage);
  AdminRouter.add('#/crm', renderCrmPage);
  AdminRouter.add('#/categories', renderCategoriesPage);
  AdminRouter.add('#/pricing', renderPricingPage);
  AdminRouter.add('#/settings', renderSettingsPage);
  AdminRouter.init();
});
