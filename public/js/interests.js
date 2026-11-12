// What this visitor has been looking at, kept only in this browser
// (localStorage) and never stored on the server. The home page sends the top
// few interests to /api/suggestions to pick posts for them, e.g. job posts in
// the town they searched earlier. Interest fades over about two weeks, and
// "Clear" on the home strip wipes it.
const Interests = (() => {
  const KEY = 'esc_interests';
  const HALF_LIFE = 14 * 86400000;
  const MAX = { cats: 12, places: 12, terms: 12 };

  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.v === 1) return v; } catch (e) { /* fall through */ }
    return { v: 1, cats: {}, places: {}, terms: {} };
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* storage blocked */ } }
  const decayed = (e) => e.w * Math.pow(0.5, (Date.now() - e.t) / HALF_LIFE);

  function bump(bucket, key, weight) {
    key = String(key || '').trim().slice(0, 60);
    if (!key) return;
    const d = load();
    const cur = d[bucket][key];
    d[bucket][key] = { w: (cur ? decayed(cur) : 0) + weight, t: Date.now() };
    const keys = Object.keys(d[bucket]);
    if (keys.length > MAX[bucket]) {
      keys.sort((a, b) => decayed(d[bucket][a]) - decayed(d[bucket][b]));
      keys.slice(0, keys.length - MAX[bucket]).forEach((k) => delete d[bucket][k]);
    }
    save(d);
  }

  // kind: 'view' (opened a post), 'search', 'browse' (opened a category), 'save' (bookmarked)
  function note(kind, { category, place, term } = {}) {
    const w = { view: 1, browse: 1, search: 2, save: 3 }[kind] || 1;
    if (category) bump('cats', category, w);
    if (place) bump('places', place, w);
    if (term) bump('terms', String(term).toLowerCase(), w);
  }

  const top = (bucket, n) => {
    const d = load();
    return Object.entries(d[bucket]).map(([k, e]) => [k, decayed(e)]).filter(([, s]) => s > 0.25).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  };

  function profile() { return { c: top('cats', 3), p: top('places', 3), t: top('terms', 3) }; }
  function isEmpty() { const p = profile(); return !p.c.length && !p.p.length && !p.t.length; }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  return { note, profile, isEmpty, clear };
})();
