// Location categories. Every post's address is routed into one managed
// location (Flatbush, Lakewood, Golders Green...) so browsing, search and
// suggestions all speak the same place names.
//
// Routing order for a post's address text:
//   1. A known name or alias appears in the text (longest match wins, so
//      "Coney Island Ave, Flatbush Brooklyn" lands in Flatbush, not Brooklyn)
//   2. A typo-tolerant version of 1
//   3. The post's coordinates sit within a few miles of exactly one place
//   4. Claude is shown the list and either picks one or proposes a new name
// Anything still unplaced goes to location_queue for the admin to sort once:
// create a new location, or file it under an existing one (which saves the
// text as an alias so the next post with it routes itself).
const db = require('../db');
const Anthropic = require('@anthropic-ai/sdk');
const runtimeConfig = require('./runtimeConfig');
const { PLACES } = require('./gazetteer');
const { normalizeText, tokenize, wordsMatch } = require('../utils/fuzzy');
const { distanceMiles } = require('../utils/geo');

const GEO_AUTO_MILES = 2.5;

function seedIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM locations').get().n;
  if (n) return;
  const ins = db.prepare('INSERT OR IGNORE INTO locations (name, state, lat, lng, aliases, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const now = Date.now();
  db.transaction(() => {
    PLACES.forEach(([label, lat, lng, state, ...aliases]) => ins.run(label, state || null, lat, lng, JSON.stringify(aliases), now));
  })();
}
seedIfEmpty();

function parseAliases(row) {
  try { return JSON.parse(row.aliases || '[]'); } catch (e) { return []; }
}

// Every phrase that identifies a location: its full name, its first segment
// ("Borough Park" from "Borough Park, Brooklyn, NY") and its aliases.
function phrasesFor(row) {
  const out = new Set();
  const first = String(row.name).split(',')[0];
  [row.name, first, ...parseAliases(row)].forEach((p) => {
    const n = normalizeText(p);
    if (n.length >= 2) out.add(n);
  });
  return [...out];
}

let cache = null;
function loadAll() {
  if (cache && Date.now() - cache.at < 5000) return cache.rows;
  const rows = db.prepare('SELECT * FROM locations WHERE active = 1').all().map((r) => ({ ...r, phrases: phrasesFor(r) }));
  cache = { at: Date.now(), rows };
  return rows;
}
function clearCache() { cache = null; }

function containsPhrase(haystackNorm, phrase) {
  return (` ${haystackNorm} `).includes(` ${phrase} `);
}

// Returns { location, how } or null.
function matchByText(text) {
  const norm = normalizeText(text);
  if (!norm) return null;
  const rows = loadAll();

  let best = null;
  for (const r of rows) {
    for (const ph of r.phrases) {
      if (containsPhrase(norm, ph)) {
        // longer phrase beats shorter; a more specific (longer full name) wins ties
        const score = ph.length * 10 + (r.name.length > 0 ? r.name.split(',').length : 0);
        if (!best || score > best.score) best = { r, score };
      }
    }
  }
  if (best) return { location: best.r, how: 'text' };

  // typo tolerance: every word of a phrase must fuzzy-match some word of the text
  const words = tokenize(norm);
  let fuzzy = null;
  for (const r of rows) {
    for (const ph of r.phrases) {
      const pw = ph.split(' ');
      if (pw.join('').length < 5) continue; // too short to trust a fuzzy hit
      if (pw.every((w) => words.some((tw) => wordsMatch(w, tw)))) {
        const score = ph.length;
        if (!fuzzy || score > fuzzy.score) fuzzy = { r, score };
      }
    }
  }
  return fuzzy ? { location: fuzzy.r, how: 'fuzzy' } : null;
}

function matchByCoords(lat, lng) {
  if (lat == null || lng == null) return null;
  const near = loadAll()
    .map((r) => ({ r, d: distanceMiles(lat, lng, r.lat, r.lng) }))
    .filter((x) => x.d != null && x.d <= GEO_AUTO_MILES)
    .sort((a, b) => a.d - b.d);
  if (!near.length) return null;
  // Two candidates nearly the same distance away is a coin flip - leave it to a human.
  if (near.length > 1 && near[1].d - near[0].d < 0.4) return null;
  return { location: near[0].r, how: 'geo' };
}

// ---- Claude fallback -------------------------------------------------------

let client = null;
let clientKey = null;
function getClient() {
  const apiKey = runtimeConfig.get('anthropic_api_key', 'ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['assign', 'new', 'unsure'] },
    locationName: { type: 'string', description: 'For assign: the exact name from the list.' },
    newName: { type: 'string', description: 'For new: a clean place name in the same style as the list, e.g. "Monsey, NY".' },
    note: { type: 'string' },
  },
  required: ['action'],
  additionalProperties: false,
};

