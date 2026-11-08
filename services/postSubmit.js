// The actual "create a post, charge for it or finalize it for free" logic,
// extracted out of routes/public/posts.js's POST / handler so it has
// exactly one implementation shared by two callers: the public post
// wizard (via that route, which now just shapes this into an HTTP
// response) and Chesky's create_post tool (services/chesky.js), which
// calls this directly, in-process, with no HTTP round trip and no files.
// Keeping this as a pure extraction (not a rewrite) matters here more than
// usual - this is the site's actual charge/checkout path.
const db = require('../db');
const { validateClassifiedPayload, validateSimchaPayload, validateListingPayload, ValidationError } = require('./postValidation');
const { buildClassifiedCharges, buildListingCharges, buildSimchaCharges, getClassifiedCharLimits, getSimchaCharLimits, getOversizedCharLimits, getListingCharLimits } = require('./pricing');
const { findCategory } = require('./taxonomy');
const { findListingCategory } = require('./listingCategories');
const { getActivePromo, applyDiscount, recordUse, promoAppliesTo, promoAppliesToFeature } = require('./promoCodes');
const { insertPost, attachImages, recordPayment, attachSimchaSurprises, finalizePostLive } = require('./postLifecycle');
const { formatPostPublic } = require('./postFormat');
const { createCheckoutSession } = require('./checkout');
const { currencyForHost } = require('./currency');
const { appUrl } = require('./appUrl');
const { geocodeLocation } = require('./geocode');

// A poster's lat/lng only ever get set client-side when they click a
// suggestion in the location autocomplete dropdown - typing and moving on
// (common) leaves them null, which silently shut that post out of every
// "find near me" search (services/geo.js can't compute a distance without
// both ends having coordinates). Best-effort fills them in here instead, so
// "near me" works regardless of whether the poster interacted with the
// dropdown. Never blocks or fails the submission - on no match, a timeout,
// or any error, the post is created exactly as it would have been before
// this existed (no coordinates, same as today for posts outside the US or
// wherever the free geocoder draws a blank).
async function fillMissingCoordinates(payload) {
  if (payload.locationLat != null && payload.locationLng != null) return;
  if (!payload.locationText) return;
  try {
    const hit = await geocodeLocation(payload.locationText);
    if (hit) {
      payload.locationLat = hit.lat;
      payload.locationLng = hit.lng;
    }
  } catch (e) {
    console.error('[postSubmit] geocode fallback failed:', e.message);
  }
}

const SECTION_LABELS = { classified: 'classifieds', listing: 'listings', simcha: 'simchas' };

// Mutates `charges` in place - unmodified copy of the original comment/logic
// from routes/public/posts.js: discounts only the line items the promo is
// scoped to (via included/excluded features - e.g. a promo can cover the
// base listing but exclude "oversized"), collapsing that eligible subset
// into one discounted line so Stripe (and the invoice) show a clean total,
// while any ineligible line items pass through at full price untouched.
function applyPromoToCharges(charges, code, postType) {
  if (!code) return null;
  const promo = getActivePromo(code);
  if (!promo) throw Object.assign(new Error('That promo code is invalid or expired'), { status: 400 });
  if (!promoAppliesTo(promo, postType)) {
    throw Object.assign(new Error(`That promo code isn't valid for ${SECTION_LABELS[postType] || postType}`), { status: 400 });
  }
  const eligible = charges.lineItems.filter((li) => promoAppliesToFeature(promo, li.kind));
  const ineligible = charges.lineItems.filter((li) => !promoAppliesToFeature(promo, li.kind));
  if (!eligible.length) {
    throw Object.assign(new Error(`That promo code doesn't apply to any of the selected options`), { status: 400 });
  }
  const eligibleSubtotal = eligible.reduce((s, li) => s + li.amount_cents, 0);
  const discountedEligible = applyDiscount(eligibleSubtotal, promo);
  const eligibleLabel = eligible.map((li) => li.label).join(' + ');

  charges.lineItems = [...ineligible, { kind: eligible[0].kind, label: `${eligibleLabel} (promo ${promo.code} applied)`, amount_cents: discountedEligible }];
  charges.totalCents = discountedEligible + ineligible.reduce((s, li) => s + li.amount_cents, 0);
  charges.promo = promo;
  return promo;
}

async function processUploadedImages(files) {
  if (!files || !files.length) return [];
  const { processAndSaveImage } = require('../middleware/upload');
  const out = [];
  for (const file of files) {
    const filename = await processAndSaveImage(file.buffer);
    out.push({ filename, originalName: file.originalname });
  }
  return out;
}

async function finalizeOrCheckout({ post, payment, charges, posterEmail, type }) {
  if (charges.totalCents === 0) {
    if (charges.promo) recordUse(charges.promo);
    const finalPost = await finalizePostLive(post.id);
    return { status: 200, body: { requiresPayment: false, post: formatPostPublic(finalPost) } };
  }

  const session = await createCheckoutSession({
    lineItems: charges.lineItems,
    currency: charges.currency,
    returnUrl: `${appUrl()}/post-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}/post`,
    customerEmail: posterEmail,
    metadata: { kind: 'listing', postId: String(post.id), paymentId: String(payment.id), type, promoCode: charges.promo?.code || '' },
  });
  db.prepare('UPDATE post_payments SET stripe_session_id = ? WHERE id = ?').run(session.id, payment.id);
  return { status: 200, body: { requiresPayment: true, clientSecret: session.client_secret || null, checkoutUrl: session.url || null } };
}

