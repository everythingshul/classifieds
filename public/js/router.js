const Router = (() => {
  const routes = [];
  const root = () => document.getElementById('app');

  function add(pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$'
    );
    routes.push({ regex, keys, handler });
  }

  async function resolve() {
    const path = window.location.pathname;
    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    for (const r of routes) {
      const m = path.match(r.regex);
      if (m) {
        const routeParams = {};
        r.keys.forEach((k, i) => { routeParams[k] = decodeURIComponent(m[i + 1]); });
        root().innerHTML = '<div class="spinner">Loading…</div>';
        window.scrollTo(0, 0);
        try {
          await r.handler({ ...routeParams, query: params });
        } catch (e) {
          console.error(e);
          root().innerHTML = `<div class="container"><p class="error-list">${escapeHtml(e.message || 'Something went wrong.')}</p></div>`;
        }
        highlightNav();
        return;
      }
    }
    root().innerHTML = '<div class="container"><h2>Page not found</h2></div>';
  }

  function highlightNav() {
    document.querySelectorAll('.main-nav a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === window.location.pathname);
    });
  }

  function navigate(path, { replace = false } = {}) {
    if (replace) window.history.replaceState({}, '', path);
    else window.history.pushState({}, '', path);
    resolve();
  }

  function init() {
    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const url = new URL(a.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (a.target === '_blank' || a.hasAttribute('download') || a.dataset.external !== undefined) return;
      e.preventDefault();
      navigate(url.pathname + url.search);
    });
    window.addEventListener('popstate', resolve);
    resolve();
  }

  return { add, navigate, resolve, init };
})();
