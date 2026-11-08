const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { newPublicId } = require('../../utils/ids');
const { saveVoiceNote, VOICE_MIME_EXT, ALLOWED_MIME: ALLOWED_IMAGE_MIME } = require('../../middleware/upload');
const { sendMail, notifyAdmin } = require('../../utils/mailer');
const { emailShell, escapeHtml, appUrl, siteName } = require('../../services/emailLayout');
const chesky = require('../../services/chesky');
const { transcribeAudio } = require('../../services/transcribe');

const router = express.Router();

const askLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const handoffLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const sendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const logLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 1500;
const MAX_MESSAGES = 300;
const MAX_VOICE_B64 = 3_200_000; // ~2.4MB of audio
const MAX_VOICE_SECONDS = 65;
const MAX_IMAGE_B64 = 8_000_000; // ~6MB of photo, matches middleware/upload.js's 8MB multer ceiling

function clean(v, max) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}
function oneLine(v, max) {
  return clean(v, max).replace(/[\r\n]+/g, ' ');
}

// Validates & saves a voice note sent as {data (base64), mime, dur, peaks},
// and best-effort transcribes it (via Whisper) so the recording always comes
// with a readable caption - never fails the send if transcription itself fails.
async function handleVoice(v) {
  if (!v || typeof v.data !== 'string' || !v.data || v.data.length > MAX_VOICE_B64) return null;
  const mime = String(v.mime || '').split(';')[0].toLowerCase();
  if (!VOICE_MIME_EXT[mime] || !/^[A-Za-z0-9+/]+=*$/.test(v.data)) return null;
  let bytes;
  try { bytes = Buffer.from(v.data, 'base64'); } catch { return null; }
  if (bytes.length < 200) return null;
  const filename = saveVoiceNote(bytes, mime);
  if (!filename) return null;
  const dur = Math.max(0.5, Math.min(MAX_VOICE_SECONDS, Number(v.dur) || 0));
  const peaks = (Array.isArray(v.peaks) ? v.peaks : []).slice(0, 48).map((n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0))));
  let transcript = '';
  try { transcript = await transcribeAudio(bytes, mime); } catch (e) { /* no transcript available - the recording still sends fine */ }
  return { voice_url: `/uploads/${filename}`, voice_mime: mime, voice_dur: dur, voice_peaks: JSON.stringify(peaks), transcript };
}

// Validates a photo sent as {data (base64), mime} for Chesky's create_post
// tool - unlike handleVoice, this never writes to disk itself: most photos
// shown to Chesky are never actually posted, so only services/postSubmit.js's
// usual image pipeline (via execCreatePost) should ever save one, the same
// way a photo from the regular post wizard does (moderation queue, EXIF
// stripped, re-encoded - see middleware/upload.js's processAndSaveImage).
function handleChatImage(img) {
  if (!img || typeof img.data !== 'string' || !img.data || img.data.length > MAX_IMAGE_B64) return null;
  const mime = String(img.mime || '').split(';')[0].toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime) || !/^[A-Za-z0-9+/]+=*$/.test(img.data)) return null;
  let buffer;
  try { buffer = Buffer.from(img.data, 'base64'); } catch { return null; }
  if (buffer.length < 200) return null;
  return { buffer, mime };
}

function messageOut(m) {
  return {
    id: m.id,
    from: m.from_role,
    text: m.text,
    ts: m.created_at,
    ...(m.voice_url ? { voice: { url: m.voice_url, mime: m.voice_mime, dur: m.voice_dur, peaks: JSON.parse(m.voice_peaks || '[]') } } : {}),
  };
}

function getConv(id) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(id || '')) return null;
  return db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(id);
}

