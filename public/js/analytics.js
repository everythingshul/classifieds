// Anonymous per-browser visitor id (localStorage, no cookies/PII) used only
// to distinguish unique vs. recurring visits in the admin analytics
// dashboard - never sent anywhere except this site's own /api/analytics.
const Analytics = (() => {
  const KEY = 'esc_visitor_id';
  // Set from the admin Analytics page's "Don't count my visits in this
  // browser" toggle - same localStorage, same origin, so an admin's own
  // browsing on the public pages stops being counted once they flip it.
  const DISABLE_KEY = 'esc_no_track';

  function isDisabled() {
    try { return !!localStorage.getItem(DISABLE_KEY); } catch (e) { return false; }
  }

  function visitorId() {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  }

  // Fire-and-forget, same pattern as Api.registerImpressions/registerClicks -
  // a tracking call failing should never affect the page itself.
  function trackPageview(path) {
    if (isDisabled()) return;
    fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, visitorId: visitorId() }),
    }).catch(() => {});
  }

  return { visitorId, trackPageview, isDisabled };
})();
