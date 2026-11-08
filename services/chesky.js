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
const { siteName, appUrl } = require('./emailLayout');
const { getAllClassifiedCategories } = require('./taxonomy');
const { getAllListingCategories } = require('./listingCategories');
const { currencyForHost } = require('./currency');
const { currentOrigin } = require('./requestContext');
const { CURRENCIES } = require('../utils/constants');

const CURRENCY_SYMBOLS = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol]));

// Which currency the visitor currently talking to Chesky would actually be
// charged (see services/currency.js) - available via AsyncLocalStorage
// (services/requestContext.js), so no req/hostname needs threading through
// routes/public/chat.js just for this.
function currentCurrency() {
  const origin = currentOrigin();
  if (!origin) return 'usd';
  try {
    return currencyForHost(new URL(origin).hostname);
  } catch (e) {
    return 'usd';
  }
}

const ReplySchema = z.object({
  reply: z.string(),
  // true when the question is outside what Chesky can help with here, or
  // Chesky doesn't actually know the answer - used to log it for the team
  // to review/teach, and to nudge the widget toward the "talk to a person" option.
  offTopic: z.boolean(),
  // true only when the visitor explicitly asked to have something passed
  // along/forwarded to the team - not for ordinary questions Chesky can
  // just answer itself.
  forwardToTeam: z.boolean(),
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

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'do', 'does', 'how', 'what', 'whats', 'where', 'when', 'why', 'who', 'i', 'my', 'me', 'to', 'for', 'of', 'on', 'in', 'with', 'and', 'or', 'have', 'has', 'you', 'your', 'it', 'this', 'that', 'there', 'any', 'about', 'can', 'will', 'im', 'ive', 'want', 'need', 'looking', 'post', 'posting']);

function extractKeywords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .slice(0, 8);
}

function postPublicPath(p) {
  const segment = p.type === 'simcha' ? 'simchas' : p.type === 'listing' ? 'listings' : 'classifieds';
  return `${appUrl()}/${segment}/${p.public_id}`;
}

// A quick keyword search over live posts, so Chesky can point to real
// inventory ("yes, here's one") instead of only speaking in generalities.
// Not exhaustive - just a few keywords from the question, best-effort.
function searchRelevantPosts(question, limit = 5) {
  const words = extractKeywords(question);
  if (!words.length) return [];
  const now = Date.now();
  const where = words.map(() => '(title LIKE ? OR description LIKE ? OR category LIKE ?)').join(' OR ');
  const params = [];
  words.forEach((w) => { const like = `%${w}%`; params.push(like, like, like); });
  const rows = db
    .prepare(`SELECT * FROM posts WHERE status = 'live' AND (expires_at IS NULL OR expires_at > ?) AND (${where}) ORDER BY is_featured_strike DESC, boosted_at DESC LIMIT ?`)
    .all(now, ...params, limit);
  return rows.map((p) => {
    let fields = {};
    try { fields = JSON.parse(p.fields || '{}'); } catch (e) { /* ignore */ }
    // An item's own asking price is whatever currency the poster chose for
    // it (fields.currency), not necessarily this visitor's own - a listed
    // price is a fact about the post, never converted.
    const symbol = CURRENCY_SYMBOLS[fields.currency] || '$';
    const price = fields.price !== undefined && fields.price !== null ? `${symbol}${fields.price}` : fields.priceText || null;
    const loc = [p.location_city, p.location_state].filter(Boolean).join(', ');
    return { title: p.title, category: p.category, location: loc, price, url: postPublicPath(p) };
  });
}

// Keyed by currency ('usd'/'gbp') - a .co.uk visitor and a .com visitor
// must never share a cached context, or one domain's pricing would leak
// into the other's conversation.
const contextCache = new Map();

