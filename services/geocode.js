// Turns whatever someone typed into a location box into coordinates,
// forgivingly. Used for new posts (services/postSubmit.js), the one-time
// backfills (services/geoBackfill.js), the "where are you?" step and
// location pickers on the site (via GET /api/geocode), and Chesky's
// "closest businesses to X" search.
//
// Order of attempts, first hit wins:
//   1. a US zip code -> Zippopotam (exact, free)
//   2. the community gazetteer (services/gazetteer.js) and the places
//      already named on this site's own posts, matched typo-tolerantly -
//      this is what lets "bruklyn", "lkwd" or "golders grn" work; the free
//      network geocoders below all return nothing for those
//   3. Google Geocoding, if a Maps key is configured (the same key the post
//      wizard's autocomplete uses) - the most forgiving option when present
//   4. Open-Meteo, then Nominatim (both free, no key), on the text as typed,
//      then on the part before the first comma
// Never throws; returns [] / null on no match, timeout or network error.
const db = require('../db');
const runtimeConfig = require('./runtimeConfig');
const { PLACES } = require('./gazetteer');
const { normalizeText, lev, typoTolerance } = require('../utils/fuzzy');

const TIMEOUT_MS = 4000;
const MAX_CANDIDATES = 5;

// Trailing state/country words people add ("Monsey NY", "Lakewood, N.J.")
// that a gazetteer alias wouldn't carry.
const TRAILING_REGION = /\s+(ny|nj|ct|pa|md|ma|fl|il|oh|mi|ca|tx|ga|az|co|wa|mn|mo|wi|nv|on|qc|bc|uk|usa|us|israel|england|new york|new jersey)$/;

function stripRegion(s) {
  return s.replace(TRAILING_REGION, '').trim();
}

// ---- Gazetteer + own-posts matching ---------------------------------------

function gazetteerEntries() {
  return PLACES.map(([label, lat, lng, region, ...aliases]) => {
    const primary = normalizeText(label.split(',')[0]);
    const names = new Set([primary, normalizeText(label), ...aliases.map(normalizeText)]);
    return { label, lat, lng, region, names: [...names].filter(Boolean) };
  });
}
const GAZETTEER = gazetteerEntries();

