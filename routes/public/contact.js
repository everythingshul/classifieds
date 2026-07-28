const express = require('express');
const db = require('../../db');
const { notifyAdmin } = require('../../utils/mailer');
const { isValidEmail } = require('../../utils/validate');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 200);
    const email = String(req.body.email || '').trim().toLowerCase();
    const subject = String(req.body.subject || '').trim().slice(0, 200);
    const message = String(req.body.message || '').trim().slice(0, 5000);

    const errors = [];
    if (!isValidEmail(email)) errors.push('A valid email is required');
    if (!message) errors.push('A message is required');
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    db.prepare('INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
      name || null, email, subject || null, message, Date.now()
    );

    try {
      await notifyAdmin(
        `Contact form: ${subject || '(no subject)'}`,
        `<p><b>From:</b> ${name || '(no name)'} &lt;${email}&gt;</p><p><b>Message:</b></p><p>${message.replace(/\n/g, '<br>')}</p>`
      );
    } catch (e) {
      console.error('[contact] Failed to send contact notification email -', e.message);
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