// body/files mirror what multer + express give a route handler (req.body,
// req.files) - files is optional (Chesky's tool never passes any).
// hostname decides which currency this submission charges in (see
// services/currency.js), same as the HTTP route uses req.hostname.
// Throws ValidationError (caller decides how to surface it) or returns
// { status, body } shaped exactly like the former inline res.json calls.
async function submitPost({ type: rawType, body, files, hostname }) {
  const type = rawType === 'simcha' ? 'simcha' : rawType === 'listing' ? 'listing' : 'classified';
  let parsedFields = {};
  try {
    parsedFields = body.fields ? (typeof body.fields === 'string' ? JSON.parse(body.fields) : body.fields) : {};
  } catch (e) {
    throw Object.assign(new Error('fields must be valid JSON'), { status: 400 });
  }
  let surpriseEmails = [];
  if (body.surpriseEmails) {
    try {
      surpriseEmails = typeof body.surpriseEmails === 'string' ? JSON.parse(body.surpriseEmails) : body.surpriseEmails;
    } catch (e) {
      throw Object.assign(new Error('surpriseEmails must be valid JSON'), { status: 400 });
    }
  }

  const wantsOversized = !!body.wantsOversized && body.wantsOversized !== 'false';

  if (type === 'classified') {
    const charLimits = wantsOversized ? getOversizedCharLimits() : getClassifiedCharLimits();
    const payload = validateClassifiedPayload({ ...body, fields: parsedFields, wantsOversized }, charLimits);
    await fillMissingCoordinates(payload);
    const catDef = findCategory(payload.category);
    const uploaded = await processUploadedImages(files);
    if (uploaded.length && !catDef.hasImages) {
      return { status: 400, body: { error: `${catDef.label} does not support image uploads` } };
    }

    const charges = buildClassifiedCharges({
      category: payload.category,
      categoryDef: catDef,
      pricingTierId: payload.pricingTierId,
      wantsStrike: payload.wantsStrike,
      wantsOversized: payload.wantsOversized,
      currency: currencyForHost(hostname),
    });
    applyPromoToCharges(charges, body.promoCode, 'classified');

    const post = insertPost({ type: 'classified', category: payload.category, payload, hasImages: uploaded.length > 0 });
    attachImages(post.id, uploaded);
    const payment = recordPayment({
      postId: post.id,
      kind: 'listing',
      amountCents: charges.totalCents,
      currency: charges.currency,
      payerEmail: payload.posterEmail,
      status: charges.totalCents === 0 ? 'paid' : 'pending',
    });

    return await finalizeOrCheckout({ post, payment, charges, posterEmail: payload.posterEmail, type: 'classified' });
  }

  if (type === 'listing') {
    const charLimits = wantsOversized ? getOversizedCharLimits() : getListingCharLimits();
    const payload = validateListingPayload({ ...body, fields: parsedFields, wantsOversized }, charLimits);
    await fillMissingCoordinates(payload);
    const catDef = findListingCategory(payload.category);
    const uploaded = await processUploadedImages(files);
    if (uploaded.length && !catDef.hasImages) {
      return { status: 400, body: { error: `${catDef.label} does not support image uploads` } };
    }

    const charges = buildListingCharges({
      category: payload.category,
      categoryDef: catDef,
      pricingTierId: payload.pricingTierId,
      wantsStrike: payload.wantsStrike,
      wantsOversized: payload.wantsOversized,
      currency: currencyForHost(hostname),
    });
    applyPromoToCharges(charges, body.promoCode, 'listing');

    const post = insertPost({ type: 'listing', category: payload.category, payload, hasImages: uploaded.length > 0 });
    attachImages(post.id, uploaded);
    const payment = recordPayment({
      postId: post.id,
      kind: 'listing',
      amountCents: charges.totalCents,
      currency: charges.currency,
      payerEmail: payload.posterEmail,
      status: charges.totalCents === 0 ? 'paid' : 'pending',
    });

    return await finalizeOrCheckout({ post, payment, charges, posterEmail: payload.posterEmail, type: 'listing' });
  }

  // simcha - no title/date/location are collected; the title is the
  // chosen category name (e.g. "Engagement", "New Home").
  const payload = validateSimchaPayload({ ...body, fields: parsedFields, surpriseEmails }, getSimchaCharLimits());
  const taxonomy = db.prepare('SELECT name FROM taxonomies WHERE id = ? AND grp = ?').get(payload.taxonomyId, 'simcha');
  if (!taxonomy) throw new ValidationError(['a valid simcha category is required']);
  payload.title = taxonomy.name;
  const charges = buildSimchaCharges({ currency: currencyForHost(hostname) });
  applyPromoToCharges(charges, body.promoCode, 'simcha');
  const post = insertPost({ type: 'simcha', category: 'simcha', payload, hasImages: false });
  attachSimchaSurprises(post.id, payload.surpriseEmails, `${payload.posterFirstName || ''} ${payload.posterLastName || ''}`.trim());
  const payment = recordPayment({
    postId: post.id,
    kind: 'listing',
    amountCents: charges.totalCents,
    currency: charges.currency,
    payerEmail: payload.posterEmail,
    status: charges.totalCents === 0 ? 'paid' : 'pending',
  });

  return await finalizeOrCheckout({ post, payment, charges, posterEmail: payload.posterEmail, type: 'simcha' });
}

module.exports = { submitPost, ValidationError, SECTION_LABELS };
