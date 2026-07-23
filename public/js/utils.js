function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(I18N.get() === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(I18N.get() === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' });
}

function debounce(fn, wait = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  return p.toString();
}

function getBrowserLocation() {
  // The browser's own `timeout` option only bounds acquiring a position after
  // permission is granted - if the permission prompt itself is never answered
  // (e.g. no UI to show it), getCurrentPosition can hang forever. Race it
  // against our own timer so the caller is never stuck waiting.
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    setTimeout(() => done(null), 6500);
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => done(null),
      { timeout: 6000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
