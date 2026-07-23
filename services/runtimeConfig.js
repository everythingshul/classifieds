const db = require('../db');

// Reads settings the admin can paste into the portal (Stripe keys, SMTP creds,
// Google Maps key, etc.) from the DB first, falling back to the equivalent env
// var. This lets the whole app be configured after deploy with no redeploy/
// restart needed, instead of only through environment variables.
function get(key, envVar) {
  try {
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
    if (row) {
      const v = JSON.parse(row.value);
      if (v !== '' && v !== null && v !== undefined) return v;
    }
  } catch (e) {
    // DB not ready yet - fall through to env var
  }
  return envVar !== undefined ? process.env[envVar] : undefined;
}

module.exports = { get };
