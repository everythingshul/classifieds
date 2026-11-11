// Chesky's brain: a real Claude call, grounded in this site's live
// categories/pricing/policies and scoped to only talk about this site.
// Taught answers (chat_learned, via the admin "teach Chesky" inbox) are
// checked first and returned verbatim - the AI is only asked when nothing
// close enough has been taught.
//
// Runs a tool-use loop rather than a single structured-output call, so
// Chesky can actually post for a visitor and sign them up for email
// updates, not just talk about how to do it. A dedicated `respond` tool is
// the only way a turn ends - the model always sees the real outcome of any
// create_post/subscribe_to_updates call before it writes what to tell the
// visitor, so it never narrates success (or a price) it hasn't confirmed.
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const runtimeConfig = require('../services/runtimeConfig');
const { siteName, appUrl } = require('./emailLayout');
const { getAllClassifiedCategories, findCategory } = require('./taxonomy');
const { getAllListingCategories, findListingCategory } = require('./listingCategories');
const { getTiersForCategory, getListingTiersForCategory, getClassifiedCharLimits, getListingCharLimits, getOversizedCharLimits } = require('./pricing');
const { currencyForHost } = require('./currency');
const { currentOrigin } = require('./requestContext');
const { CURRENCIES } = require('../utils/constants');
const { submitPost, ValidationError } = require('./postSubmit');
const { buildContactLinks } = require('./postFormat');
const { isValidEmail } = require('../utils/validate');
const { newPublicId } = require('../utils/ids');
const { validTopicValues, sendConfirmationEmail } = require('./emailDigest');

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

function currentHostname() {
  const origin = currentOrigin();
  if (!origin) return undefined;
  try {
    return new URL(origin).hostname;
  } catch (e) {
    return undefined;
  }
}

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

// Full search over live posts for Chesky's search_posts tool - not a
// one-shot guess at the opening message, a real tool the model can call
// (and re-call with different terms/filters) whenever it needs to check
// what's actually posted, so it can point to real inventory instead of
// speaking in generalities.
function queryPosts({ query, type, category } = {}, limit = 8) {
  const now = Date.now();
  const clauses = ["status = 'live'", '(expires_at IS NULL OR expires_at > ?)'];
  const params = [now];
  if (['classified', 'listing', 'simcha'].includes(type)) {
    clauses.push('type = ?');
    params.push(type);
  }
  if (category) {
    clauses.push('category = ?');
    params.push(category);
  }
  const words = extractKeywords(query);
  if (words.length) {
    clauses.push(`(${words.map(() => '(title LIKE ? OR description LIKE ? OR category LIKE ?)').join(' OR ')})`);
    words.forEach((w) => { const like = `%${w}%`; params.push(like, like, like); });
  }
  const rows = db
    .prepare(`SELECT * FROM posts WHERE ${clauses.join(' AND ')} ORDER BY is_featured_strike DESC, boosted_at DESC LIMIT ?`)
    .all(...params, limit);
  return rows.map((p) => {
    let fields = {};
    try { fields = JSON.parse(p.fields || '{}'); } catch (e) { /* ignore */ }
    // An item's own asking price is whatever currency the poster chose for
    // it (fields.currency), not necessarily this visitor's own - a listed
    // price is a fact about the post, never converted.
    const symbol = CURRENCY_SYMBOLS[fields.currency] || '$';
    const price = fields.price !== undefined && fields.price !== null ? `${symbol}${fields.price}` : fields.priceText || null;
    const loc = [p.location_city, p.location_state].filter(Boolean).join(', ');
    return { id: p.public_id, title: p.title, type: p.type, category: p.category, location: loc, price, url: postPublicPath(p) };
  });
}

