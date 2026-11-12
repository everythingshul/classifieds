// The one search implementation behind every browse/search surface on the
// site - the header search bar, the /search page, the filter form on the
// classifieds/listings/simchas pages, and Chesky's search_posts tool.
//
// Before this, each route did `title LIKE '%<whole phrase>%'`, so a query
// only matched when the visitor typed a contiguous substring of the title in
// the exact order and spelling the poster used - "chair rocking", "rockng
// chair" and "rocking chair brooklyn" all found nothing. Now:
//   1. the query is split into words, every word must appear somewhere in
//      the post (title, description, hidden AI keywords, or location), in
//      any order;
//   2. if that finds nothing, a typo-tolerant pass runs in JS over the
//      candidate rows (see utils/fuzzy.js) - "rockng" still finds "rocking".
// The City filter likewise matches the location the poster actually typed
// (location_text), not only location_city, which is null for every post
// whose poster didn't click an autocomplete suggestion.
const db = require('../db');
const { tokenize, wordsMatch } = require('../utils/fuzzy');
const { distanceMiles } = require('../utils/geo');

const TEXT_COLUMNS = ['title', 'description', 'search_keywords', 'location_text', 'location_city'];
const LOCATION_COLUMNS = ['location_city', 'location_text', 'location_state'];

// Every word must match at least one column (AND of ORs).
function tokenWhere(text, columns) {
  const words = tokenize(text);
  if (!words.length) return null;
  const sql = words.map(() => `(${columns.map((c) => `${c} LIKE ?`).join(' OR ')})`).join(' AND ');
  const params = [];
  words.forEach((w) => columns.forEach(() => params.push(`%${w}%`)));
  return { sql, params };
}

// Any one word is enough (OR). Used for the City filter's fallback: someone
// typing "Flatbush, Brooklyn NY" against a post that just says "Flatbush"
// should still find it. Two-letter words (state codes) are dropped here,
// since "ny" alone would match every post in the state.
function anyTokenWhere(text, columns) {
  const words = tokenize(text).filter((w) => w.length >= 3);
  if (!words.length) return null;
  const sql = words.map(() => `(${columns.map((c) => `${c} LIKE ?`).join(' OR ')})`).join(' OR ');
  const params = [];
  words.forEach((w) => columns.forEach(() => params.push(`%${w}%`)));
  return { sql, params };
}

function fuzzyRowMatches(row, words, columns, any) {
  const haystack = columns.map((c) => row[c] || '').join(' ');
  const rowWords = tokenize(haystack);
  const hit = (w) => rowWords.some((rw) => wordsMatch(w, rw));
  return any ? words.some(hit) : words.every(hit);
}

// Posts that match `text` loosely - every query word has to be close to
// some word in the post (or any one word, with { any: true }). Only used
// after the strict SQL pass found nothing.
function fuzzyFilter(rows, text, columns = TEXT_COLUMNS, { any = false } = {}) {
  const words = tokenize(text).filter((w) => !any || w.length >= 3);
  if (!words.length) return rows;
  return rows.filter((r) => fuzzyRowMatches(r, words, columns, any));
}

const CANDIDATE_LIMIT = 5000;

