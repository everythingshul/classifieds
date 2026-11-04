// Chesky's brain: a real Claude call, grounded in this site's live
// categories/pricing/policies and scoped to only talk about this site.
// Taught answers (chat_learned, via the admin "teach Chesky" inbox) are
// checked first and returned verbatim - the AI is only asked when nothing
// close enough has been taught.
const Anthropic = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { z } = require('zod');
const db = require('../db');
const runtimeConfig = require('../services/runtimeConfig');
const { siteName } = require('./emailLayout');
const { getAllClassifiedCategories } = require('./taxonomy');
const { getAllListingCategories } = require('./listingCategories');

const ReplySchema = z.object({
  reply: z.string(),
  // true when the question is outside what Chesky can help with here, or
  // Chesky doesn't actually know the answer - used to log it for the team
  // to review/teach, and to nudge the widget toward the "talk to a person" option.
  offTopic: z.boolean(),
});

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

// Levenshtein distance, used to fuzzy-match a visitor's question against the
// phrasings the team taught - small typos/rewording shouldn't miss a taught answer.
function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n];
}

function normQ(q) {
  return String(q || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Looks for a taught question close enough to count as the same question.
function findLearnedMatch(question) {
  const q = normQ(question);
  if (!q) return null;
  const rows = db.prepare('SELECT * FROM chat_learned ORDER BY updated_at DESC').all();
  let best = null;
  let bestDist = Infinity;
  for (const row of rows) {
    const questions = JSON.parse(row.questions || '[]');
    for (const trigger of questions) {
      const t = normQ(trigger);
      if (!t) continue;
      if (q === t) return { entry: row, distance: 0 };
      const dist = lev(q, t);
      const threshold = Math.max(2, Math.round(Math.max(q.length, t.length) * 0.25));
      if (dist <= threshold && dist < bestDist) {
        best = row;
        bestDist = dist;
      }
    }
  }
  return best ? { entry: best, distance: bestDist } : null;
}

let contextCache = null;
let contextCacheAt = 0;

// Live site facts the AI is grounded in, so it never has to guess or make up
// a category name or price - rebuilt at most once every 30s.
function buildSiteContext() {
  if (contextCache && Date.now() - contextCacheAt < 30000) return contextCache;

  const name = siteName();
  const classifiedCats = getAllClassifiedCategories().map((c) => c.label);
  const listingCats = getAllListingCategories().map((c) => c.label);
  const addons = db.prepare('SELECT key, price_cents, config FROM addon_pricing').all();
  const addonLines = addons.map((a) => {
    const cfg = a.config ? JSON.parse(a.config) : {};
    const label = cfg.label || a.key;
    return `- ${label}: $${(a.price_cents / 100).toFixed(2)}`;
  });
  const tiers = db.prepare("SELECT category, post_type, name, duration_days, price_cents FROM pricing_tiers WHERE active = 1 ORDER BY post_type, sort_order").all();
  const tierLines = tiers.map((t) => `- ${t.post_type === 'listing' ? 'Listing' : t.post_type === 'simcha' ? 'Simcha' : 'Classified'}${t.category ? ` (${t.category})` : ''}: ${t.name}, ${t.duration_days} days, ${t.price_cents ? `$${(t.price_cents / 100).toFixed(2)}` : 'free'}`);

  contextCache = `
Site name: ${name}

Classifieds categories: ${classifiedCats.join(', ') || 'none configured'}
Listings categories: ${listingCats.join(', ') || 'none configured'}

Posting durations & prices (exact tier names/prices/durations can change - these are what's configured right now):
${tierLines.join('\n') || '(none configured)'}

Boost / Feature add-ons (make a post appear higher or with a highlighted style):
${addonLines.join('\n') || '(none configured)'}

Policies to know:
- Lost & Found and any category marked "free" don't cost anything to post.
- Every photo is reviewed by a human before it appears - this is mainly to keep photos of people off the site, a hard rule here.
- Posts expire after their duration and stay on the site with an "Expired" stamp and no contact info shown, rather than disappearing - visitors can still see what was posted, just can't reach the poster anymore. The original poster can ask us to renew/repost.
- To boost or feature an existing post, the poster opens their post's page and uses the "Boost or Feature this listing" section with the email they posted under.
- Simchas (celebrations like a birth, bar/bat mitzvah, wedding) are a separate free-text section from Classifieds/Listings.
`.trim();
  contextCacheAt = Date.now();
  return contextCache;
}

function buildSystemPrompt() {
  const name = siteName();
  return `You are Chesky, the friendly help assistant for ${name}, a Jewish community classifieds, listings, and simchas (celebrations) website.

You ONLY help with questions about using ${name} itself: how to post something, pricing, boosting/featuring a post, categories, editing or renewing a post, expired posts, contact/privacy on posts, and general site navigation.

If someone asks anything else - general knowledge, other websites/companies, personal advice, or anything not about ${name} - do not answer it. Say warmly that it's outside what you can help with here, and set offTopic to true.

Ground every factual claim (prices, categories, policies) ONLY in the site facts given below. Never invent a price, category, or policy. If a question is about ${name} but you don't actually know the answer from the facts given, say so honestly, offer to connect them with a person on the team, and set offTopic to true.

Keep replies short (1-4 sentences), warm, and plain text - no markdown, no tables. Never say you are Claude, an AI, or name any AI company - you are just Chesky.

Site facts:
${buildSiteContext()}`;
}

const MODEL_FALLBACK = 'claude-opus-5-5';

// transcript: [{role: 'user'|'assistant', text}], oldest first, excluding the new question.
async function ask(question, transcript = []) {
  const c = getClient();
  if (!c) return { reply: "I'm not quite set up yet - please use the \"talk to our team\" option below.", offTopic: true, unavailable: true };

  const model = runtimeConfig.get('chesky_model') || MODEL_FALLBACK;
  const messages = [
    ...transcript.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text || '').slice(0, 1500) })),
    { role: 'user', content: String(question).slice(0, 1500) },
  ];

  try {
    const response = await c.messages.parse({
      model,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      output_config: { effort: 'low', format: zodOutputFormat(ReplySchema) },
      messages,
    });
    if (!response.parsed_output) return { reply: "Sorry, I didn't quite catch that - could you rephrase?", offTopic: true };
    return response.parsed_output;
  } catch (e) {
    console.error('[chesky] ask failed:', e.message);
    return { reply: "Something went wrong on my end - please try again, or talk to our team below.", offTopic: true, unavailable: true };
  }
}

module.exports = { ask, findLearnedMatch, normQ, buildSiteContext };
