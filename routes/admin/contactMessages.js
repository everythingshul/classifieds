const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { sendMail } = require('../../utils/mailer');

const router = express.Router();
router.use(requireAdmin);

// Full history, newest first - the frontend filters archived vs. not, so
// nothing is ever permanently lost just by clearing it off the dashboard.
router.get('/', (req, res) => {
  const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 500').all();
  res.json({ messages });
});

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { archived } = req.body;
  db.prepare('UPDATE contact_messages SET archived = ? WHERE id = ?').run(archived ? 1 : 0, req.params.id);
  res.json(db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id));
});

// Sends a real reply email to the original sender and records it on the
// message so the conversation stays visible instead of disappearing once
// handled.
router.post('/:id/reply', async (req, res) => {
  const row = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const replyText = String(req.body.message || '').trim();
  if (!replyText) return res.status(400).json({ error: 'A reply message is required' });

  try {
    await sendMail({
      to: row.email,
      subject: `Re: ${row.subject || 'Your message'}`,
      html: `<p>${replyText.replace(/\n/g, '<br>')}</p><hr><p style="color:#888;font-size:12px">Your original message:</p><p style="color:#888;font-size:12px">${(row.message || '').replace(/\n/g, '<br>')}</p>`,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  db.prepare('UPDATE contact_messages SET reply_text = ?, replied_at = ?, archived = 1 WHERE id = ?').run(
    replyText, Date.now(), req.params.id
  );
  res.json(db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contact_messages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
