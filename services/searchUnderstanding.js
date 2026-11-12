// Claude reads what a visitor typed into any search box or location field
// and says what they actually want: the real subject (plumber), other words
// that mean the same thing in English, Hebrew and Yiddish transliteration
// (sheitel, wig, peruke), which category it belongs in, and which of the
// site's location categories they mean (nickname, street or misspelling
// included). The shared search (services/searchQuery.js) then runs with that
// understanding added to what was typed, never instead of it, so a slow or
// failed call just means the normal search runs.
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const runtimeConfig = require('./runtimeConfig');
const locations = require('./locations');
const { getAllClassifiedCategories, getAllListingCategories } = require('./taxonomy');

const TIMEOUT_MS = 5000;
const CACHE_MAX = 800;
const CACHE_TTL = 24 * 3600 * 1000;
const cache = new Map();

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

const SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string', description: 'The core thing they want, without location words or filler. Empty if they typed only a place.' },
    alternatives: { type: 'array', items: { type: 'string' }, description: 'Up to 8 other words or short phrases people use for the same thing: synonyms, plural/singular, Hebrew or Yiddish terms in English letters, common misspellings. Empty if none.' },
    categoryKey: { type: 'string', description: 'Exact category key from the list that fits best, or empty.' },
    locationName: { type: 'string', description: 'The exact name from the location list they mean (from the search words or the place field), or empty.' },
    locationWasInSearchWords: { type: 'boolean', description: 'True if the place came from the search words rather than the place field.' },
  },
  required: ['subject', 'alternatives', 'categoryKey', 'locationName', 'locationWasInSearchWords'],
  additionalProperties: false,
};

function stableSystem(section) {
  const cats = (section === 'listings' ? getAllListingCategories() : getAllClassifiedCategories()).map((c) => `${c.key} (${c.label})`);
  const places = locations.loadAll().map((l) => l.name);
  return `You turn a visitor's search into structured intent for a Jewish community ${section === 'listings' ? 'business directory' : 'classifieds'} site. Visitors write English, Hebrew, Yiddish in English letters, abbreviations and typos. Be literal about what they asked for: do not broaden or guess a different product. Only fill locationName when the text clearly names or nicknames one listed place. Copy categoryKey and locationName exactly from the lists.

Categories:
${cats.join('\n')}

Locations:
${places.join('\n')}`;
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

async function callClaude(q, city, section) {
  const c = getClient();
  if (!c) return null;
  const res = await c.messages.create({
    model: runtimeConfig.get('search_model') || runtimeConfig.get('chesky_model') || 'claude-opus-5-5',
    max_tokens: 700,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: stableSystem(section), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Search words: ${JSON.stringify(String(q || '').slice(0, 200))}\nPlace field: ${JSON.stringify(String(city || '').slice(0, 120))}` }],
  });
  if (res.stop_reason === 'refusal') return null;
  const block = res.content.find((b) => b.type === 'text');
  return block ? JSON.parse(block.text) : null;
}

function shape(raw) {
  if (!raw) return null;
  const loc = raw.locationName ? locations.loadAll().find((l) => l.name === raw.locationName) : null;
  return {
    subject: String(raw.subject || '').slice(0, 80),
    terms: (raw.alternatives || []).map((t) => String(t).slice(0, 40)).filter(Boolean).slice(0, 8),
    categoryKey: raw.categoryKey || '',
    location: loc ? { id: loc.id, name: loc.name, phrases: loc.phrases } : null,
    locationFromQuery: !!raw.locationWasInSearchWords,
  };
}

// Returns the understanding or null. Never throws, never waits longer than
// TIMEOUT_MS (the call keeps going in the background to fill the cache).
async function understand({ q, city, section = 'classifieds' }) {
  if (runtimeConfig.get('ai_search_enabled') === false) return null;
  const key = `${section}|${norm(q)}|${norm(city)}`;
  if (!norm(q) && !norm(city)) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
  if (!getClient()) return null;

  const work = callClaude(q, city, section)
    .then(shape)
    .catch((e) => { console.error('[search-ai] failed:', e.message); return null; })
    .then((value) => {
      if (value) {
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
        cache.set(key, { at: Date.now(), value });
      }
      return value;
    });
  return Promise.race([work, new Promise((r) => setTimeout(() => r(null), TIMEOUT_MS))]);
}

module.exports = { understand };
