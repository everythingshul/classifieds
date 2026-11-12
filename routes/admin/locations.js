const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { geocodeLocation } = require('../../services/geocode');
const locations = require('../../services/locations');

const router = express.Router();
router.use(requireAdmin);

function shape(r, count) {
  let aliases = [];
  try { aliases = JSON.parse(r.aliases || '[]'); } catch (e) { aliases = []; }
  return { id: r.id, name: r.name, state: r.state, lat: r.lat, lng: r.lng, aliases, active: !!r.active, posts: count || 0 };
}

// Locations with live post counts, plus the "needs sorting" queue.
router.get('/', (req, res) => {
  const counts = {};
  db.prepare("SELECT location_id, COUNT(*) AS n FROM posts WHERE location_id IS NOT NULL AND status = 'live' GROUP BY location_id").all()
    .forEach((r) => { counts[r.location_id] = r.n; });
  const list = db.prepare('SELECT * FROM locations ORDER BY name').all().map((r) => shape(r, counts[r.id]));

  const queue = db.prepare("SELECT * FROM location_queue WHERE status = 'open' ORDER BY created_at DESC").all().map((q) => {
    const posts = db.prepare("SELECT public_id, title, type FROM posts WHERE location_route = 'review' AND status != 'removed' AND lower(trim(coalesce(location_text,'') || CASE WHEN location_city IS NOT NULL AND location_city != '' THEN ', ' || location_city ELSE '' END)) != ''").all();
    return {
      key: q.norm_text,
      text: q.sample_text,
      aiAction: q.ai_action,
      aiLocationId: q.ai_location_id,
      aiNewName: q.ai_new_name,
      aiNote: q.ai_note,
      createdAt: q.created_at,
      posts: posts.length ? undefined : [],
    };
  });
  // How many posts wait on each queued text (computed once, not per row).
  const waiting = {};
  const { normalizeText } = require('../../utils/fuzzy');
  db.prepare("SELECT location_text, location_city FROM posts WHERE location_route = 'review' AND status != 'removed'").all()
    .forEach((p) => {
      const k = normalizeText([p.location_text, p.location_city].filter(Boolean).join(', '));
      waiting[k] = (waiting[k] || 0) + 1;
    });
  queue.forEach((q) => { q.postCount = waiting[q.key] || 0; delete q.posts; });

  res.json({ locations: list, queue, claudeReady: !!(require('../../services/runtimeConfig').get('anthropic_api_key', 'ANTHROPIC_API_KEY')) });
});

// Create a new location (optionally resolving a queued text into it).
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A name is required' });
    if (db.prepare('SELECT 1 FROM locations WHERE lower(name) = lower(?)').get(name)) return res.status(409).json({ error: 'A location with that name already exists' });
    let lat = req.body.lat != null && req.body.lat !== '' ? Number(req.body.lat) : null;
    let lng = req.body.lng != null && req.body.lng !== '' ? Number(req.body.lng) : null;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      const hit = await geocodeLocation(name).catch(() => null);
      lat = hit ? hit.lat : null;
      lng = hit ? hit.lng : null;
    }
    const aliases = Array.isArray(req.body.aliases) ? req.body.aliases.map((a) => String(a).trim()).filter(Boolean) : [];
    const info = db.prepare('INSERT INTO locations (name, state, lat, lng, aliases, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, req.body.state || null, lat, lng, JSON.stringify(aliases), Date.now());
    locations.clearCache();
    let routed = 0;
    if (req.body.resolveKey) routed = locations.resolveQueueItem(String(req.body.resolveKey), info.lastInsertRowid);
    res.json({ id: info.lastInsertRowid, routed, geocoded: lat != null });
  } catch (e) { next(e); }
});

// Edit name/aliases/active/coordinates.
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM locations WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  const name = req.body.name != null ? String(req.body.name).trim() : row.name;
  const aliases = Array.isArray(req.body.aliases) ? req.body.aliases.map((a) => String(a).trim()).filter(Boolean) : JSON.parse(row.aliases || '[]');
  db.prepare('UPDATE locations SET name = ?, aliases = ?, active = ?, lat = ?, lng = ? WHERE id = ?').run(
    name, JSON.stringify(aliases), req.body.active != null ? (req.body.active ? 1 : 0) : row.active,
    req.body.lat != null ? Number(req.body.lat) : row.lat, req.body.lng != null ? Number(req.body.lng) : row.lng, row.id
  );
  locations.clearCache();
  res.json({ ok: true });
});

// File a queued address under an existing location.
router.post('/queue/assign', (req, res) => {
  const key = String(req.body.key || '');
  const id = Number(req.body.locationId);
  if (!db.prepare('SELECT 1 FROM locations WHERE id = ?').get(id)) return res.status(400).json({ error: 'Pick a location' });
  res.json({ routed: locations.resolveQueueItem(key, id) });
});

// Run the router over any posts that have an address but no location yet.
router.post('/route-all', async (req, res, next) => {
  try { res.json({ checked: await locations.routeUnrouted(500) }); } catch (e) { next(e); }
});

module.exports = router;
