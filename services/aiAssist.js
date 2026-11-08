// AI writing aids for the posting flow - a "polish this" button on the
// title/description a poster can use interactively, and a background
// keyword generator that runs automatically on every post (see
// services/postLifecycle.js's insertPost) to help search find it even when
// a visitor searches with different words than the post itself uses.
// Shares the same Anthropic client/model config as Chesky (services/
// chesky.js) - one Anthropic API key, configured once in Admin -> Settings.
const Anthropic = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { z } = require('zod');
const runtimeConfig = require('./runtimeConfig');

let client = null;
let clientKey = null;
function getClient() {
  const apiKey = runtimeConfig.get('anthropic_api_key', 'ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

const MODEL_FALLBACK = 'claude-opus-5-5';
function model() {
  return runtimeConfig.get('chesky_model') || MODEL_FALLBACK;
}

// The AI is told never to use em/en dashes, but this is the actual
// guarantee - any that slip through anyway get swapped for a plain hyphen
// before the text ever reaches a poster.
function stripDashes(text) {
  return String(text || '')
    .replace(/[–—]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function kindLabel(type) {
  return type === 'simcha' ? 'simcha announcement' : type === 'listing' ? 'business listing' : 'classified ad';
}

const PolishSchema = z.object({ text: z.string() });

async function polishText({ field, text, type, category }) {
  const c = getClient();
  if (!c) throw Object.assign(new Error('AI polish is not available right now'), { status: 503 });
  const trimmed = String(text || '').trim();
  if (!trimmed) throw Object.assign(new Error('Write something first, then polish it'), { status: 400 });

  const fieldName = field === 'title' ? 'title' : 'description';
  const system = `You polish the ${fieldName} of a ${kindLabel(type)} on a Jewish community classifieds website, written by the person posting it.

Fix grammar, spelling, and awkward phrasing. Make it clear, warm, and easy to read. Keep every fact, claim, and detail exactly as given - never invent or add anything that wasn't there (no made-up price, condition, size, date, or feature). Write in the same language as the original.

${field === 'title' ? 'Keep it a short title (not a full sentence), and close to its original length.' : "Don't pad it out or make it noticeably longer than the original."}

Never use an em dash or en dash anywhere in your output - use a comma, period, or "and" instead. Return plain text only: no markdown, no surrounding quotation marks, no labels like "Title:".`;

  const response = await c.messages.parse({
    model: model(),
    max_tokens: 500,
    system,
    output_config: { effort: 'low', format: zodOutputFormat(PolishSchema) },
    messages: [
      { role: 'user', content: `Category: ${category || 'n/a'}\n\nOriginal ${fieldName}:\n${trimmed.slice(0, 3000)}` },
    ],
  });
  const result = response.parsed_output?.text;
  if (!result) throw Object.assign(new Error('AI polish did not return a result - please try again'), { status: 502 });
  return stripDashes(result);
}

const KeywordsSchema = z.object({ keywords: z.array(z.string()).max(15) });

// Never surfaced to anyone - purely a background search aid. Failure here
// should never break post creation, so every caller treats a null return
// (no API key configured, or the call failed) as "just skip it for this post".
async function generateSearchKeywords({ title, description, category, type }) {
  const c = getClient();
  if (!c) return null;
  try {
    const system = `Generate search keywords for a ${kindLabel(type)} on a classifieds website, so a visitor searching with different words than the post itself still finds it. Give synonyms, related terms, common alternate spellings, and category-adjacent words a shopper might search instead of what's literally written - not a summary of the post. Lowercase, single words or short phrases, no punctuation, no duplicates of words already in the title or category.`;
    const response = await c.messages.parse({
      model: model(),
      max_tokens: 300,
      system,
      output_config: { effort: 'low', format: zodOutputFormat(KeywordsSchema) },
      messages: [
        { role: 'user', content: `Category: ${category || 'n/a'}\nTitle: ${title || ''}\nDescription: ${String(description || '').slice(0, 2000)}` },
      ],
    });
    const words = response.parsed_output?.keywords || [];
    const cleaned = words.map((w) => String(w).toLowerCase().trim()).filter(Boolean).slice(0, 15);
    return cleaned.length ? cleaned.join(' ') : null;
  } catch (e) {
    console.error('[aiAssist] keyword generation failed:', e.message);
    return null;
  }
}

module.exports = { polishText, generateSearchKeywords, stripDashes };
