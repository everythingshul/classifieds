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

function formatRelativeTime(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return I18N.get() === 'he' ? 'הרגע' : 'just now';
  if (mins < 60) return I18N.get() === 'he' ? `לפני ${mins} דק׳` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return I18N.get() === 'he' ? `לפני ${hours} שע׳` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return I18N.get() === 'he' ? `לפני ${days} ימים` : `${days}d ago`;
  return formatDate(ms);
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

// Fills a <select> with country calling codes (from the server, backed by
// libphonenumber-js) so phone validation can check the right digit-count
// rules per country instead of always assuming US.
function populateCountrySelect(selectEl, selected) {
  if (!selectEl) return;
  const countries = window.SITE_CONFIG?.countries || [{ code: 'US', name: 'United States', dial: '1' }];
  const value = selected || 'US';
  selectEl.innerHTML = countries.map((c) => `<option value="${c.code}" ${c.code === value ? 'selected' : ''}>${c.code} +${c.dial}</option>`).join('');
}

// Mounts Stripe's Embedded Checkout (the payment form itself renders inline
// in `containerEl`, no redirect to a Stripe-hosted page) using the
// publishable key exposed via /api/config.
let _stripeInstance = null;
async function mountEmbeddedCheckout(containerEl, clientSecret) {
  const pk = window.SITE_CONFIG?.stripePublishableKey;
  if (!pk) {
    containerEl.innerHTML = `<p class="error-list">Payments are not configured on this site yet. Please contact the site owner.</p>`;
    return null;
  }
  if (!_stripeInstance) _stripeInstance = Stripe(pk);
  const checkout = await _stripeInstance.initEmbeddedCheckout({ clientSecret });
  checkout.mount(containerEl);
  return checkout;
}

function setPageTitle(title, description) {
  const siteName = window.SITE_CONFIG?.siteName || 'JListings';
  document.title = title ? `${title} | ${siteName}` : siteName;
  if (description) {
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', description);
  }
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