function touchConv(id) {
  db.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

const chatLink = (id) => `${appUrl()}/#chat=${id}`;

async function mailAdminNewChat(conv, text, isNew) {
  await notifyAdmin(
    `${isNew ? 'New chat request' : 'New chat message'} from ${oneLine(conv.name || conv.email, 80)}`,
    `
      <p>${escapeHtml(text || '(voice note)').replace(/\n/g, '<br>')}</p>
      <p style="margin-top:14px;font-size:12px;color:#62666b">From ${escapeHtml(conv.email)}${conv.page ? ` on ${escapeHtml(conv.page)}` : ''}</p>
    `,
    { ctaText: 'View in admin', ctaUrl: `${appUrl()}/admin/#/chat/${conv.id}` }
  );
}

// -- AI ask (stateless - no handoff conversation created) --
// Checks taught answers first, otherwise asks the AI, logging a miss when
// it couldn't help so the team can teach it.
// Relays a message to the admin on the visitor's behalf - one-way, since the
// AI-chat flow never collects an email (that only happens via /handoff).
// Logged into contact_messages too, so it shows up in the same Messages
// inbox as the contact form, not just an email that's easy to miss.
async function forwardMessageToTeam(question, page) {
  try {
    const subject = 'Message forwarded by Chesky';
    const bodyHtml = `<p>${escapeHtml(question)}</p><p style="margin-top:14px;font-size:12px;color:#62666b">Relayed by Chesky (AI chat) - no reply address given.${page ? ` From ${escapeHtml(page)}.` : ''}</p>`;
    db.prepare('INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('Chesky (on behalf of a visitor)', '', subject, question, Date.now());
    await notifyAdmin(subject, bodyHtml);
  } catch (e) {
    console.error('[chat] forwardMessageToTeam failed:', e.message);
  }
}

async function answerQuestion(question, transcript, page, image, hadVoice) {
  // A photo or voice note changes the answer (Chesky can actually see/hear
  // what they sent), so skip the taught-answer shortcut entirely whenever
  // one is attached - it would otherwise return a canned answer that never
  // looked at the attachment.
  if (!image && !hadVoice) {
    const learned = chesky.findLearnedMatch(question);
    if (learned) return { reply: learned.entry.answer, offTopic: false, entryId: learned.entry.id };
  }

  const result = await chesky.ask(question, transcript, image, hadVoice);
  if (result.offTopic) {
    const key = chesky.normQ(question);
    if (key) {
      const now = Date.now();
      const existing = db.prepare('SELECT * FROM chat_unanswered WHERE normalized_key = ?').get(key);
      if (existing) db.prepare('UPDATE chat_unanswered SET miss_count = miss_count + 1, last_at = ? WHERE normalized_key = ?').run(now, key);
      else db.prepare('INSERT INTO chat_unanswered (normalized_key, question, miss_count, down_count, first_at, last_at) VALUES (?, ?, 1, 0, ?, ?)').run(key, question, now, now);
    }
  }
  if (result.forwardToTeam) await forwardMessageToTeam(question, page);
  return {
    reply: result.reply,
    offTopic: !!result.offTopic,
    entryId: 'ai',
    postCreated: result.postCreated || null,
    checkout: result.checkout || null,
  };
}

// A visitor can attach a photo and/or a voice note to one message (e.g.
// "send me a picture and a voice note of what you want to sell and I'll
// take care of the rest" - see services/chesky.js's system prompt), on top
// of or instead of typed text. The voice note is transcribed here (Whisper -
// Claude itself has no audio input) and merged into the question text
// Chesky actually sees; voiceTranscript comes back separately so the
// widget can caption the voice bubble with it.
router.post('/ask', askLimiter, async (req, res, next) => {
  try {
    const transcript = Array.isArray(req.body.transcript) ? req.body.transcript.slice(-12) : [];
    const page = oneLine(req.body.page, 100);

    const image = req.body.image ? handleChatImage(req.body.image) : null;
    if (req.body.image && !image) return res.status(400).json({ error: 'That photo could not be used - please try a JPG, PNG, or WEBP under 6MB.' });

    let voiceTranscript = null;
    if (req.body.voice) {
      const v = req.body.voice;
      if (typeof v.data !== 'string' || !v.data || v.data.length > MAX_VOICE_B64) return res.status(400).json({ error: 'That voice note could not be used.' });
      const mime = String(v.mime || '').split(';')[0].toLowerCase();
      if (!VOICE_MIME_EXT[mime] || !/^[A-Za-z0-9+/]+=*$/.test(v.data)) return res.status(400).json({ error: 'Unsupported audio format' });
      let bytes;
      try { bytes = Buffer.from(v.data, 'base64'); } catch { return res.status(400).json({ error: 'Invalid audio data' }); }
      if (bytes.length < 200) return res.status(400).json({ error: 'That voice note was too short.' });
      try {
        voiceTranscript = await transcribeAudio(bytes, mime);
      } catch (e) {
        return res.status(e.status || 500).json({ error: e.message });
      }
    }

    const typedText = clean(req.body.question, MAX_TEXT);
    const combined = [typedText, voiceTranscript].filter(Boolean).join('\n').trim();

    if (!combined && !image) {
      // A voice note was sent but came back unclear/silent (not the same as
      // "nothing was sent at all") - a friendly retry prompt, not a hard error.
      if (req.body.voice) return res.json({ reply: "Sorry, I couldn't make out what you said - could you try again, or type it instead?", offTopic: true, entryId: 'ai', voiceTranscript: '' });
      return res.status(400).json({ error: 'A question is required' });
    }

    const result = await answerQuestion(combined || '(sent a photo)', transcript, page, image, !!req.body.voice);
    res.json({ ...result, voiceTranscript });
  } catch (e) {
    next(e);
  }
});

// -- Human handoff --
router.post('/handoff', handoffLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};
    const email = oneLine(b.email, 200);
    const message = clean(b.message, MAX_TEXT);
    const voice = b.voice ? await handleVoice(b.voice) : null;
    if (b.voice && !voice) return res.status(400).json({ error: 'That voice note could not be used. Please try recording it again.' });
    if (!EMAIL_RE.test(email) || (!message && !voice)) return res.status(400).json({ error: 'Please give a valid email and a message.' });

    const now = Date.now();
    const id = newPublicId(22);
    const name = oneLine(b.name, 120);
    const page = oneLine(b.page, 100);
    db.prepare('INSERT INTO chat_conversations (id, name, email, status, unread, page, created_at, updated_at, notified_at) VALUES (?, ?, ?, \'open\', 1, ?, ?, ?, ?)')
      .run(id, name, email, page, now, now, now);

    const earlier = (Array.isArray(b.transcript) ? b.transcript : []).slice(-20);
    const insertMsg = db.prepare('INSERT INTO chat_messages (conversation_id, from_role, text, created_at) VALUES (?, ?, ?, ?)');
    // The widget already shows this transcript locally (it's how the AI-chat log
    // got there) - baselineId lets the client skip re-displaying it on first poll.
    let baselineId = 0;
    earlier.forEach((m) => {
      const t = clean(m && m.text, 600);
      if (t) baselineId = insertMsg.run(id, m && m.role === 'customer' ? 'visitor' : 'bot', t, now).lastInsertRowid;
    });
    if (message) insertMsg.run(id, 'visitor', message, now);
    if (voice) {
      db.prepare('INSERT INTO chat_messages (conversation_id, from_role, text, voice_url, voice_mime, voice_dur, voice_peaks, created_at) VALUES (?, \'visitor\', ?, ?, ?, ?, ?, ?)')
        .run(id, voice.transcript || '', voice.voice_url, voice.voice_mime, voice.voice_dur, voice.voice_peaks, now);
    }

    const conv = { id, name, email, page };
    try { await mailAdminNewChat(conv, message || voice?.transcript || '(voice note)', true); } catch (e) { console.error('[chat] admin mail failed:', e.message); }
    try {
      await sendMail({
        to: email,
        subject: `We received your message - ${siteName()}`,
        html: emailShell({
          eyebrow: 'Chat',
          heading: 'We received your message',
          bodyHtml: `<p>Thanks for reaching out${name ? `, ${escapeHtml(name)}` : ''} - a real person on our team will reply soon. You can keep chatting any time from the link below.</p>`,
          ctaText: 'View the conversation',
          ctaUrl: chatLink(id),
        }),
      });
    } catch (e) { console.error('[chat] visitor mail failed:', e.message); }

    res.json({ id, baselineId, transcript: voice?.transcript || '', count: db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE conversation_id = ?').get(id).c });
  } catch (e) {
    next(e);
  }
});

router.post('/send', sendLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};
    const conv = getConv(b.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    if (conv.status === 'closed') return res.status(409).json({ error: 'This conversation is closed' });
    const count = db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE conversation_id = ?').get(conv.id).c;
    if (count >= MAX_MESSAGES) return res.status(409).json({ error: 'Too long' });

    let text = clean(b.text, MAX_TEXT);
    let voice = null;
    if (b.voice) {
      voice = await handleVoice(b.voice);
      if (!voice) return res.status(400).json({ error: 'That voice note could not be used.' });
    }
    if (!text && !voice) return res.status(400).json({ error: 'Empty message' });

    const now = Date.now();
    let lastId = 0;
    if (text) lastId = db.prepare('INSERT INTO chat_messages (conversation_id, from_role, text, created_at) VALUES (?, \'visitor\', ?, ?)').run(conv.id, text, now).lastInsertRowid;
    if (voice) {
      lastId = db.prepare('INSERT INTO chat_messages (conversation_id, from_role, text, voice_url, voice_mime, voice_dur, voice_peaks, created_at) VALUES (?, \'visitor\', ?, ?, ?, ?, ?, ?)')
        .run(conv.id, voice.transcript || '', voice.voice_url, voice.voice_mime, voice.voice_dur, voice.voice_peaks, now).lastInsertRowid;
      text = [text, voice.transcript ? `🎤 ${voice.transcript}` : '🎤 Voice note'].filter(Boolean).join('\n\n');
    }
    db.prepare('UPDATE chat_conversations SET unread = 1, updated_at = ? WHERE id = ?').run(now, conv.id);

    // Don't email the team for every line of a quick back-and-forth.
    const notify = !conv.notified_at || now - conv.notified_at > 30000;
    if (notify) {
      db.prepare('UPDATE chat_conversations SET notified_at = ? WHERE id = ?').run(now, conv.id);
      try { await mailAdminNewChat(conv, text, false); } catch (e) { console.error('[chat] admin mail failed:', e.message); }
    }
    res.json({ ok: true, count: count + 1, lastId, transcript: voice?.transcript || '' });
  } catch (e) {
    next(e);
  }
});

