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

// Strict allowlist sanitizer for an AI-generated icon - the result gets
// dropped straight into innerHTML (see public/js/pages/browseLists.js), so
// nothing outside a tiny set of shape tags/attributes survives. Anything
// that doesn't parse into at least one allowed shape is treated as
// untrustworthy and discarded; the caller then falls back to its own
// keyword-matched/generic icon instead of showing nothing.
const ICON_ALLOWED_TAGS = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'];
const ICON_ALLOWED_ATTRS = ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points'];
function sanitizeIconSvg(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const svgMatch = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  const inner = svgMatch ? svgMatch[1] : raw;
  if (inner.length > 4000) return null;

  const tagRe = /<\s*([a-zA-Z]+)((?:\s+[^<>]*?)?)\/?\s*>/g;
  let match;
  let out = '';
  while ((match = tagRe.exec(inner))) {
    const tag = match[1].toLowerCase();
    if (!ICON_ALLOWED_TAGS.includes(tag)) continue;
    const attrRe = /([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g;
    let attrMatch;
    let attrsOut = '';
    while ((attrMatch = attrRe.exec(match[2] || ''))) {
      const name = attrMatch[1].toLowerCase();
      const value = attrMatch[2];
      if (!ICON_ALLOWED_ATTRS.includes(name)) continue;
      if (/[<>&"']/.test(value)) continue;
      attrsOut += ` ${name}="${value}"`;
    }
    if (attrsOut) out += `<${tag}${attrsOut}/>`;
  }
  return out || null;
}

const IconSchema = z.object({ svg: z.string() });

// Runs once per listing category, right after an admin (or the hidden
// category-manage tool) creates one - see services/taxonomy.js's
// createListingCategory. Fire-and-forget like generateSearchKeywords:
// never throws, returns null on no API key, a failed call, or a response
// that doesn't sanitize into a usable icon. The chooser grid (browseLists.js)
// falls back to its own keyword-matched/generic icon either way, so a
// pre-existing category or a failed generation never shows nothing.
async function generateCategoryIcon({ label }) {
  const c = getClient();
  if (!c) return null;
  try {
    const system = `Design a single minimal line-art icon representing the business category "${label}", for a classifieds website's category picker grid.

Match this exact visual style: a 24x24 viewBox, fill="none", stroke="currentColor", stroke-width="2", stroke-linecap="round", stroke-linejoin="round" - the same look as Feather/outline-style icons. Use only <path>, <circle>, <rect>, <line>, <polyline>, <polygon>, or <ellipse> elements - no text, no images, no gradients, no filters, no groups, no nested <svg>.

Return ONLY the inner shape elements, not the outer <svg> tag and not fill/stroke/viewBox attributes - those are added by the page. For example: <path d="M3 9.5 12 3l9 6.5"/><path d="M5 9.5V20h14V9.5"/>

The icon should clearly and literally depict something associated with "${label}" (a wrench for plumbing, a tooth for a dentist, scissors for a barber) - never a generic or unrelated shape.`;
    const response = await c.messages.parse({
      model: model(),
      max_tokens: 600,
      system,
      output_config: { effort: 'low', format: zodOutputFormat(IconSchema) },
      messages: [{ role: 'user', content: `Category: ${label}` }],
    });
    return sanitizeIconSvg(response.parsed_output?.svg || '');
  } catch (e) {
    console.error('[aiAssist] category icon generation failed:', e.message);
    return null;
  }
}

const SubcategoriesSchema = z.object({ subcategories: z.array(z.string()).max(12) });

// Runs once per listing category, same fire-and-forget pattern as the icon
// above - gives a freshly created category (e.g. "Restaurants") a starter
// set of sub-categories (e.g. Pizza, Sushi, Chinese) an admin would
// otherwise have to type in one at a time via Admin -> Taxonomies. Returns
// [] (never throws) on no API key or any failure.
async function generateSubcategories({ label }) {
  const c = getClient();
  if (!c) return [];
  try {
    const system = `Give a short list of common, useful sub-categories for the business category "${label}" on a local classifieds website (e.g. for "Restaurants": Pizza, Sushi, Chinese, Kosher, Bakery). Pick ones a visitor would actually filter by. Short names (1-3 words), no numbering, no duplicates, no explanations. If "${label}" is too narrow to meaningfully split into sub-categories, return an empty list rather than forcing weak ones.`;
    const response = await c.messages.parse({
      model: model(),
      max_tokens: 300,
      system,
      output_config: { effort: 'low', format: zodOutputFormat(SubcategoriesSchema) },
      messages: [{ role: 'user', content: `Category: ${label}` }],
    });
    const names = response.parsed_output?.subcategories || [];
    const cleaned = [];
    const seen = new Set();
    names.forEach((n) => {
      const trimmed = stripDashes(String(n || '')).slice(0, 60);
      const key = trimmed.toLowerCase();
      if (trimmed && !seen.has(key)) { seen.add(key); cleaned.push(trimmed); }
    });
    return cleaned.slice(0, 12);
  } catch (e) {
    console.error('[aiAssist] subcategory generation failed:', e.message);
    return [];
  }
}

module.exports = { polishText, generateSearchKeywords, generateCategoryIcon, generateSubcategories, stripDashes };
