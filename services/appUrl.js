// Single source of truth for building absolute site URLs (email links,
// sitemap entries, social share previews, Stripe redirect URLs, admin
// notification links...). Previously every call site had its own copy of
// `runtimeConfig.get('app_url', 'APP_URL')`, which meant every link was
// always built from one hardcoded domain no matter which one a visitor
// actually used - adding a second domain (e.g. a ccTLD) meant either a
// forwarding redirect or a code change.
//
// Now: if the call happens inside a request whose Host header matches one
// of the known domains (the primary app_url plus whatever's listed in
// app_domains), links are built from that request's own origin. Outside a
// request (cron digests, scheduled jobs) - or if the Host isn't one this
// site recognizes - it falls back to the configured primary app_url. The
// Host header is only ever trusted after this allow-list check: building
// outbound links straight from an unvalidated Host header would let anyone
// get their own domain embedded in a transactional email just by sending a
// forged Host.
//
// To point a newly bought domain at the same site: add it to Settings ->
// Site -> "Additional domains" (or APP_DOMAINS, comma-separated) once DNS
// is pointed at it - no deploy needed.
const runtimeConfig = require('./runtimeConfig');
const { currentOrigin } = require('./requestContext');

function primaryUrl() {
  return (runtimeConfig.get('app_url', 'APP_URL') || 'https://jlistings.com').replace(/\/$/, '');
}

// app_domains is stored as a real array when set via the admin UI (the
// generic site_settings endpoint round-trips it through JSON already), but
// the env var fallback is a plain comma/newline-separated string - handle
// both, plus a raw JSON-array string for good measure.
function parseDomainsList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // not JSON - plain delimited string, handled below
    }
    return raw.split(/[,\n]/);
  }
  return [];
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch (e) {
    return null;
  }
}

function allowedHosts() {
  const extra = parseDomainsList(runtimeConfig.get('app_domains', 'APP_DOMAINS'))
    .map((d) => String(d).trim())
    .filter(Boolean)
    // Bare hostnames ("jlistings.co.uk") as well as full URLs both work.
    .map((d) => hostOf(d) || d.toLowerCase().replace(/^\/+/, ''));
  const hosts = new Set(extra);
  const primaryHost = hostOf(primaryUrl());
  if (primaryHost) hosts.add(primaryHost);
  return hosts;
}

function appUrl() {
  const origin = currentOrigin();
  if (origin) {
    const host = hostOf(origin);
    if (host && allowedHosts().has(host)) return origin.replace(/\/$/, '');
  }
  return primaryUrl();
}

module.exports = { appUrl, allowedHosts, primaryUrl };
