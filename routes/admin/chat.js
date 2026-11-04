const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/adminAuth');
const { UPLOAD_DIR } = require('../../middleware/upload');
const { newPublicId } = require('../../utils/ids');
const { sendMail } = require('../../utils/mailer');
const { emailShell, escapeHtml, appUrl, siteName } = require('../../services/emailLayout');
const chesky = require('../../services/chesky');

const router = express.Router();
router.use(requireAdmin);

function summary(c) {
  const last = db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1').get(c.id);
  return {
    id: c.id, name: c.name, email: c.email, status: c.status, unread: !!c.unread,
    createdAt: c.created_at, updatedAt: c.updated_at,
    last: last ? (last.text || '(voice note)').slice(0, 120) : '',
    lastFrom: last ? last.from_role : '',
  };
}

function conversationOut(c) {
  const messages = db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id').all(c.id);
  return {
    id: c.id, name: c.name, email: c.email, status: c.status, unread: !!c.unread, page: c.page,
    createdAt: c.created_at, updatedAt: c.updated_at,
    messages: messages.map((m) => ({
      id: m.id, from: m.from_role, text: m.text, ts: m.created_at,
      ...(m.voice_url ? { voice: { url: m.voice_url, mime: m.voice_mime, dur: m.voice_dur, peaks: JSON.parse(m.voice_peaks || '[]') } } : {}),
    })),
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM chat_conversations ORDER BY updated_at DESC LIMIT 500').all();
  res.json({ conversations: rows.map(summary) });
});

router.get('/learn', (req, res) => {
  const unanswered = db.prepare('SELECT * FROM chat_unanswered ORDER BY (miss_count + down_count) DESC, last_at DESC LIMIT 300').all()
    .map((r) => ({ key: r.normalized_key, question: r.question, miss: r.miss_count, down: r.down_count, firstAt: r.first_at, lastAt: r.last_at }));
  const learned = db.prepare('SELECT * FROM chat_learned ORDER BY updated_at DESC').all()
    .map((r) => ({ id: r.id, questions: JSON.parse(r.questions || '[]'), answer: r.answer, createdAt: r.created_at, updatedAt: r.updated_at }));
  const stats = Object.fromEntries(
    db.prepare('SELECT * FROM chat_entry_stats').all().map((r) => [r.entry_id, { up: r.up_count, down: r.down_count, lastAt: r.last_at }])
  );
  res.json({ unanswered, learned, stats });
});

// Create or update a taught answer. `drop` (array of question strings) removes
// matching questions from the to-teach (unanswered) list - normally the exact
// unanswered question(s) this answer was taught for.
router.post('/learn/teach', (req, res) => {
  const { id, qs, r, drop } = req.body || {};
  const questions = (Array.isArray(qs) ? qs : [qs]).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12);
  const answer = String(r || '').trim().slice(0, 1500);
  if (!questions.length || !answer) return res.status(400).json({ error: 'A question and an answer are both needed.' });

  const now = Date.now();
  let entry;
  if (id) {
    const existing = db.prepare('SELECT * FROM chat_learned WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE chat_learned SET questions = ?, answer = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(questions), answer, now, id);
    entry = db.prepare('SELECT * FROM chat_learned WHERE id = ?').get(id);
  } else {
    const newId = 'L' + newPublicId(10);
    db.prepare('INSERT INTO chat_learned (id, questions, answer, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(newId, JSON.stringify(questions), answer, now, now);
    entry = db.prepare('SELECT * FROM chat_learned WHERE id = ?').get(newId);
  }

  const toDrop = [...(Array.isArray(drop) ? drop : []), ...questions].map((q) => chesky.normQ(q));
  const delStmt = db.prepare('DELETE FROM chat_unanswered WHERE normalized_key = ?');
  toDrop.forEach((k) => { if (k) delStmt.run(k); });

  res.json({ ok: true, entry: { id: entry.id, questions: JSON.parse(entry.questions), answer: entry.answer } });
});

router.post('/learn/forget', (req, res) => {
  db.prepare('DELETE FROM chat_learned WHERE id = ?').run(req.body.id);
  res.json({ ok: true });
});

router.delete('/learn/unanswered/:key', (req, res) => {
  db.prepare('DELETE FROM chat_unanswered WHERE normalized_key = ?').run(req.params.key);
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const conv = db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  if (conv.unread) db.prepare('UPDATE chat_conversations SET unread = 0 WHERE id = ?').run(conv.id);
  res.json(conversationOut(conv));
});

router.put('/:id', (req, res) => {
  const conv = db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const status = req.body.status === 'closed' ? 'closed' : 'open';
  db.prepare('UPDATE chat_conversations SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), conv.id);
  res.json(conversationOut(db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(conv.id)));
});

router.post('/:id/reply', async (req, res) => {
  const conv = db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const text = String(req.body.text || '').trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'Empty reply' });

  const now = Date.now();
  db.prepare('INSERT INTO chat_messages (conversation_id, from_role, text, created_at) VALUES (?, \'admin\', ?, ?)').run(conv.id, text, now);
  db.prepare('UPDATE chat_conversations SET status = \'open\', unread = 0, updated_at = ? WHERE id = ?').run(now, conv.id);

  let emailed = true;
  try {
    await sendMail({
      to: conv.email,
      subject: `Reply from ${siteName()}`,
      html: emailShell({
        eyebrow: 'Chat',
        heading: 'A reply to your message',
        bodyHtml: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
        ctaText: 'Continue the conversation',
        ctaUrl: `${appUrl()}/#chat=${conv.id}`,
      }),
    });
  } catch (e) { emailed = false; }

  // "Also teach Chesky": save this answer for the question it responded to.
  let taught = null;
  const teach = req.body.teach;
  if (teach && teach.q && teach.a) {
    const questions = [teach.q, ...(Array.isArray(teach.alts) ? teach.alts : [])].map((x) => String(x || '').trim()).filter(Boolean);
    const answer = String(teach.a || '').trim().slice(0, 1500);
    if (questions.length && answer) {
      const newId = 'L' + newPublicId(10);
      db.prepare('INSERT INTO chat_learned (id, questions, answer, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(newId, JSON.stringify(questions), answer, now, now);
      const delStmt = db.prepare('DELETE FROM chat_unanswered WHERE normalized_key = ?');
      questions.forEach((q) => delStmt.run(chesky.normQ(q)));
      taught = { id: newId };
    }
  }

  res.json({ ok: true, emailed, taught, conversation: conversationOut(db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(conv.id)) });
});

router.delete('/:id', (req, res) => {
  const conv = db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const voiceMessages = db.prepare('SELECT voice_url FROM chat_messages WHERE conversation_id = ? AND voice_url IS NOT NULL').all(conv.id);
  voiceMessages.forEach((m) => {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(m.voice_url))); } catch (e) { /* already gone */ }
  });
  db.prepare('DELETE FROM chat_conversations WHERE id = ?').run(conv.id);
  res.json({ ok: true });
});

module.exports = router;
