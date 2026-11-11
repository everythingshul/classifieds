// One-time background backfill: fills in location_lat/location_lng for
// every existing classified/listing post that doesn't have them, using the
// same free geocoder services/postSubmit.js now runs on every new
// submission (see services/geocode.js). Without this, posts made before
// that existed would stay permanently invisible to "find near me" even
// though every new post now gets coordinates automatically.
//
// Runs after the server starts listening (never blocks startup - this
// makes a real network call per post) and only once ever, guarded by a
// site_settings flag exactly like db/index.js's other one-time migrations.
// Posts a handful of seconds apart so a large backlog can't hammer the
// free geocoding service.
const db = require('../db');
const { geocodeLocation } = require('./geocode');

const FLAG_KEY = 'migration_geo_backfill_done';
const DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillMissingCoordinates() {
  const already = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(FLAG_KEY);
  if (already) return;

  const rows = db
    .prepare(
      `SELECT id, location_text FROM posts
       WHERE type IN ('classified', 'listing') AND status != 'removed'
       AND location_lat IS NULL AND location_text IS NOT NULL AND location_text != ''`
    )
    .all();

  if (rows.length) console.log(`[geo-backfill] Geocoding ${rows.length} existing post(s) with no coordinates...`);
  let filled = 0;
  for (const row of rows) {
    try {
      const hit = await geocodeLocation(row.location_text);
      if (hit) {
        db.prepare('UPDATE posts SET location_lat = ?, location_lng = ? WHERE id = ?').run(hit.lat, hit.lng, row.id);
        filled++;
      }
    } catch (e) {
      console.error('[geo-backfill] Failed for post', row.id, '-', e.message);
    }
    await sleep(DELAY_MS);
  }

  db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    FLAG_KEY,
    JSON.stringify({ ranAt: Date.now(), total: rows.length, filled })
  );
  if (rows.length) console.log(`[geo-backfill] Done - filled in coordinates for ${filled}/${rows.length} post(s).`);
}

// Second one-time pass: location_city/location_state for posts that only
// have the free-text location. The City filter on the browse pages matched
// location_city alone, which was only ever set by an autocomplete click -
// so for most posts it matched nothing. Also fills coordinates where the
// first pass drew a blank (the geocoder is far more forgiving now).
const CITY_FLAG_KEY = 'migration_geo_city_backfill_done';

async function backfillMissingCities() {
  const already = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(CITY_FLAG_KEY);
  if (already) return;

  const rows = db
    .prepare(
      `SELECT id, location_text, location_lat, location_lng FROM posts
       WHERE status != 'removed' AND location_text IS NOT NULL AND location_text != ''
       AND (location_city IS NULL OR location_city = '' OR location_lat IS NULL)`
    )
    .all();

  if (rows.length) console.log(`[geo-backfill] Filling in city/state for ${rows.length} existing post(s)...`);
  let filled = 0;
  for (const row of rows) {
    try {
      const hit = await geocodeLocation(row.location_text);
      if (hit) {
        const lat = row.location_lat ?? hit.lat;
        const lng = row.location_lng ?? hit.lng;
        db.prepare('UPDATE posts SET location_city = COALESCE(NULLIF(location_city, \'\'), ?), location_state = COALESCE(location_state, ?), location_lat = ?, location_lng = ? WHERE id = ?')
          .run(hit.city || null, hit.state || null, lat, lng, row.id);
        filled++;
      }
    } catch (e) {
      console.error('[geo-backfill] City fill failed for post', row.id, '-', e.message);
    }
    await sleep(DELAY_MS);
  }

  db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    CITY_FLAG_KEY,
    JSON.stringify({ ranAt: Date.now(), total: rows.length, filled })
  );
  if (rows.length) console.log(`[geo-backfill] Done - filled in city/state for ${filled}/${rows.length} post(s).`);
}

module.exports = { backfillMissingCoordinates, backfillMissingCities };
