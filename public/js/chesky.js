// Chesky: a floating help widget. Default mode asks the real AI (scoped to
// this site) instant questions; "Talk to a person" hands off to a real human
// conversation (polled for replies), with an optional voice note.
const Chesky = (() => {
  const STORAGE_CONV = 'chesky_conv_id';
  const STORAGE_NUDGE = 'chesky_nudge_seen';
  const STORAGE_TRANSCRIPT = 'chesky_transcript';
  const MAX_RECORD_SECONDS = 60;
  const LIVE_BAR_COUNT = 27;

  let open = false;
  let convId = localStorage.getItem(STORAGE_CONV) || null;
  let convStatus = 'open';
  let pollTimer = null;
  let lastMsgId = 0;
  let transcript = [];
  try { transcript = JSON.parse(sessionStorage.getItem(STORAGE_TRANSCRIPT) || '[]'); } catch (e) { transcript = []; }
  let busy = false;
  let activeAudio = null;

  // Recording state
  let recorder = null;
  let recordedChunks = [];
  let recordStart = 0;
  let recordPeaks = [];
  let liveBars = [];
  let recordStream = null;
  let recordTimer = null;
  let recordAutoStop = null;
  let recordCancelled = false;
  let recordMode = 'ask'; // 'ask' | 'handoff' - which footer to restore when done

  const STARTERS = ['How do I post a listing?', 'How much does boosting or featuring cost?', 'What happens when my post expires?'];
  const MIC_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 11z"/></svg>';

  function saveTranscript() {
    try { sessionStorage.setItem(STORAGE_TRANSCRIPT, JSON.stringify(transcript.slice(-16))); } catch (e) { /* ignore */ }
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function fmtDur(s) {
    s = Math.max(0, Math.round(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function scrollLog() {
    const log = document.getElementById('cheskyLog');
    if (log) log.scrollTop = log.scrollHeight;
  }

  // -- Voice note bubble: a little play/pause + waveform player, with the
  // transcript (if any) shown as a caption underneath - "a recording plus
  // the transcription," not just one or the other.
  function voiceBubbleHtml(voice, transcriptText) {
    const peaks = (voice.peaks && voice.peaks.length) ? voice.peaks : Array.from({ length: 24 }, () => 25 + Math.round(Math.random() * 45));
    const bars = peaks.map((p) => `<i style="height:${Math.max(15, Math.min(100, p))}%"></i>`).join('');
    // Built as one unbroken line, not an indented multi-line template - the
    // bubble has white-space:pre-wrap, so stray newlines/indentation here
    // would render as real blank lines inside the bubble.
    const transcriptHtml = transcriptText ? `<div class="chesky-voice-transcript">${escapeHtml(transcriptText)}</div>` : '';
    return `<div class="chesky-voice" data-src="${escapeHtml(voice.url)}"><button type="button" class="chesky-vp-btn" aria-label="Play voice note">&#9654;</button><div class="chesky-vp-wave">${bars}</div><span class="chesky-vp-dur">${fmtDur(voice.dur)}</span></div>${transcriptHtml}`;
  }

  function wireVoicePlayers(root) {
    root.querySelectorAll('.chesky-voice:not([data-wired])').forEach((voiceEl) => {
      voiceEl.dataset.wired = '1';
      const btn = voiceEl.querySelector('.chesky-vp-btn');
      const bars = voiceEl.querySelectorAll('.chesky-vp-wave i');
      const audio = new Audio(voiceEl.dataset.src);
      btn.addEventListener('click', () => {
        if (audio.paused) {
          if (activeAudio && activeAudio !== audio) activeAudio.pause();
          activeAudio = audio;
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      });
      audio.addEventListener('play', () => { btn.innerHTML = '&#10073;&#10073;'; });
      audio.addEventListener('pause', () => { btn.innerHTML = '&#9654;'; });
      audio.addEventListener('ended', () => { bars.forEach((b) => b.classList.remove('on')); });
      audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const onCount = Math.round((audio.currentTime / audio.duration) * bars.length);
        bars.forEach((b, i) => b.classList.toggle('on', i < onCount));
      });
    });
  }

  function addCaption(node, text) {
    if (!node || !text) return;
    node.querySelector('.chesky-bubble')?.insertAdjacentHTML('beforeend', `<div class="chesky-voice-transcript">${escapeHtml(text)}</div>`);
  }

  function bubble(from, html, extraHtml = '') {
    const log = document.getElementById('cheskyLog');
    if (!log) return null;
    const who = from === 'visitor' ? '' : `<div class="chesky-msg-who">${from === 'admin' ? 'Team' : 'Chesky'}</div>`;
    const node = el(`<div class="chesky-msg from-${from}">${who}<div class="chesky-bubble">${html}</div>${extraHtml}</div>`);
    log.appendChild(node);
    wireVoicePlayers(log);
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

  // voice: {data, mime, dur, peaks} plus localUrl for instant local playback
  // (no need to wait on the server to hear your own just-recorded clip).
  async function askVoice(voice, localUrl) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('.chesky-chip').forEach((c) => c.remove());
    const node = bubble('visitor', voiceBubbleHtml({ url: localUrl, dur: voice.dur, peaks: voice.peaks }, ''));
    const typingNode = showTyping();
    try {
      const result = await Api.cheskyAskVoice(voice, transcript);
      addCaption(node, result.transcript);
      typingNode?.remove();
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

  function micAvailable() {
    return !!(navigator.mediaDevices && window.MediaRecorder);
  }

  function renderAskFooter() {
    const foot = document.getElementById('cheskyFoot');
    foot.innerHTML = `
      <form class="chesky-form" id="cheskyAskForm">
        <div class="chesky-row">
          <button type="button" class="chesky-mic-btn" id="cheskyMicBtn" title="Ask with your voice">${MIC_ICON}</button>
          <textarea name="q" rows="1" placeholder="Ask Chesky a question..." required></textarea>
          <button type="submit">Send</button>
        </div>
      </form>
      <div style="text-align:center;padding:6px 0 10px"><button type="button" class="chesky-talk-human" id="cheskyTalkHumanBtn">Talk to a real person &rarr;</button></div>
    `;
    if (!micAvailable()) document.getElementById('cheskyMicBtn').style.display = 'none';
    document.getElementById('cheskyAskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const ta = e.target.q;
      const q = ta.value;
      ta.value = '';
      ask(q);
    });
    document.getElementById('cheskyMicBtn').addEventListener('click', () => startRecording('ask'));
    document.getElementById('cheskyTalkHumanBtn').addEventListener('click', showHandoffForm);
  }

  function showHandoffForm() {
    const foot = document.getElementById('cheskyFoot');
    foot.innerHTML = `
      <form class="chesky-handoff" id="cheskyHandoffForm">
        <div class="chesky-handoff-head">
          <span>Talk to a real person</span>
          <button type="button" class="chesky-handoff-close" id="cheskyHandoffClose" aria-label="Cancel">&#10005;</button>
        </div>
        <div class="form-row"><label>Your name</label><input name="name" autocomplete="name"></div>
        <div class="form-row"><label>Email *</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="form-row"><label>Message</label><textarea name="message" rows="2"></textarea></div>
        <button type="submit">Start conversation</button>
      </form>
    `;
    document.getElementById('cheskyHandoffClose').addEventListener('click', renderAskFooter);
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
          <button type="button" class="chesky-mic-btn" id="cheskyMicBtn" title="Record a voice note">${MIC_ICON}</button>
          <textarea name="t" rows="1" placeholder="Type a message..." ${disabled ? 'disabled' : ''}></textarea>
          <button type="submit" ${disabled ? 'disabled' : ''}>Send</button>
        </div>
      </form>
    `;
    if (!micAvailable()) document.getElementById('cheskyMicBtn').style.display = 'none';
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
    document.getElementById('cheskyMicBtn').addEventListener('click', () => startRecording('handoff'));
  }

  function restoreFooter() {
    if (recordMode === 'handoff') renderHandoffFooter();
    else renderAskFooter();
  }

  // -- Recording toolbar: a live red dot + timer + scrolling waveform +
  // cancel/send, replacing the normal composer while recording.
  function renderRecordingToolbar() {
    const foot = document.getElementById('cheskyFoot');
    foot.innerHTML = `
      <div class="chesky-rec-row">
        <span class="chesky-rec-dot"></span>
        <span class="chesky-rec-time">0:00</span>
        <div class="chesky-rec-wave" id="cheskyRecWave"></div>
        <button type="button" class="chesky-rec-btn chesky-rec-cancel" id="cheskyRecCancel" aria-label="Cancel">&#10005;</button>
        <button type="button" class="chesky-rec-btn chesky-rec-send" id="cheskyRecSend" aria-label="Send">&#10148;</button>
      </div>
    `;
    document.getElementById('cheskyRecCancel').addEventListener('click', () => stopRecording(true));
    document.getElementById('cheskyRecSend').addEventListener('click', () => stopRecording(false));
  }

  function paintLiveWave() {
    const waveEl = document.getElementById('cheskyRecWave');
    if (waveEl) waveEl.innerHTML = liveBars.map((b) => `<i style="height:${Math.max(10, b)}%"></i>`).join('');
  }

  async function startRecording(mode) {
    if (recorder && recorder.state === 'recording') return;
    recordMode = mode;
    try {
      recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast('Microphone access was denied.');
      return;
    }
    recordedChunks = [];
    recordPeaks = [];
    liveBars = [];
    recordCancelled = false;
    recordStart = Date.now();
    recorder = new MediaRecorder(recordStream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
    recorder.onstop = onRecordingStop;

    renderRecordingToolbar();
    recordTimer = setInterval(() => {
      const timeEl = document.querySelector('.chesky-rec-time');
      if (timeEl) timeEl.textContent = fmtDur((Date.now() - recordStart) / 1000);
    }, 250);
    recordAutoStop = setTimeout(() => stopRecording(false), MAX_RECORD_SECONDS * 1000);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(recordStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
        if (!recorder || recorder.state !== 'recording') return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const level = Math.round((avg / 255) * 100);
        recordPeaks.push(level);
        liveBars.push(level);
        if (liveBars.length > LIVE_BAR_COUNT) liveBars.shift();
        paintLiveWave();
        setTimeout(sample, 220);
      };
      sample();
    } catch (e) { /* peaks are cosmetic - fine without them */ }

    recorder.start();
  }

  function stopRecording(cancelled) {
    if (!recorder || recorder.state !== 'recording') return;
    recordCancelled = cancelled;
    recorder.stop();
  }

  async function onRecordingStop() {
    clearInterval(recordTimer);
    clearTimeout(recordAutoStop);
    recordStream?.getTracks().forEach((t) => t.stop());
    restoreFooter();

    const dur = (Date.now() - recordStart) / 1000;
    if (recordCancelled || dur < 0.6 || !recordedChunks.length) return;

    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const localUrl = URL.createObjectURL(blob);
    const b64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
      reader.readAsDataURL(blob);
    });
    const voice = { data: b64, mime: 'audio/webm', dur, peaks: recordPeaks };

    if (convId) {
      const node = bubble('visitor', voiceBubbleHtml({ url: localUrl, dur, peaks: recordPeaks }, ''));
      try {
        const result = await Api.cheskySend({ id: convId, voice });
        if (result.lastId > lastMsgId) lastMsgId = result.lastId;
        addCaption(node, result.transcript);
      } catch (e) { toast('Could not send the voice note.'); }
    } else {
      askVoice(voice, localUrl);
    }
  }

  function enterHandoffMode() {
    renderHandoffFooter();
    startPolling();
  }

  function appendIncoming(messages) {
    messages.forEach((m) => {
      if (m.id > lastMsgId) lastMsgId = m.id;
      const content = m.voice ? voiceBubbleHtml(m.voice, m.text) : escapeHtml(m.text || '').replace(/\n/g, '<br>');
      bubble(m.from, content);
    });
  }

  function startPolling() {
    stopPolling();
    const tick = async () => {
      if (!convId) return;
      try {
        // lastMsgId only ever moves forward inside appendIncoming (once the
        // messages are actually on screen) - while the panel is closed the
        // log doesn't exist yet, so this intentionally keeps re-fetching
        // from the same baseline rather than silently marking unseen
        // messages as "seen" before the visitor ever had a chance to see them.
        const result = await Api.cheskyPoll(convId, lastMsgId);
        if (document.getElementById('cheskyLog')) {
          if (result.messages.length) appendIncoming(result.messages);
        } else if (!open) {
          const fromOthers = result.messages.filter((m) => m.from !== 'visitor');
          showUnreadBadge(fromOthers.length);
        }
        if (result.status !== convStatus) { convStatus = result.status; if (open) renderHandoffFooter(); }
      } catch (e) { /* transient - keep polling */ }
    };
    tick();
    pollTimer = setInterval(tick, open ? 4000 : 20000);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  // n is the total unseen count (not a delta) - each closed-state poll
  // re-fetches the same backlog, so this always replaces rather than adds.
  function showUnreadBadge(n) {
    const fab = document.getElementById('cheskyFab');
    if (!fab) return;
    let badge = fab.querySelector('.chesky-unread');
    if (!n) { badge?.remove(); return; }
    if (!badge) { badge = el('<span class="chesky-unread"></span>'); fab.appendChild(badge); }
    badge.textContent = n > 9 ? '9+' : String(n);
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
    // renderPanel() (via enterHandoffMode) already starts polling at the
    // right cadence the first time the log is created - calling it again
    // right after would fire a second concurrent tick before the first one's
    // lastMsgId update lands, double-appending the whole history.
    const logExisted = !!document.getElementById('cheskyLog');
    if (open) {
      if (!logExisted) renderPanel();
      document.getElementById('cheskyFab').querySelector('.chesky-unread')?.remove();
      scrollLog();
    }
    if (convId && logExisted) startPolling();
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
