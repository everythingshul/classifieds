const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

// Never send these back to the browser in full once set - only whether a
// value is currently configured, via a companion "<key>_isSet" flag.
const SECRET_KEYS = new Set(['stripe_secret_key', 'stripe_webhook_secret', 'smtp_pass', 'brevo_api_key']);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM site_settings').all();
  const out = {};
  rows.forEach((r) => {
    const value = JSON.parse(r.value);
    if (SECRET_KEYS.has(r.key)) {
      out[`${r.key}_isSet`] = !!value;
    } else {
      out[r.key] = value;
    }
  });
  res.json(out);
});

router.put('/:key', (req, res) => {
  const { value } = req.body;
  db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    req.params.key,
    JSON.stringify(value)
  );
  res.json({ key: req.params.key, value });
});

module.exports = router;