// A Google Maps deep link for a listing's real address - mirrors public/js/
// pages/detail.js's mapsLinksForLocation, server-side. Only listings (real
// places - stores, offices, venues) get one, same as the detail page:
// classifieds/simchas only ever have a general area, not an exact address.
function directionsFor(p) {
  if (p.type !== 'listing') return null;
  const hasCoords = typeof p.location_lat === 'number' && typeof p.location_lng === 'number';
  if (!hasCoords && !p.location_text) return null;
  const google = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${p.location_lat},${p.location_lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.location_text)}`;
  return { google };
}

// Resolves the postIds Chesky named in its respond call into full
// button-ready data - deliberately only for the handful of posts it's
// actually pointing the visitor to, never a whole search result page, so
// contact info never goes further than what's actually being shown.
function resolvePostRefs(postIds) {
  if (!postIds?.length) return [];
  const rows = db
    .prepare(`SELECT * FROM posts WHERE status = 'live' AND public_id IN (${postIds.map(() => '?').join(',')})`)
    .all(...postIds);
  return rows.map((p) => ({
    id: p.public_id,
    title: p.title,
    url: postPublicPath(p),
    contact: p.type === 'simcha' ? {} : buildContactLinks(p),
    directions: directionsFor(p),
  }));
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
  // Split by when each add-on actually applies - strike/oversized are
  // chosen WHILE creating a post (wantsStrike/wantsOversized on
  // create_post), boost is a separate purchase on a post that already
  // exists. Conflating these (as this used to) told Chesky every add-on
  // only exists after posting, which is wrong for two of the three.
  const addons = db.prepare('SELECT key, price_cents, price_cents_gbp, config FROM addon_pricing').all();
  const addonLabel = (a) => (a.config ? JSON.parse(a.config) : {}).label || a.key;
  const addonSection = (a) => (a.key.startsWith('listing_') ? 'listing' : 'classified');
  const atPostingLines = addons
    .filter((a) => a.key.endsWith('_strike') || a.key.endsWith('_oversized'))
    .map((a) => `- ${addonLabel(a)} (${addonSection(a)}s): ${price(a.price_cents, a.price_cents_gbp)}`);
  const boostLines = addons
    .filter((a) => a.key.endsWith('_boost'))
    .map((a) => `- ${addonLabel(a)} (${addonSection(a)}s): ${price(a.price_cents, a.price_cents_gbp)}`);

  const tiers = db.prepare("SELECT category, post_type, name, duration_days, price_cents, price_cents_gbp FROM pricing_tiers WHERE active = 1 ORDER BY post_type, sort_order").all();
  const tierLines = tiers.map((t) => `- ${t.post_type === 'listing' ? 'Listing' : t.post_type === 'simcha' ? 'Simcha' : 'Classified'}${t.category ? ` (${t.category})` : ''}: ${t.name}, ${t.duration_days} days, ${t.price_cents ? price(t.price_cents, t.price_cents_gbp) : 'free'}`);

  const classifiedKeys = getAllClassifiedCategories().map((c) => `${c.key} (${c.label})`);
  const listingKeys = getAllListingCategories().map((c) => `${c.key} (${c.label})`);
  const simchaTax = db.prepare("SELECT name FROM taxonomies WHERE grp = 'simcha' AND active = 1 ORDER BY sort_order").all().map((t) => t.name);

  const classifiedLimits = getClassifiedCharLimits();
  const listingLimits = getListingCharLimits();
  const oversizedLimits = getOversizedCharLimits();

  const text = `
Site name: ${name}
Currency for this visitor: ${isGbp ? 'GBP (£) - they are on the .co.uk site' : 'USD ($)'}

Classifieds categories: ${classifiedCats.join(', ') || 'none configured'}
Classifieds category keys (use these exact keys, not the labels, when calling create_post): ${classifiedKeys.join(', ') || 'none'}
Listings categories: ${listingCats.join(', ') || 'none configured'}
Listings category keys (use these exact keys, not the labels, when calling create_post): ${listingKeys.join(', ') || 'none'}
Simcha categories (use the exact name, not a key, as simchaCategory when calling create_post): ${simchaTax.join(', ') || 'none configured'}

Posting durations & prices (exact tier names/prices/durations can change - these are what's configured right now, already converted to this visitor's own currency):
${tierLines.join('\n') || '(none configured)'}

