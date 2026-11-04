// Speech-to-text for Chesky's voice notes, via OpenAI's Whisper API - Claude's
// own Messages API has no audio input type, so a transcription step comes first.
const runtimeConfig = require('./runtimeConfig');

const EXT_FOR_MIME = { 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

async function transcribeAudio(buffer, mime) {
  const apiKey = runtimeConfig.get('openai_api_key', 'OPENAI_API_KEY');
  if (!apiKey) throw Object.assign(new Error("Voice notes aren't set up yet - please type your question instead."), { status: 503 });

  const ext = EXT_FOR_MIME[mime] || 'webm';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `voice.${ext}`);
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[transcribe] OpenAI error:', res.status, errText);
    throw Object.assign(new Error('Could not transcribe that voice note - please try again or type it instead.'), { status: 502 });
  }
  const data = await res.json();
  return String(data.text || '').trim();
}

module.exports = { transcribeAudio };
