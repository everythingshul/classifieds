// Chesky: a floating help widget. Default mode asks the real AI (scoped to
// this site) instant questions; "Talk to a person" hands off to a real human
// conversation (polled for replies), with an optional voice note.
const Chesky = (() => {
  const STORAGE_CONV = 'chesky_conv_id';
  const STORAGE_NUDGE = 'chesky_nudge_seen';
  const STORAGE_TRANSCRIPT = 'chesky_transcript';

  let open = false;
  let convId = localStorage.getItem(STORAGE_CONV) || null;
  let convStatus = 'open';
  let pollTimer = null;
  let lastMsgId = 0;
  let transcript = [];
  try { transcript = JSON.parse(sessionStorage.getItem(STORAGE_TRANSCRIPT) || '[]'); } catch (e) { transcript = []; }
  let busy = false;
  let recorder = null;
  let recordedChunks = [];
  let recordStart = 0;
  let recordPeaks = [];
  let recordAnalyser = null;
  let recordStream = null;

  const STARTERS = ['How do I post a listing?', 'How much does boosting or featuring cost?', 'What happens when my post expires?'];

  function saveTranscript() {
    try { sessionStorage.setItem(STORAGE_TRANSCRIPT, JSON.stringify(transcript.slice(-16))); } catch (e) { /* ignore */ }
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function scrollLog() {
    const log = document.getElementById('cheskyLog');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function bubble(from, html, extraHtml = '') {
    const log = document.getElementById('cheskyLog');
    if (!log) return null;
    const who = from === 'visitor' ? '' : `<div class="chesky-msg-who">${from === 'admin' ? 'Team' : 'Chesky'}</div>`;
    const node = el(`<div class="chesky-msg from-${from}">${who}<div class="chesky-bubble">${html}</div>${extraHtml}</div>`);
    log.appendChild(node);
    scrollLog();
    return node;
  }

  function showTyping() {
    const log = document.getElementById('cheskyLog');
    if (!log) return null;
    const node = el('<div class="chesky-msg from-bot"><div class="chesky-typing"><span></span><span></span><span></span></div></div>');
    log.appendChild(node);
    scrollLog();
    return node;
  }

  function feedbackRow(question, entryId) {
    const row = el(`
      <div class="chesky-fb">
        <button type="button" data-fb="up" title="Helpful">&#128077;</button>
        <button type="button" data-fb="down" title="Not helpful">&#128078;</button>
      </div>
    `);
    row.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        row.querySelectorAll('button').forEach((b) => b.classList.remove('picked'));
        btn.classList.add('picked');
        Api.cheskyLog({ type: btn.dataset.fb, q: question, entry: entryId });
      });
    });
    return row.outerHTML;
  }

  function chipsHtml() {
    return `<div class="chesky-chips">${STARTERS.map((s) => `<button type="button" class="chesky-chip">${escapeHtml(s)}</button>`).join('')}</div>`;
  }

  function displayBotReply(question, result) {
    bubble('bot', escapeHtml(result.reply).replace(/\n/g, '<br>'), feedbackRow(question, result.entryId));
    transcript.push({ role: 'assistant', text: result.reply });
    saveTranscript();
    if (result.offTopic) {
      const log = document.getElementById('cheskyLog');
      log.appendChild(el(`<div style="text-align:center"><button type="button" class="chesky-talk-human" id="cheskyTalkHumanInline">Talk to a real person &rarr;</button></div>`));
      document.getElementById('cheskyTalkHumanInline').addEventListener('click', showHandoffForm);
      scrollLog();
    }
  }

  async function ask(question) {
    if (busy || !question.trim()) return;
    busy = true;
    document.querySelectorAll('.chesky-chip').forEach((c) => c.remove());
    bubble('visitor', escapeHtml(question));
    transcript.push({ role: 'user', text: question });
    saveTranscript();
    const typingNode = showTyping();
    try {
      const result = await Api.cheskyAsk(question, transcript);
      typingNode?.remove();
      displayBotReply(question, result);
    } catch (e) {
      typingNode?.remove();
      bubble('bot', "Sorry, something went wrong. Please try again, or talk to our team below.");
    } finally {
      busy = false;
    }
  }

  async function askVoice(voice) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('.chesky-chip').forEach((c) => c.remove());
    const typingNode = showTyping();
    try {
      const result = await Api.cheskyAskVoice(voice, transcript);
      typingNode?.remove();
      bubble('visitor', escapeHtml(result.transcript || '🎤 Voice note'));
      transcript.push({ role: 'user', text: result.transcript || '(voice note)' });
      saveTranscript();
      displayBotReply(result.transcript || '', result);
    } catch (e) {
      typingNode?.remove();
      bubble('bot', "Sorry, something went wrong with that voice note. Please try again, or type it instead.");
    } finally {
      busy = false;
    }
  }

  function renderAskFooter() {
    const foot = document.getElementById('cheskyFoot');
    foot.innerHTML = `
      <form class="chesky-form" id="cheskyAskForm">
        <div class="chesky-row">
          <button type="button" class="chesky-mic-btn" id="cheskyMicBtn" title="Ask with your voice">&#127908;</button>
          <textarea name="q" rows="1" placeholder="Ask Chesky a question..." required></textarea>
          <button type="submit">Send</button>
        </div>
      </form>
      <div style="text-align:center;padding:6px 0 10px"><button type="button" class="chesky-talk-human" id="cheskyTalkHumanBtn">Talk to a real person &rarr;</button></div>
    `;
    if (!(navigator.mediaDevices && window.MediaRecorder)) document.getElementById('cheskyMicBtn').style.display = 'none';
    document.getElementById('cheskyAskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const ta = e.target.q;
      const q = ta.value;
      ta.value = '';
      ask(q);
    });
    document.getElementById('cheskyMicBtn').addEventListener('click', toggleRecording);
    document.getElementById('cheskyTalkHumanBtn').addEventListener('click', showHandoffForm);
  }

  function showHandoffForm() {
    const foot = document.getElementById('cheskyFoot');
    foot.innerHTML = `
      <form class="chesky-handoff" id="cheskyHandoffForm">
        <div class="form-row"><label>Your name</label><input name="name" autocomplete="name"></div>
        <div class="form-row"><label>Email *</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="form-row"><label>Message</label><textarea name="message" rows="2"></textarea></div>
        <button type="submit">Start conversation</button>
      </form>
    `;
    document.getElementById('cheskyHandoffForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        const result = await Api.cheskyHandoff({
          name: fd.name, email: fd.email, message: fd.message, page: location.pathname,
          transcript: transcript.map((m) => ({ role: m.role === 'user' ? 'customer' : 'bot', text: m.text })),
        });
        convId = result.id;
        localStorage.setItem(STORAGE_CONV, convId);
        bubble('bot', "Thanks! A real person on our team will reply here soon - feel free to keep chatting.");
        lastMsgId = result.baselineId || 0;
        enterHandoffMode();
      } catch (err) {
        btn.disabled = false;
        toast(err.message);
      }
    });
  }

  function renderHandoffFooter() {
    const foot = document.getElementById('cheskyFoot');
    const disabled = convStatus === 'closed';
    foot.innerHTML = `
      ${disabled ? '<p class="hint" style="padding:8px 10px">This conversation has ended.</p>' : ''}
      <form class="chesky-form" id="cheskySendForm">
        <div class="chesky-row">
          <button type="button" class="chesky-mic-btn" id="cheskyMicBtn" title="Record a voice note">&#127908;</button>
          <textarea name="t" rows="1" placeholder="Type a message..." ${disabled ? 'disabled' : ''}></textarea>
          <button type="submit" ${disabled ? 'disabled' : ''}>Send</button>
        </div>
      </form>
    `;
    if (!(navigator.mediaDevices && window.MediaRecorder)) document.getElementById('cheskyMicBtn').style.display = 'none';
    document.getElementById('cheskySendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ta = e.target.t;
      const text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      bubble('visitor', escapeHtml(text));
      try {
        const result = await Api.cheskySend({ id: convId, text });
        if (result.lastId > lastMsgId) lastMsgId = result.lastId;
      } catch (err) { toast(err.message); }
    });
    document.getElementById('cheskyMicBtn').addEventListener('click', toggleRecording);
  }

  function enterHandoffMode() {
    renderHandoffFooter();
    startPolling();
  }

  function appendIncoming(messages) {
    messages.forEach((m) => {
      if (m.id > lastMsgId) lastMsgId = m.id;
      const content = m.voice
        ? `<audio controls src="${m.voice.url}" style="max-width:220px"></audio>`
        : escapeHtml(m.text || '').replace(/\n/g, '<br>');
      bubble(m.from, content);
    });
  }

  function startPolling() {
    stopPolling();
    const tick = async () => {
      if (!convId) return;
      try {
        const result = await Api.cheskyPoll(convId, lastMsgId);
        if (result.messages.length) {
          if (document.getElementById('cheskyLog')) appendIncoming(result.messages);
          else result.messages.forEach((m) => { if (m.id > lastMsgId) lastMsgId = m.id; });
          if (!open) {
            const fromOthers = result.messages.filter((m) => m.from !== 'visitor');
            if (fromOthers.length) showUnreadBadge(fromOthers.length);
          }
        }
        if (result.status !== convStatus) { convStatus = result.status; if (open) renderHandoffFooter(); }
      } catch (e) { /* transient - keep polling */ }
    };
    tick();
    pollTimer = setInterval(tick, open ? 4000 : 20000);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  function showUnreadBadge(n) {
    const fab = document.getElementById('cheskyFab');
    if (!fab) return;
    let badge = fab.querySelector('.chesky-unread');
    const count = (parseInt(badge?.textContent, 10) || 0) + n;
    if (!badge) { badge = el('<span class="chesky-unread"></span>'); fab.appendChild(badge); }
    badge.textContent = count > 9 ? '9+' : String(count);
  }

  async function toggleRecording() {
    const btn = document.getElementById('cheskyMicBtn');
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    try {
      recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast('Microphone access was denied.');
      return;
    }
    recordedChunks = [];
    recordPeaks = [];
    recordStart = Date.now();
    recorder = new MediaRecorder(recordStream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(recordStream);
      recordAnalyser = ctx.createAnalyser();
      recordAnalyser.fftSize = 256;
      source.connect(recordAnalyser);
      const data = new Uint8Array(recordAnalyser.frequencyBinCount);
      const sample = () => {
        if (!recorder || recorder.state !== 'recording') return;
        recordAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        recordPeaks.push(Math.round((avg / 255) * 100));
        setTimeout(sample, 250);
      };
      sample();
    } catch (e) { /* peaks are cosmetic - fine without them */ }
    recorder.onstop = onRecordingStop;
    recorder.start();
    btn.classList.add('recording');
    btn.textContent = '⏹';
  }

  async function onRecordingStop() {
    const btn = document.getElementById('cheskyMicBtn');
    btn.classList.remove('recording');
    btn.innerHTML = '&#127908;';
    recordStream?.getTracks().forEach((t) => t.stop());
    const dur = (Date.now() - recordStart) / 1000;
    if (dur < 0.6 || !recordedChunks.length) return;
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const b64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
      reader.readAsDataURL(blob);
    });
    const voice = { data: b64, mime: 'audio/webm', dur, peaks: recordPeaks };
    if (convId) {
      bubble('visitor', '🎤 Voice note');
      try {
        const result = await Api.cheskySend({ id: convId, voice });
        if (result.lastId > lastMsgId) lastMsgId = result.lastId;
      } catch (e) { toast('Could not send the voice note.'); }
    } else {
      askVoice(voice);
    }
  }

  function renderPanel() {
    const panel = document.getElementById('cheskyPanel');
    panel.innerHTML = `
      <div class="chesky-head">
        <img src="/img/chesky.svg" alt="">
        <div><strong>Chesky</strong><span>${window.SITE_CONFIG?.siteName || 'Here to help'}</span></div>
      </div>
      <div class="chesky-log" id="cheskyLog"></div>
      <div id="cheskyFoot"></div>
    `;
    bubble('bot', "Hi, I'm Chesky! Ask me anything about posting, pricing, or how the site works.");
    document.getElementById('cheskyLog').appendChild(el(chipsHtml()));
    document.querySelectorAll('.chesky-chip').forEach((chip) => chip.addEventListener('click', () => ask(chip.textContent)));
    if (convId) enterHandoffMode();
    else renderAskFooter();
  }

  function togglePanel(forceOpen) {
    open = forceOpen !== undefined ? forceOpen : !open;
    document.getElementById('cheskyFab').classList.toggle('open', open);
    document.getElementById('cheskyPanel').classList.toggle('open', open);
    document.getElementById('cheskyNudge').classList.remove('show');
    localStorage.setItem(STORAGE_NUDGE, '1');
    if (open) {
      if (!document.getElementById('cheskyLog')) renderPanel();
      document.getElementById('cheskyFab').querySelector('.chesky-unread')?.remove();
      scrollLog();
    }
    if (convId) startPolling();
  }

  function init() {
    if (document.getElementById('cheskyFab')) return;
    document.body.appendChild(el(`
      <button class="chesky-fab" id="cheskyFab" aria-label="Chat with Chesky">
        <img src="/img/chesky.svg" alt="">
        <span class="chesky-close-ico">&times;</span>
      </button>
    `));
    document.body.appendChild(el(`
      <div class="chesky-nudge" id="cheskyNudge">
        Hi! I'm Chesky - ask me anything about the site.
        <button type="button" aria-label="Dismiss">&times;</button>
      </div>
    `));
    document.body.appendChild(el('<div class="chesky-panel" id="cheskyPanel"></div>'));

    document.getElementById('cheskyFab').addEventListener('click', () => togglePanel());
    document.getElementById('cheskyNudge').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') { document.getElementById('cheskyNudge').classList.remove('show'); localStorage.setItem(STORAGE_NUDGE, '1'); return; }
      togglePanel(true);
    });

    if (!localStorage.getItem(STORAGE_NUDGE)) {
      setTimeout(() => { if (!open) document.getElementById('cheskyNudge').classList.add('show'); }, 4000);
    }
    if (convId) startPolling();
  }

  return { init };
})();