Optional add-ons you can offer WHILE creating a post, via create_post's wantsStrike/wantsOversized - always mention these as options, don't wait to be asked:
${atPostingLines.join('\n') || '(none configured)'}
- Normal length limits: classifieds ${classifiedLimits.title} chars title / ${classifiedLimits.description} chars description, listings ${listingLimits.title} chars title / ${listingLimits.description} chars description. Oversized raises both to ${oversizedLimits.title} chars title / ${oversizedLimits.description} chars description - if what they've told you clearly won't fit the normal limit, proactively suggest Oversized rather than silently truncating it.

Boost (a separate purchase, only for a post that ALREADY EXISTS and is NOT something create_post can do - the poster goes to that post's own page and uses "Boost or Feature this listing" with the email they posted under):
${boostLines.join('\n') || '(none configured)'}

Policies to know:
- Lost & Found and any category marked "free" don't cost anything to post. A post's total price is its duration tier plus any add-ons chosen - always add them up and state the real total, in this visitor's own currency, before they confirm.
- Every photo is reviewed by a human before it appears - this is mainly to keep photos of people off the site, a hard rule here.
- Posts expire after their duration and stay on the site with an "Expired" stamp and no contact info shown, rather than disappearing - visitors can still see what was posted, just can't reach the poster anymore. The original poster can ask us to renew/repost.
- Simchas (celebrations like a birth, bar/bat mitzvah, wedding) are a separate free-text section from Classifieds/Listings, and are always free (no tier/add-on choices apply to them).
- Banner ad placements on the site are sold separately, outside any self-serve flow - if someone asks about advertising/banners (not boosting their own post), offer to pass their request to the team (forwardToTeam), don't quote a price for it.
`.trim();
  contextCache.set(currency, { text, at: Date.now() });
  return text;
}

const RESPOND_TOOL = {
  name: 'respond',
  description: 'End your turn by giving your reply to the visitor. Call this exactly once, last, after you have the real result of any other tool call you made this turn - never before.',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'What to say to the visitor. Short (1-2 sentences, rarely 3), conversational, plain text.' },
      offTopic: { type: 'boolean', description: "true when the question is outside what you can help with here, or you genuinely don't know the answer." },
      forwardToTeam: { type: 'boolean', description: 'true only when the visitor explicitly asked you to pass something along/forward a message/report something to the team.' },
      postIds: { type: 'array', items: { type: 'string' }, description: "The id of each post (from search_posts results) that you're specifically pointing the visitor to in this reply. The chat shows a button under your message for each one - to view it, and if it has contact info or a real address, to contact the poster or get directions - so only include a post here when you're actually naming/recommending it, not every result you saw." },
    },
    required: ['reply', 'offTopic', 'forwardToTeam'],
  },
};

const SEARCH_POSTS_TOOL = {
  name: 'search_posts',
  description: "Search everything actually live on the site right now - classifieds, listings, or simchas - so you can point to real inventory instead of speaking in generalities, or confirm something truly isn't posted before saying so. Call this whenever a visitor asks what's available, wants to browse a category, or you need to check if something exists - never guess or rely only on memory of earlier results. You can call it again with different terms or filters if the first search misses.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords to search titles/descriptions for. Omit to just browse a type/category.' },
      type: { type: 'string', enum: ['classified', 'listing', 'simcha'], description: 'Restrict to one section. Omit to search classifieds and listings both.' },
      category: { type: 'string', description: 'Exact category KEY (not the label) from the site facts, to restrict to one category.' },
    },
    required: [],
  },
};

const CREATE_POST_TOOL = {
  name: 'create_post',
  description: "Create and publish a real post on the visitor's behalf, once you actually have everything needed from the conversation. Never invent or guess a field - every value must come from what the visitor told you. For a paid category this returns a secure payment form that renders right in the chat; it never charges anything itself and never asks you for card details (you can't collect those - Stripe's own form does). Call this only once you have poster email and contact info and they've confirmed they want to post.",
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['classified', 'listing', 'simcha'], description: 'Which section this post belongs in.' },
      category: { type: 'string', description: 'The category KEY (not the label) from the site facts - required for classified/listing, not used for simcha.' },
      simchaCategory: { type: 'string', description: 'Simcha only: the exact simcha category name from the site facts (e.g. "Engagement").' },
      title: { type: 'string', description: 'Not used for simcha (its title is always the category name).' },
      description: { type: 'string' },
      locationText: { type: 'string', description: 'City/area - not used for simcha.' },
      price: { type: 'string', description: 'Optional - only for a category that takes a price. A plain number, or text like "Call for price".' },
      tierName: { type: 'string', description: 'Optional - the posting plan/duration name the visitor asked for, exactly as listed in the site facts. Defaults to the standard plan for the category if omitted.' },
      wantsStrike: { type: 'boolean', description: 'Optional add-on to feature/highlight the post (price in site facts). Proactively offer this while gathering details, in this visitor\'s own currency - don\'t wait to be asked.' },
      wantsOversized: { type: 'boolean', description: 'Optional add-on that raises the title/description length limits (price in site facts). Proactively offer it if what they described clearly won\'t fit the normal limit, rather than silently truncating it.' },
      attachPhoto: { type: 'boolean', description: 'Whether to attach the photo the visitor most recently sent in this conversation to the post. Defaults to true whenever a photo was sent and hasn\'t already been used for a different post - set it to false if the photo clearly isn\'t for this post.' },
      posterFirstName: { type: 'string' },
      posterLastName: { type: 'string' },
      posterEmail: { type: 'string', description: 'Required - where their invoice/confirmation goes.' },
      posterPhone: { type: 'string' },
      contactEmail: { type: 'string', description: 'Shown publicly on the post as a way to reach them - fine to reuse posterEmail if they want that.' },
      contactPhone: { type: 'string' },
      contactUrl: { type: 'string' },
    },
    required: ['type', 'description', 'posterEmail'],
  },
};

const SUBSCRIBE_TOOL = {
  name: 'subscribe_to_updates',
  description: "Sign the visitor up for the site's daily email digest. Only call this once they've actually agreed to sign up and given an email - never on your own initiative, and never just because they asked a question about the digest.",
  input_schema: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      topics: { type: 'array', items: { type: 'string' }, description: 'Topic values like "classified:items-for-sale", "simcha", "editorial" - from the categories in the site facts, prefixed "classified:". Omit to subscribe to everything.' },
    },
    required: ['email'],
  },
};

const TOOLS = [CREATE_POST_TOOL, SUBSCRIBE_TOOL, SEARCH_POSTS_TOOL, RESPOND_TOOL];

function resolveTierId(tiers, categoryDef, tierName) {
  if (categoryDef.free) return null;
  if (!tiers.length) return undefined;
  if (tierName) {
    const match = tiers.find((t) => t.name.toLowerCase() === String(tierName).toLowerCase());
    if (match) return match.id;
  }
  return tiers[0].id;
}

// Runs the actual, same-as-the-public-wizard post creation (services/
// postSubmit.js) - never anything bespoke to Chesky, so a post it creates
// is validated, charged, and (if free) published exactly the way a post
// from the regular "+ Post" page is. `image` (buffer+mime, or null) is the
// photo the visitor most recently sent in this conversation, if any - goes
// through the exact same processAndSaveImage/moderation-queue pipeline a
// wizard-uploaded photo does, never anything bespoke to chat.
async function execCreatePost(input, image) {
  try {
    const type = ['classified', 'listing', 'simcha'].includes(input.type) ? input.type : 'classified';
    const body = {
      title: input.title,
      description: input.description,
      locationText: input.locationText,
      posterFirstName: input.posterFirstName,
      posterLastName: input.posterLastName,
      posterEmail: input.posterEmail,
      posterPhone: input.posterPhone,
      contactEmail: input.contactEmail || input.posterEmail,
      contactPhone: input.contactPhone,
      contactUrl: input.contactUrl,
      wantsStrike: !!input.wantsStrike,
      wantsOversized: !!input.wantsOversized,
      fields: {},
    };

    let catDef = null;
    if (type === 'simcha') {
      const taxonomy = db.prepare("SELECT id FROM taxonomies WHERE grp = 'simcha' AND active = 1 AND name = ?").get(String(input.simchaCategory || '').trim());
      if (!taxonomy) return { status: 'error', errors: [`"${input.simchaCategory}" is not a valid simcha category - check the exact name in the site facts and ask them to confirm which one they mean.`] };
      body.taxonomyId = taxonomy.id;
    } else {
      body.category = input.category;
      catDef = type === 'listing' ? findListingCategory(input.category) : findCategory(input.category);
      if (!catDef) return { status: 'error', errors: [`"${input.category}" is not a valid category key - double check the exact key in the site facts.`] };
      if (catDef.hasPrice && input.price !== undefined && input.price !== '') body.fields.price = input.price;
      const tiers = type === 'listing' ? getListingTiersForCategory(input.category) : getTiersForCategory(input.category);
      const tierId = resolveTierId(tiers, catDef, input.tierName);
      if (tierId === undefined) return { status: 'error', errors: ['No pricing plan is set up for this category yet - forward this to the team instead of posting it.'] };
      if (tierId) body.pricingTierId = tierId;
    }

    // Simchas never show images (site-wide, not a Chesky-specific rule) -
    // skip a photo entirely there rather than letting submitPost reject the
    // whole post over an attachment it can't use.
    const categorySupportsPhotos = type === 'simcha' ? false : !!catDef?.hasImages;
    const wantsPhoto = !!(image && input.attachPhoto !== false && categorySupportsPhotos);
    const files = wantsPhoto ? [{ buffer: image.buffer, originalname: `chesky-photo.${image.mime === 'image/png' ? 'png' : image.mime === 'image/webp' ? 'webp' : 'jpg'}` }] : [];
    const photoSkipped = !!(image && input.attachPhoto !== false && !categorySupportsPhotos);

    const result = await submitPost({ type, body, files, hostname: currentHostname() });
    if (result.status !== 200) return { status: 'error', errors: [result.body?.error || 'Could not create that post.'] };
    if (result.body.requiresPayment) {
      return { status: 'checkout_required', clientSecret: result.body.clientSecret, photoAttached: files.length > 0, photoSkipped };
    }
    const post = result.body.post;
    return {
      status: post.status === 'pending_approval' ? 'pending_approval' : 'live',
      postUrl: postPublicPath({ type: post.type, public_id: post.id }),
      title: post.title,
      photoAttached: files.length > 0,
      photoSkipped,
    };
  } catch (e) {
    if (e instanceof ValidationError) return { status: 'error', errors: e.errors };
    if (e.status) return { status: 'error', errors: [e.message] };
    console.error('[chesky] create_post tool failed:', e.message);
    return { status: 'error', errors: ['Something went wrong creating that post - apologize and offer to forward it to the team instead.'] };
  }
}

// Same create-or-update-by-email logic as the plain subscribe form
// (routes/public/subscriptions.js) - still goes through the same
// double opt-in confirmation email, never silently subscribes anyone.
async function execSubscribe(input) {
  try {
    const email = String(input.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return { status: 'error', errors: ['That email address looks invalid - ask for a correct one.'] };
    const valid = validTopicValues();
    let categories = Array.isArray(input.topics) ? [...new Set(input.topics.filter((t) => valid.has(t)))] : [];
    if (!categories.length) categories = [...valid];

    const now = Date.now();
    const existing = db.prepare('SELECT * FROM email_subscriptions WHERE email = ?').get(email);
    if (existing && existing.status === 'confirmed') {
      db.prepare('UPDATE email_subscriptions SET categories = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(categories), now, existing.id);
      return { status: 'updated' };
    }
    let sub;
    if (existing) {
      db.prepare("UPDATE email_subscriptions SET categories = ?, status = 'pending', updated_at = ? WHERE id = ?").run(JSON.stringify(categories), now, existing.id);
      sub = db.prepare('SELECT * FROM email_subscriptions WHERE id = ?').get(existing.id);
    } else {
      const info = db.prepare("INSERT INTO email_subscriptions (public_id, email, categories, send_hour, status, created_at, updated_at) VALUES (?, ?, ?, 8, 'pending', ?, ?)")
        .run(newPublicId(24), email, JSON.stringify(categories), now, now);
      sub = db.prepare('SELECT * FROM email_subscriptions WHERE id = ?').get(info.lastInsertRowid);
    }
    await sendConfirmationEmail(sub);
    return { status: 'pending_confirmation' };
  } catch (e) {
    console.error('[chesky] subscribe_to_updates tool failed:', e.message);
    return { status: 'error', errors: ['Could not sign them up right now - apologize and suggest they use the Email Updates page instead.'] };
  }
}

function execSearchPosts(input) {
  try {
    return { status: 'ok', posts: queryPosts(input || {}) };
  } catch (e) {
    console.error('[chesky] search_posts tool failed:', e.message);
    return { status: 'error', errors: ['Could not search posts right now.'] };
  }
}

async function executeTool(name, input, image) {
  if (name === 'create_post') return execCreatePost(input || {}, image);
  if (name === 'subscribe_to_updates') return execSubscribe(input || {});
  if (name === 'search_posts') return execSearchPosts(input || {});
  return { status: 'error', errors: ['Unknown tool'] };
}

function buildSystemPrompt(hasImage, hasVoice) {
  const name = siteName();

  return `You are Chesky, the warm and genuinely helpful assistant for ${name}, a Jewish community classifieds, listings, and simchas (celebrations) website.

PERSONALITY - this matters a lot: talk like a kind, down-to-earth staff member texting a customer, not like a corporate bot. Use contractions (I'm, you'll, that's), vary your sentence openers, and let a little warmth and personality show. Never sound stiff, robotic, or like you're reading from a script. If someone seems confused, frustrated, or new to the site, be extra patient and reassuring - never curt, never cold. Treat every visitor like a valued member of the community, not a support ticket. You genuinely want to see people post - when it's natural (someone describes something they're selling, renting out, giving away, hiring for, or celebrating, or asks "can I post X"), warmly encourage them to post it. Make it easy: offer to just take a photo and/or a voice note describing it right here in chat and you'll take care of the rest (write it up, pick the category, handle payment if needed) - that's often the fastest way for them, especially for an item for sale/rent, a job offer, or a real estate listing. Don't be pushy about it - read the room, and never repeat the nudge if they've already said no or changed the subject.

CLASSIFIEDS VS LISTINGS: this site is primarily a classifieds community - individual people posting what they're selling, renting out, giving away, hiring for, or looking for. Listings (the business directory) is a smaller, secondary feature. When you're the one bringing up posting, or the situation is ambiguous, default to talking about posting a classified (or a simcha, if that fits) - that's the far more natural thing for most visitors. Only steer toward Listings when someone is clearly describing an actual business, store, or company they run, not an individual item, job, or service.

SCOPE: you only help with ${name} itself - how to post something, pricing, boosting/featuring a post, categories, editing or renewing a post, expired posts, contact/privacy on posts, advertising (see below), email updates (see below), general site navigation, and (via search_posts, see below) what's currently posted on the site. If someone asks about something unrelated to ${name} - general knowledge, other websites/companies, personal advice - don't answer it; warmly say that's outside what you can help with here, and set offTopic to true.

POSTING FOR SOMEONE, RIGHT HERE IN CHAT: you can actually create a post for a visitor using the create_post tool, including handling payment for a paid category - but you can NEVER ask for or accept card/payment details yourself (you have no way to charge anyone). Here's the flow: gather everything you need through normal conversation (what they're posting, which category it fits - match it to an exact category key from the site facts, a short description, their location if relevant, and an email to send their invoice/confirmation to). While you're gathering that, also mention the optional add-ons from the site facts (Featured/Striking via wantsStrike, Oversized via wantsOversized) with their real price - don't wait for them to ask, and proactively suggest Oversized if what they've described clearly won't fit the normal length limit. Confirm with them what you're about to post - including the real total price (tier plus any add-ons, in their own currency) - then call create_post. If it comes back needing payment, tell them warmly that a secure payment form just opened right here in the chat (Stripe's own form - you never see or touch their card details) and that their post goes live the moment they complete it. If it's free, tell them it's live now and share the link. If it comes back with an error, explain what's missing or wrong in plain language and ask for a fix - never retry blindly with guessed values.

