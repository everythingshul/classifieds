// Server-side best-effort geocoding for a post's free-text location.
// A poster's locationLat/Lng only ever get set client-side when they
// actually click a suggestion in the location autocomplete dropdown
// (see postWizard.js's _locFromMaps) - type-and-move-on, which is common,
// leaves them null. Without a fallback here, "find businesses near me"
// could only ever match the minority of posts whose poster happened to
// click a suggestion, which is exactly the bug this closes.
//
// Same free, no-API-key services the client-side fallback already uses
// (public/js/geocode.js's searchLocations) - Zippopotam for a US zip,
// Open-Meteo's geocoding search otherwise. Never throws; returns null on
// no match, a timeout, or any network error, and the caller treats that
// exactly like "this post has no coordinates" (today's behavior).
async function geocodeLocation(text) {
  const q = String(text || '').trim();
  if (!q) return null;

  if (/^\d{5}$/.test(q)) {
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${q}`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        const place = data.places && data.places[0];
        if (place) {
          const lat = parseFloat(place.latitude);
          const lng = parseFloat(place.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        }
      }
    } catch (e) { /* fall through to the general lookup below */ }
  }

  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const r = (data.results || [])[0];
      if (r && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) return { lat: r.latitude, lng: r.longitude };
    }
  } catch (e) { /* no match, timeout, or network issue - treated as "couldn't geocode" */ }

  return null;
}

module.exports = { geocodeLocation };
