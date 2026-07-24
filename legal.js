const Bookmarks = (() => {
  const KEY = 'esc_bookmarks';
  const make = (type, id) => `${type}:${id}`;

  function all() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function has(type, id) { return all().includes(make(type, id)); }
  function toggle(type, id) {
    const key = make(type, id);
    const list = all();
    const idx = list.indexOf(key);
    if (idx === -1) list.push(key); else list.splice(idx, 1);
    localStorage.setItem(KEY, JSON.stringify(list));
    return idx === -1;
  }
  function grouped() {
    const out = { classified: [], simcha: [] };
    all().forEach((entry) => {
      const [type, id] = entry.split(':');
      if (out[type]) out[type].push(id);
    });
    return out;
  }
  return { all, has, toggle, grouped };
})();
