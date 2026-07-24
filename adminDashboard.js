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
            <a href="#/dashboard">Dashboard</a>
            <a href="#/new-post">+ New Post</a>
            <a href="#/moderation">Moderation Queue</a>
            <a href="#/posts">All Posts</a>
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
    }
  } else {
    document.getElementById('adminRoot').innerHTML = `<div id="adminContent"></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  AdminRouter.add('#/login', renderLoginPage);
  AdminRouter.add('#/dashboard', renderDashboardPage);
  AdminRouter.add('#/new-post', renderCreatePostPage);
  AdminRouter.add('#/moderation', renderModerationPage);
  AdminRouter.add('#/posts', renderPostsPage);
  AdminRouter.add('#/crm', renderCrmPage);
  AdminRouter.add('#/categories', renderCategoriesPage);
  AdminRouter.add('#/pricing', renderPricingPage);
  AdminRouter.add('#/settings', renderSettingsPage);
  AdminRouter.init();
});