router.get('/poll', (req, res, next) => {
  try {
    const conv = getConv(req.query.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    const after = Math.max(0, parseInt(req.query.after, 10) || 0);
    const rows = db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? AND id > ? ORDER BY id').all(conv.id, after);
    res.json({ messages: rows.map(messageOut), status: conv.status });
  } catch (e) {
    next(e);
  }
});

// Public, read-only - what the team has taught Chesky.
router.get('/learned', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT id, questions, answer FROM chat_learned ORDER BY updated_at DESC LIMIT 200').all();
    res.json({ entries: rows.map((r) => ({ id: r.id, questions: JSON.parse(r.questions || '[]'), answer: r.answer })) });
  } catch (e) {
    next(e);
  }
});

// Anonymous feedback: thumbs up/down on a reply, or "Chesky couldn't answer this".
router.post('/log', logLimiter, (req, res) => {
  try {
    const type = ['miss', 'down', 'up'].includes(req.body.type) ? req.body.type : null;
    const q = clean(req.body.q, 200);
    const entryId = /^[\w:-]{1,40}$/.test(String(req.body.entry || '')) ? String(req.body.entry) : '';
    if (!type || !q) return res.json({ ok: true });
    const now = Date.now();

    if (entryId && (type === 'up' || type === 'down')) {
      const col = type === 'up' ? 'up_count' : 'down_count';
      db.prepare(`INSERT INTO chat_entry_stats (entry_id, up_count, down_count, last_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(entry_id) DO UPDATE SET ${col} = ${col} + 1, last_at = excluded.last_at`)
        .run(entryId, type === 'up' ? 1 : 0, type === 'down' ? 1 : 0, now);
    }
    if (type === 'miss' || type === 'down') {
      const key = chesky.normQ(q);
      if (key) {
        const existing = db.prepare('SELECT * FROM chat_unanswered WHERE normalized_key = ?').get(key);
        if (existing) {
          const col = type === 'miss' ? 'miss_count' : 'down_count';
          db.prepare(`UPDATE chat_unanswered SET ${col} = ${col} + 1, last_at = ? WHERE normalized_key = ?`).run(now, key);
        } else {
          db.prepare('INSERT INTO chat_unanswered (normalized_key, question, miss_count, down_count, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(key, q, type === 'miss' ? 1 : 0, type === 'down' ? 1 : 0, now, now);
        }
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: true });
  }
});

module.exports = router;
