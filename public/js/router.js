const Router = (() => {
  const routes = [];
  const root = () => document.getElementById('app');

  // A thin bar at the top of the viewport gives instant feedback that
  // navigation started, independent of how long the page's own data fetch
  // takes - reused across routes instead of inserting/removing a node each time.
  function progressBar() {
    let bar = document.getElementById('route-progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'route-progress';
      document.body.appendChild(bar);
    }
    return bar;
  }
  function startProgress() {
    const bar = progressBar();
    bar.classList.remove('done');
    bar.style.width = '0%';
    void bar.offsetWidth; // reflow so the width change below is seen as a transition, not a jump
    bar.style.width = '72%';
    return bar;
  }
  function finishProgress(bar) {
    bar.style.width = '100%';
    setTimeout(() => {
      bar.classList.add('done');
      setTimeout(() => { bar.style.width = '0%'; }, 300);
    }, 120);
  }

  // Shimmering placeholder cards instead of a blank gap while a route's
  // handler fetches its data - most pages are primarily a card grid/carousel,
  // so this reads correctly even though it's not tailored per page.
  function skeletonHtml() {
    const card = `<div class="card skeleton-card"><div class="body">
      <span class="skeleton-line sk-w35"></span>
      <span class="skeleton-line sk-w90"></span>
      <span class="skeleton-line sk-w70"></span>
      <span class="skeleton-line sk-w50"></span>
    </div></div>`;
    return `<div class="container"><div class="results-grid">${card.repeat(6)}</div></div>`;
  }

  // Fades/rises the freshly-rendered page content in - re-triggerable on an
  // element that persists across navigations by removing then re-adding the
  // class with a forced reflow in between (browsers won't restart a CSS
  // animation on a class that's already present).
  function playEnter() {
    const el = root();
    el.classList.remove('app-enter');
    void el.offsetWidth;
    el.classList.add('app-enter');
  }

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
        const bar = startProgress();
        root().innerHTML = skeletonHtml();
        window.scrollTo(0, 0);
        try {
          await r.handler({ ...routeParams, query: params });
        } catch (e) {
          console.error(e);
          root().innerHTML = `<div class="container"><p class="error-list">${escapeHtml(e.message || 'Something went wrong.')}</p></div>`;
        }
        finishProgress(bar);
        playEnter();
        highlightNav();
        if (typeof Analytics !== 'undefined') Analytics.trackPageview(path);
        return;
      }
    }
    root().innerHTML = '<div class="container"><h2>Page not found</h2></div>';
    playEnter();
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