async function askClaude(text) {
  const c = getClient();
  if (!c) return null;
  const names = loadAll().map((r) => r.name);
  try {
    const res = await c.messages.create({
      model: runtimeConfig.get('chesky_model') || 'claude-opus-5-5',
      max_tokens: 1000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ROUTE_SCHEMA } },
      system: 'You sort the address or place text on a Jewish community classifieds post into a fixed list of location categories. Choose "assign" only when the text clearly belongs to one listed location (a street, shul, neighborhood or nickname inside it counts). Choose "new" when it names a real place that is not on the list, and give a clean name in the list\'s style. Choose "unsure" when the text is too vague to place. Never invent a location name for "assign": it must be copied exactly from the list.',
      messages: [{ role: 'user', content: `Locations:\n${names.join('\n')}\n\nText to sort:\n${String(text).slice(0, 300)}` }],
    });
    if (res.stop_reason === 'refusal') return null;
    const block = res.content.find((b) => b.type === 'text');
    return block ? JSON.parse(block.text) : null;
  } catch (e) {
    console.error('[locations] Claude routing failed:', e.message);
    return null;
  }
}

// ---- Routing ---------------------------------------------------------------

function setPostLocation(postId, locationId, route) {
  db.prepare('UPDATE posts SET location_id = ?, location_route = ? WHERE id = ?').run(locationId, route, postId);
}

function queueText(text, ai) {
  const norm = normalizeText(text);
  if (!norm) return;
  db.prepare(
    `INSERT INTO location_queue (norm_text, sample_text, ai_action, ai_location_id, ai_new_name, ai_note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
     ON CONFLICT(norm_text) DO NOTHING`
  ).run(norm, String(text).slice(0, 200), ai?.action || null, ai?.locationId || null, ai?.newName || null, ai?.note || null, Date.now());
}

// Routes one post. Safe to call repeatedly; never throws.
async function routePost(postId) {
  try {
    const post = db.prepare('SELECT id, location_text, location_city, location_lat, location_lng, location_route FROM posts WHERE id = ?').get(postId);
    if (!post || post.location_route === 'manual') return null;
    const text = [post.location_text, post.location_city].filter(Boolean).join(', ');
    if (!text.trim() && post.location_lat == null) return null;

    const hit = matchByText(text) || matchByCoords(post.location_lat, post.location_lng);
    if (hit) {
      setPostLocation(postId, hit.location.id, hit.how === 'geo' ? 'auto' : 'auto');
      return hit.location;
    }

    // Already waiting on an admin decision for this exact text? Don't ask Claude again.
    const norm = normalizeText(text);
    const waiting = db.prepare("SELECT 1 FROM location_queue WHERE norm_text = ? AND status = 'open'").get(norm);
    if (waiting) { setPostLocation(postId, null, 'review'); return null; }

    const ai = await askClaude(text);
    if (ai && ai.action === 'assign') {
      const loc = loadAll().find((r) => r.name === ai.locationName);
      if (loc) {
        // Claude was sure enough to pick one; remember the wording so it is free next time.
        addAlias(loc.id, text);
        setPostLocation(postId, loc.id, 'ai');
        return loc;
      }
    }
    queueText(text, ai && ai.action === 'new' ? { action: 'new', newName: ai.newName, note: ai.note } : ai ? { action: ai.action, note: ai.note } : null);
    setPostLocation(postId, null, 'review');
    return null;
  } catch (e) {
    console.error('[locations] routePost failed for', postId, '-', e.message);
    return null;
  }
}

function addAlias(locationId, text) {
  const row = db.prepare('SELECT aliases FROM locations WHERE id = ?').get(locationId);
  if (!row) return;
  const norm = normalizeText(text);
  if (!norm) return;
  let list = [];
  try { list = JSON.parse(row.aliases || '[]'); } catch (e) { list = []; }
  if (!list.map(normalizeText).includes(norm)) list.push(String(text).trim().slice(0, 120));
  db.prepare('UPDATE locations SET aliases = ? WHERE id = ?').run(JSON.stringify(list), locationId);
  clearCache();
}

// Applies an admin decision to every post with that address text.
function resolveQueueItem(normText, locationId) {
  const item = db.prepare('SELECT * FROM location_queue WHERE norm_text = ?').get(normText);
  if (!item) return 0;
  addAlias(locationId, item.sample_text);
  db.prepare("UPDATE location_queue SET status = 'resolved' WHERE norm_text = ?").run(normText);
  const rows = db.prepare("SELECT id, location_text, location_city FROM posts WHERE location_route = 'review'").all();
  let n = 0;
  rows.forEach((p) => {
    const t = normalizeText([p.location_text, p.location_city].filter(Boolean).join(', '));
    if (t === normText) { setPostLocation(p.id, locationId, 'manual'); n++; }
  });
  return n;
}

// One-time-ish sweep for posts that have an address but no location yet.
async function routeUnrouted(limit = 500) {
  const rows = db.prepare(
    `SELECT id FROM posts WHERE location_id IS NULL AND (location_route IS NULL)
     AND status != 'removed' AND ((location_text IS NOT NULL AND location_text != '') OR location_lat IS NOT NULL) LIMIT ?`
  ).all(limit);
  for (const r of rows) await routePost(r.id);
  return rows.length;
}

module.exports = { routePost, routeUnrouted, matchByText, resolveQueueItem, addAlias, clearCache, loadAll };