PHOTOS & VOICE NOTES: a visitor can attach a photo and/or record a voice note right in this chat (camera and mic buttons next to the message box), together or separately, with or without typing anything. When a photo comes in, you actually see the image. When a voice note comes in, it's already been transcribed into the text you're reading - treat it exactly like something they typed (you can acknowledge it came in as a voice note, naturally, without making a big deal of it). Use whatever they send to help write a good title/description, and when you call create_post for that item, any photo from this message is attached to it automatically (the tool result tells you whether it actually got attached - mention it only if something unexpected happened, like the category not supporting photos). Every photo still goes through the normal human moderation queue before it's publicly visible, same as any other post's photo - mention that if it's relevant, but don't over-explain it. Only one photo per post through chat; if they want more, point them to the invoice/management link after their post is live, or the regular "+ Post" page.${hasImage ? '\n\nThe visitor just sent a photo with this message - look at it.' : ''}${hasVoice ? '\n\nSome or all of this message came in as a voice note, already transcribed below.' : ''}

ADVERTISING: Boost (bumping an existing, already-live post back to the top) is different from Featured/Oversized - Boost only applies to a post that already exists and is self-serve from that post's own page, using the email it was posted under; it's not something create_post can do. Featured and Oversized, by contrast, are chosen WHILE creating a post via create_post (see POSTING above) - don't tell someone they have to wait until after posting for those two. Mention the right price for whichever one actually applies, from the site facts. Banner ad placements on the site itself are a separate, bigger arrangement handled by the team, not something you can set up or price here - if someone asks about that, offer warmly to pass their interest along to the team (set forwardToTeam to true) rather than guessing at pricing or availability.

