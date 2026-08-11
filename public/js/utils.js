function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatCents(cents) {
  const n = Number(cents || 0);
  return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`;
}

// For a poster's own listed price, which can be in a currency other than
// USD - unlike formatCents, which is only ever used for what the site
// itself charges (always USD via Stripe).
function formatMoney(cents, currency) {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch (e) {
    return formatCents(cents);
  }
}

// Price/pay fields may be a numeric amount, free text (e.g. "Call for
// price", "DOE"), or absent entirely - returns null when there's nothing to
// show, so callers can skip rendering the row/line altogether.
function formatPriceField(amount, text, currency) {
  if (amount !== undefined && amount !== null && amount !== '') return formatMoney(amount * 100, currency);
  if (text) return text;
  return null;
}

// Client-side mirror of the server's parseAmountOrText (services/postValidation.js)
// - used to preview a raw wizard input as either a price/pay amount or free text
// before it's actually submitted.
function parseAmountOrText(raw) {
  if (raw === undefined || raw === null) return { amount: null, text: null };
  const str = String(raw).trim();
  if (!str) return { amount: null, text: null };
  const num = Number(str);
  return Number.isFinite(num) ? { amount: num, text: null } : { amount: null, text: str };
}

// Client-side mirror of the server's promoAppliesToFeature (services/promoCodes.js)
// - promo.includedFeatures/excludedFeatures come back from /api/posts/promo/validate
// already parsed into arrays (or null), matching this shape.
function promoCoversFeature(promo, kind) {
  if (promo.includedFeatures && promo.includedFeatures.length && !promo.includedFeatures.includes(kind)) return false;
  if (promo.excludedFeatures && promo.excludedFeatures.includes(kind)) return false;
  return true;
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

// Stripe.js is loaded on demand (not as a static <script> tag in index.html)
// so it never runs - and never injects its own fraud-detection iframe -
// on pages that never show a payment form. Only the post-a-listing checkout
// step actually calls mountEmbeddedCheckout, so that's the only place it loads.
let _stripeJsPromise = null;
function loadStripeJs() {
  if (window.Stripe) return Promise.resolve();
  if (!_stripeJsPromise) {
    _stripeJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Stripe.js'));
      document.head.appendChild(script);
    });
  }
  return _stripeJsPromise;
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
  if (!_stripeInstance) {
    await loadStripeJs();
    _stripeInstance = Stripe(pk);
  }
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

// Shared by post detail pages and the editorial detail page - one markup +
// wiring implementation so the share behavior stays identical everywhere.
function renderShareRow(url, text) {
  return `
    <div class="share-row">
      <span class="hint">Share:</span>
      <a href="mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}" title="Share by email">Email</a>
      <a href="sms:?&body=${encodeURIComponent(`${text} ${url}`)}" title="Share by text message">SMS</a>
      <a href="https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}" target="_blank" rel="noopener" title="Share on WhatsApp">WhatsApp</a>
      <button type="button" class="copy-link-btn" data-share-url="${escapeHtml(url)}" title="Copy link">Copy Link</button>
    </div>`;
}

function wireShareRow(root = document) {
  root.querySelectorAll('.copy-link-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.shareUrl;
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied!');
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast('Link copied!');
      }
    });
  });
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Wires up a bold/italic/underline/list toolbar sitting directly before a
// contenteditable `.rich-editor` div (same markup pattern used for the admin
// editorial instructions editor) - shared by the editorial submit form here
// and the admin editorial editor in the admin app's own copy of this helper.
function wireRichToolbars(root = document) {
  root.querySelectorAll('.rich-toolbar').forEach((toolbar) => {
    const editor = toolbar.nextElementSibling;
    if (!editor || !editor.classList.contains('rich-editor')) return;
    toolbar.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        editor.focus();
        document.execCommand(btn.dataset.cmd, false, null);
      });
    });
  });
}

// Plain-text length/content of sanitized rich text HTML, for char counters
// and card excerpts - uses a detached (never-appended) element so nothing
// in it ever executes or renders.
function stripHtmlClient(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html || '');
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}
