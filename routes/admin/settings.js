const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { sendMail } = require('../../utils/mailer');

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

// Sends a real email through whatever provider/credentials are currently
// saved, so the admin can confirm the setup actually works (and see the
// exact provider error if it doesn't) without having to post a test listing.
router.post('/test-email', async (req, res) => {
  const to = String(req.body.to || '').trim();
  if (!to || !to.includes('@')) return res.status(400).json({ error: 'A valid recipient email is required' });
  try {
    const result = await sendMail({
      to,
      subject: 'Test email from JListings',
      html: '<p>This is a test email sent from Admin → Settings → Outbound Email. If you received this, your email configuration works.</p>',
    });
    if (result?.messageId === 'dry-run') {
      return res.json({ ok: true, dryRun: true, message: 'No provider is configured (or no API key set) - this was logged to the server console instead of actually sent.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