EMAIL UPDATES: the site has a daily email digest of new posts in whatever topics someone picks. When it's natural - someone's browsing, asks about staying in the loop, or you just helped them find something - mention it and offer to sign them up right here if they give you an email, using the subscribe_to_updates tool. Don't be pushy about it or bring it up more than once in a conversation.

FINDING WHAT'S ACTUALLY POSTED: you have full access to every live post via the search_posts tool - use it whenever a visitor asks what's available, wants to browse, or you need to confirm something exists, rather than guessing or speaking only in generalities. It's not exhaustive on a single call (try different keywords or a category if your first search misses), but never tell someone "there's nothing" or "none available" without actually having searched - say you're not sure / didn't find a match instead, and point them to browsing or searching the site themselves. When your reply names or recommends a specific post, include its id in respond's postIds so the chat can show a button for it - but only posts you're actually pointing to, not every result you saw. Don't mention that you searched - just answer naturally.

Ground every factual claim (prices, categories, policies, what's posted) ONLY in the facts given below or what search_posts actually returns - never invent a price, category, policy, or listing. If a question is about ${name} but you genuinely don't know the answer from what's given, say so honestly and warmly, offer to connect them with a person on the team, and set offTopic to true.

FORWARDING: if a visitor explicitly asks you to pass something along, forward a message, let the team/company know something, or send a complaint/request/report to the people who run the site - set forwardToTeam to true, and reply confirming warmly that you've passed it along (e.g. "Done - I let our team know!"). Only do this when they're clearly asking you to relay something, not for an ordinary question you can just answer yourself. Note in your reply that since they haven't given an email, the team can read it but can't write back unless they start a real conversation with "Talk to a real person."

You have four tools: create_post, subscribe_to_updates, search_posts, and respond. Use create_post/subscribe_to_updates only when you actually have what's needed and the visitor has agreed to the action; use search_posts freely, as often as you need. Then ALWAYS call respond next, after seeing any other tool's real result, to tell the visitor what happened. respond is the only way to actually say something to the visitor - call it exactly once, last, every single turn, even if you didn't need another tool. Keep replies short (1-2 sentences, rarely 3), conversational, and plain text - no markdown, no bullet lists, no tables. Never say you're Claude, an AI, a language model, or name any AI company - you're just Chesky.

Site facts:
${buildSiteContext()}`;
}

const MODEL_FALLBACK = 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 5;

function shapeFinal(input) {
  return {
    reply: typeof input?.reply === 'string' && input.reply ? input.reply : "Sorry, I didn't quite catch that - could you rephrase?",
    offTopic: !!input?.offTopic,
    forwardToTeam: !!input?.forwardToTeam,
    postIds: Array.isArray(input?.postIds) ? input.postIds.filter((x) => typeof x === 'string').slice(0, 5) : [],
  };
}

// transcript: [{role: 'user'|'assistant', text}], oldest first, excluding
// the new question. image (optional): {buffer, mime} - a photo the visitor
// just sent with this question, validated by routes/public/chat.js. Claude
// actually sees it (as an image content block) and, if create_post gets
// called this turn, it's attached to the post exactly like a wizard upload.
// hasVoice: true when some or all of `question` is a voice note transcript
// (routes/public/chat.js already merged it into the text) - just lets the
// system prompt tell Chesky that, so it can react naturally.
async function ask(question, transcript = [], image = null, hasVoice = false) {
  const c = getClient();
  if (!c) return { reply: "I'm not quite set up yet - please use the \"talk to our team\" option below.", offTopic: true, unavailable: true };

  const model = runtimeConfig.get('chesky_model') || MODEL_FALLBACK;
  const system = buildSystemPrompt(!!image, !!hasVoice);
  const questionContent = image
    ? [
        { type: 'text', text: String(question).slice(0, 1500) },
        { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.buffer.toString('base64') } },
      ]
    : String(question).slice(0, 1500);
  const messages = [
    ...transcript.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text || '').slice(0, 1500) })),
    { role: 'user', content: questionContent },
  ];

  let final = null;
  let postCreated = null;
  let checkout = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await c.messages.create({ model, max_tokens: 1024, system, tools: TOOLS, messages });
      const blocks = response.content || [];
      const toolUses = blocks.filter((b) => b.type === 'tool_use');

      if (!toolUses.length) {
        const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (text) final = { reply: text, offTopic: false, forwardToTeam: false };
        break;
      }

      messages.push({ role: 'assistant', content: blocks });

      const respondUse = toolUses.find((u) => u.name === 'respond');
      const actionUses = toolUses.filter((u) => u.name !== 'respond');

      // The model answered with no other action this round - that's the
      // normal, common case (it already has any earlier tool results it
      // needed from a previous round).
      if (respondUse && !actionUses.length) {
        final = shapeFinal(respondUse.input);
        break;
      }

      const toolResults = [];
      for (const use of actionUses) {
        const outcome = await executeTool(use.name, use.input, image);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(outcome) });
        if (use.name === 'create_post') {
          if (outcome.status === 'checkout_required') checkout = outcome;
          else if (outcome.status === 'live' || outcome.status === 'pending_approval') postCreated = outcome;
        }
      }
      // A respond call in the SAME batch as an action was written before the
      // model could see that action's real result - never trust it. Make it
      // call respond again, now that the actual outcome is in front of it.
      if (respondUse) {
        toolResults.push({ type: 'tool_result', tool_use_id: respondUse.id, content: 'Check the result(s) above first, then call respond again with what actually happened.' });
      }
      messages.push({ role: 'user', content: toolResults });
    }
  } catch (e) {
    console.error('[chesky] ask failed:', e.message);
    return { reply: "Something went wrong on my end - please try again, or talk to our team below.", offTopic: true, unavailable: true };
  }

  if (!final) {
    // Ran out of rounds without a clean respond - fall back to something
    // honest rather than silence, favoring whatever actually happened.
    if (postCreated) final = { reply: `Done - "${postCreated.title}" is live! You can view it here: ${postCreated.postUrl}`, offTopic: false, forwardToTeam: false };
    else if (checkout) final = { reply: "Almost there - just complete the payment form that opened here in the chat and your post will go live.", offTopic: false, forwardToTeam: false };
    else final = { reply: "Sorry, I didn't quite catch that - could you rephrase?", offTopic: true, forwardToTeam: false };
  }
  return { reply: final.reply, offTopic: final.offTopic, forwardToTeam: final.forwardToTeam, postCreated, checkout, posts: resolvePostRefs(final.postIds) };
}

module.exports = { ask, findLearnedMatch, normQ, buildSiteContext, buildSystemPrompt };