// Runs a browse query for one of the public list routes.
//   where/params: the route's own base filters (type, status, category...)
//   q: free-text search; city: the City filter field
//   geo: { lat, lng, radius } to sort by distance within a radius, or null
//   orderBy: SQL order for the non-geo case
// Returns { posts, total } for the requested page.
function runBrowseQuery({ where, params, q, city, geo, orderBy, page, pageSize, intent }) {
  const base = { where: [...where], params: [...params] };
  // `intent` is what Claude understood (services/searchUnderstanding.js). It
  // only ever widens what was typed: the typed words still match as before,
  // and the alternatives / the place Claude recognised match as well.
  let textWhere = q ? tokenWhere(q, TEXT_COLUMNS) : null;
  let cityWhere = city ? tokenWhere(city, LOCATION_COLUMNS) : null;
  let intentLocation = null;
  if (intent) {
    const alts = [intent.subject, ...(intent.terms || [])].filter(Boolean).map((t) => tokenWhere(t, TEXT_COLUMNS)).filter(Boolean);
    if (intent.location) {
      const ids = [intent.location.id];
      const likes = intent.location.phrases.filter((p) => p.length >= 4).slice(0, 6);
      const sql = `location_id IN (${ids.map(() => '?').join(',')})${likes.length ? ' OR ' + likes.map(() => '(' + LOCATION_COLUMNS.map((c) => `${c} LIKE ?`).join(' OR ') + ')').join(' OR ') : ''}`;
      const ps = [...ids];
      likes.forEach((p) => LOCATION_COLUMNS.forEach(() => ps.push(`%${p}%`)));
      intentLocation = { sql, params: ps };
    }
    if (intent.location && intent.locationFromQuery) {
      // The place was typed into the search words ("plumber in lakewood"):
      // search for the subject, and filter by the place instead of requiring
      // the word to appear in the post text.
      const subj = intent.subject ? tokenWhere(intent.subject, TEXT_COLUMNS) : null;
      const parts = [subj, ...alts.slice(1)].filter(Boolean);
      textWhere = parts.length ? { sql: parts.map((a) => `(${a.sql})`).join(' OR '), params: parts.flatMap((a) => a.params) } : null;
      cityWhere = intentLocation;
    } else {
      if (textWhere && alts.length) {
        textWhere = { sql: [textWhere, ...alts].map((a) => `(${a.sql})`).join(' OR '), params: [textWhere, ...alts].flatMap((a) => a.params) };
      }
      if (cityWhere && intentLocation) {
        cityWhere = { sql: `(${cityWhere.sql}) OR (${intentLocation.sql})`, params: [...cityWhere.params, ...intentLocation.params] };
      } else if (!cityWhere && intentLocation && !q) {
        cityWhere = intentLocation;
      }
    }
  }
  const strict = { where: [...base.where], params: [...base.params] };
  for (const w of [cityWhere, textWhere]) {
    if (w) { strict.where.push(`(${w.sql})`); strict.params.push(...w.params); }
  }

  const expiredLast = "(status = 'expired') ASC";
  const load = (scope) => db
    .prepare(`SELECT * FROM posts WHERE ${scope.where.join(' AND ')} ORDER BY ${expiredLast}, ${orderBy} LIMIT ${CANDIDATE_LIMIT}`)
    .all(...scope.params);

  // No text/city search: plain paged SQL is all that's needed.
  if (!textWhere && !cityWhere && !geo) {
    const total = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE ${strict.where.join(' AND ')}`).get(...strict.params).c;
    const posts = db
      .prepare(`SELECT * FROM posts WHERE ${strict.where.join(' AND ')} ORDER BY ${expiredLast}, ${orderBy} LIMIT ? OFFSET ?`)
      .all(...strict.params, pageSize, (page - 1) * pageSize);
    return { total, posts };
  }

  // Strict (every word, SQL) pass first. If that matched nothing: a City
  // filter relaxes to any-word first ("Flatbush, Brooklyn NY" vs a post
  // that just says "Flatbush"), then everything falls back to the
  // typo-tolerant pass over the route's base set.
  let rows = load(strict);
  if (!rows.length && cityWhere) {
    const cityAny = anyTokenWhere(city, LOCATION_COLUMNS);
    if (cityAny) {
      const relaxed = { where: [...base.where, `(${cityAny.sql})`], params: [...base.params, ...cityAny.params] };
      if (textWhere) { relaxed.where.push(`(${textWhere.sql})`); relaxed.params.push(...textWhere.params); }
      rows = load(relaxed);
    }
  }
  if (!rows.length && (textWhere || cityWhere)) {
    rows = load(base);
    if (cityWhere && city) rows = fuzzyFilter(rows, city, LOCATION_COLUMNS, { any: true });
    if (textWhere && q && !(intent && intent.location && intent.locationFromQuery)) rows = fuzzyFilter(rows, q, TEXT_COLUMNS);
  }

  if (geo) {
    const withDist = rows
      .map((p) => ({ post: p, dist: distanceMiles(geo.lat, geo.lng, p.location_lat, p.location_lng) }))
      .filter((x) => x.dist !== null && x.dist <= geo.radius)
      .sort((a, b) => a.dist - b.dist);
    return { total: withDist.length, posts: withDist.slice((page - 1) * pageSize, page * pageSize).map((x) => x.post) };
  }
  return { total: rows.length, posts: rows.slice((page - 1) * pageSize, page * pageSize) };
}

// What the page shows under the search form ("Showing: plumber in Flatbush").
function describeIntent(intent) {
  if (!intent) return null;
  const subject = intent.subject || '';
  const place = intent.location ? intent.location.name.split(',')[0] : '';
  if (!subject && !place) return null;
  return { subject, place, alternatives: (intent.terms || []).slice(0, 4), categoryKey: intent.categoryKey || '' };
}

function parseGeo(query) {
  const lat = query.lat !== undefined ? Number(query.lat) : null;
  const lng = query.lng !== undefined ? Number(query.lng) : null;
  const radius = query.radius ? Number(query.radius) : null;
  if (lat === null || lng === null || !radius || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng, radius };
}

module.exports = { describeIntent, runBrowseQuery, parseGeo, tokenWhere, fuzzyFilter, TEXT_COLUMNS };