// Live site facts the AI is grounded in, so it never has to guess or make up
// a category name or price - rebuilt at most once every 30s per currency.
function buildSiteContext() {
  const currency = currentCurrency();
  const cached = contextCache.get(currency);
  if (cached && Date.now() - cached.at < 30000) return cached.text;

  const isGbp = currency === 'gbp';
  const name = siteName();
  const classifiedCats = getAllClassifiedCategories().map((c) => c.label);
  const listingCats = getAllListingCategories().map((c) => c.label);
  // A GBP visitor (jlistings.co.uk) sees the GBP price as the real one
  // they'd pay - falling back to USD only if the admin never configured a
  // GBP price for that item, same all-or-nothing rule checkout itself uses
  // (services/pricing.js). Everyone else just sees USD, with no mention of
  // a currency that will never apply to them.
  const price = (usdCents, gbpCents) => {
    if (isGbp && gbpCents !== null && gbpCents !== undefined) return `£${(gbpCents / 100).toFixed(2)}`;
    return `$${(usdCents / 100).toFixed(2)}`;
  };
  const addons = db.prepare('SELECT key, price_cents, price_cents_gbp, config FROM addon_pricing').all();
  const addonLines = addons.map((a) => {
    const cfg = a.config ? JSON.parse(a.config) : {};
    const label = cfg.label || a.key;
    return `- ${label}: ${price(a.price_cents, a.price_cents_gbp)}`;
  });
  const tiers = db.prepare("SELECT category, post_type, name, duration_days, price_cents, price_cents_gbp FROM pricing_tiers WHERE active = 1 ORDER BY post_type, sort_order").all();
  const tierLines = tiers.map((t) => `- ${t.post_type === 'listing' ? 'Listing' : t.post_type === 'simcha' ? 'Simcha' : 'Classified'}${t.category ? ` (${t.category})` : ''}: ${t.name}, ${t.duration_days} days, ${t.price_cents ? price(t.price_cents, t.price_cents_gbp) : 'free'}`);

  const text = `
Site name: ${name}
Currency for this visitor: ${isGbp ? 'GBP (£) - they are on the .co.uk site' : 'USD ($)'}

Classifieds categories: ${classifiedCats.join(', ') || 'none configured'}
Listings categories: ${listingCats.join(', ') || 'none configured'}

Posting durations & prices (exact tier names/prices/durations can change - these are what's configured right now, already converted to this visitor's own currency):
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
  contextCache.set(currency, { text, at: Date.now() });
  return text;
}

function buildSystemPrompt(question) {
  const name = siteName();
  const posts = searchRelevantPosts(question);
  const postsBlock = posts.length
    ? `Live posts that might be relevant to this question right now (a quick keyword search, not the full inventory - treat it as "here's one I found," never as "this is everything available"):\n${posts.map((p) => `- ${p.title} (${p.category}${p.location ? `, ${p.location}` : ''}${p.price ? `, ${p.price}` : ''}) - ${p.url}`).join('\n')}`
    : `No live posts matched a quick keyword search for this question. That does NOT mean nothing exists - just that this search missed it. Never tell someone "there are none" or "nothing is available" - instead say you're not sure / didn't find a match, and point them to browsing or searching the site themselves.`;

  return `You are Chesky, the warm and genuinely helpful assistant for ${name}, a Jewish community classifieds, listings, and simchas (celebrations) website.

PERSONALITY - this matters a lot: talk like a kind, down-to-earth staff member texting a customer, not like a corporate bot. Use contractions (I'm, you'll, that's), vary your sentence openers, and let a little warmth and personality show. Never sound stiff, robotic, or like you're reading from a script. If someone seems confused, frustrated, or new to the site, be extra patient and reassuring - never curt, never cold. Treat every visitor like a valued member of the community, not a support ticket.

SCOPE: you only help with ${name} itself - how to post something, pricing, boosting/featuring a post, categories, editing or renewing a post, expired posts, contact/privacy on posts, general site navigation, and (per the live posts below) what's currently posted on the site. If someone asks about something unrelated to ${name} - general knowledge, other websites/companies, personal advice - don't answer it; warmly say that's outside what you can help with here, and set offTopic to true.

Ground every factual claim (prices, categories, policies, what's posted) ONLY in the facts given below - never invent a price, category, policy, or listing. If a question is about ${name} but you genuinely don't know the answer from what's given, say so honestly and warmly, offer to connect them with a person on the team, and set offTopic to true. Don't mention that you searched or that something is "a quick keyword search" - just answer naturally.

FORWARDING: if a visitor explicitly asks you to pass something along, forward a message, let the team/company know something, or send a complaint/request/report to the people who run the site - set forwardToTeam to true, and reply confirming warmly that you've passed it along (e.g. "Done - I let our team know!"). Only do this when they're clearly asking you to relay something, not for an ordinary question you can just answer yourself. Note in your reply that since they haven't given an email, the team can read it but can't write back unless they start a real conversation with "Talk to a real person."

Keep replies short (1-4 sentences), conversational, and plain text - no markdown, no bullet lists, no tables. Never say you're Claude, an AI, a language model, or name any AI company - you're just Chesky.

Site facts:
${buildSiteContext()}

${postsBlock}`;
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
      system: buildSystemPrompt(question),
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

module.exports = { ask, findLearnedMatch, normQ, buildSiteContext, buildSystemPrompt, searchRelevantPosts };