// Distinct places this site's own posts already have coordinates for - a
// town only this community uses gets found once anyone has posted from it.
let ownPlacesCache = { at: 0, entries: [] };
function ownPlaces() {
  if (Date.now() - ownPlacesCache.at < 60_000) return ownPlacesCache.entries;
  const entries = [];
  try {
    const rows = db
      .prepare(`SELECT location_text, location_city, location_state, location_lat, location_lng
                FROM posts WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL AND status != 'removed'`)
      .all();
    const seen = new Set();
    for (const r of rows) {
      const label = r.location_city ? [r.location_city, r.location_state].filter(Boolean).join(', ') : r.location_text;
      if (!label) continue;
      const key = normalizeText(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const names = new Set([key, normalizeText(r.location_city || ''), normalizeText(r.location_text || '')]);
      entries.push({ label, lat: r.location_lat, lng: r.location_lng, region: r.location_state || '', names: [...names].filter(Boolean) });
    }
  } catch (e) { /* DB not ready - just no own-places this time */ }
  ownPlacesCache = { at: Date.now(), entries };
  return entries;
}

// Best fuzzy score of `q` against one entry's names: 0 = exact, then edit
// distance; prefix matches (4+ chars) count as a near-exact 0.5. Infinity
// when nothing is close enough.
function matchScore(q, entry) {
  let best = Infinity;
  for (const name of entry.names) {
    if (name === q) return 0;
    if (q.length >= 4 && (name.startsWith(q) || q.startsWith(name) && name.length >= 4)) best = Math.min(best, 0.5);
    const tol = typoTolerance(q);
    if (tol && Math.abs(name.length - q.length) <= tol) {
      const d = lev(q, name);
      if (d <= tol) best = Math.min(best, d);
    }
    // Multi-word input where the first word alone names the place
    // ("williamsburg brooklyn", "monsey new york").
    const firstWord = q.split(' ')[0];
    if (firstWord !== q && firstWord.length >= 4 && name === firstWord) best = Math.min(best, 0.75);
  }
  return best;
}

function localCandidates(text) {
  const raw = normalizeText(text);
  if (!raw) return [];
  const variants = [...new Set([raw, stripRegion(raw)])].filter(Boolean);
  const scored = [];
  for (const entry of [...GAZETTEER, ...ownPlaces()]) {
    let score = Infinity;
    for (const v of variants) score = Math.min(score, matchScore(v, entry));
    if (score !== Infinity) scored.push({ score, entry });
  }
  scored.sort((a, b) => a.score - b.score);
  const out = [];
  const seen = new Set();
  for (const { entry } of scored) {
    const key = `${entry.lat.toFixed(2)},${entry.lng.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lat: entry.lat, lng: entry.lng, label: entry.label, city: entry.label.split(',')[0], state: entry.region || null });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

// ---- Network geocoders -------------------------------------------------------

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.json();
}

async function zippopotam(zip) {
  try {
    const data = await getJson(`https://api.zippopotam.us/us/${zip}`);
    const place = data?.places?.[0];
    if (!place) return [];
    const lat = parseFloat(place.latitude), lng = parseFloat(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{ lat, lng, label: `${place['place name']}, ${place['state abbreviation']}`, city: place['place name'], state: place['state abbreviation'] }];
  } catch (e) { return []; }
}

async function googleGeocode(text) {
  const key = runtimeConfig.get('google_maps_api_key', 'GOOGLE_MAPS_API_KEY');
  if (!key) return [];
  try {
    const data = await getJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${encodeURIComponent(key)}`);
    if (!data || data.status !== 'OK') return [];
    return (data.results || []).slice(0, MAX_CANDIDATES).map((r) => {
      const comp = (type) => r.address_components.find((c) => c.types.includes(type));
      const city = comp('locality') || comp('sublocality') || comp('neighborhood') || comp('postal_town');
      const state = comp('administrative_area_level_1');
      return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, label: r.formatted_address, city: city?.long_name || null, state: state?.short_name || null };
    });
  } catch (e) { return []; }
}

async function openMeteo(text) {
  try {
    const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=${MAX_CANDIDATES}&language=en&format=json`);
    return (data?.results || [])
      .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
      .map((r) => {
        const region = r.admin1 || r.country;
        return { lat: r.latitude, lng: r.longitude, label: region ? `${r.name}, ${region}` : r.name, city: r.name, state: r.admin1 || null };
      });
  } catch (e) { return []; }
}

async function nominatim(text) {
  try {
    const data = await getJson(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${MAX_CANDIDATES}&addressdetails=1&q=${encodeURIComponent(text)}`,
      { 'User-Agent': 'JListings/1.0 (community classifieds; location lookup)' }
    );
    return (Array.isArray(data) ? data : [])
      .map((r) => {
        const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const a = r.address || {};
        const city = a.city || a.town || a.village || a.suburb || a.neighbourhood || r.name;
        const parts = [city, a.state || a.country].filter(Boolean);
        return { lat, lng, label: parts.join(', ') || r.display_name, city: city || null, state: a.state || null };
      })
      .filter(Boolean);
  } catch (e) { return []; }
}

// ---- Public API --------------------------------------------------------------

const cache = new Map();
const CACHE_MAX = 500;
function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

// Up to five {lat, lng, label, city, state} candidates for `text`, best first.
async function geocodeCandidates(text) {
  const q = String(text || '').trim();
  if (!q) return [];
  const key = normalizeText(q);
  if (cache.has(key)) return cache.get(key);

  if (/^\d{5}$/.test(q)) {
    const zip = await zippopotam(q);
    if (zip.length) return remember(key, zip);
  }

  const local = localCandidates(q);
  if (local.length) return remember(key, local);

  const google = await googleGeocode(q);
  if (google.length) return remember(key, google);

  const beforeComma = q.split(',')[0].trim();
  const attempts = [...new Set([q, beforeComma, stripRegion(normalizeText(beforeComma))])].filter(Boolean);
  for (const attempt of attempts) {
    const hit = await openMeteo(attempt);
    if (hit.length) return remember(key, hit);
  }
  for (const attempt of attempts) {
    const hit = await nominatim(attempt);
    if (hit.length) return remember(key, hit);
  }
  return remember(key, []);
}

// The single best match, or null.
async function geocodeLocation(text) {
  const candidates = await geocodeCandidates(text);
  return candidates[0] || null;
}

module.exports = { geocodeLocation, geocodeCandidates };
