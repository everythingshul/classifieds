const express = require('express');
const db = require('../../db');
const { upload, processAndSaveImage } = require('../../middleware/upload');
const { validateClassifiedPayload, validateSimchaPayload, ValidationError } = require('../../services/postValidation');
const { buildClassifiedCharges, buildSimchaCharges, getCharLimits, getAddon } = require('../../services/pricing');
const { DEFAULT_CHAR_LIMITS, OVERSIZED_CHAR_LIMITS } = require('../../utils/constants');
const { findCategory } = require('../../services/categories');
const { getActivePromo, applyDiscount, recordUse } = require('../../services/promoCodes');
const { insertPost, attachImages, recordPayment, attachSimchaSurprises, finalizePostLive } = require('../../services/postLifecycle');
const { formatPostPublic } = require('../../services/postFormat');
const { createCheckoutSession } = require('../../services/checkout');
const { notifyAdmin } = require('../../utils/mailer');
const { isValidEmail } = require('../../utils/validate');

const router = express.Router();

const runtimeConfig = require('../../services/runtimeConfig');
function appUrl() {
  return runtimeConfig.get('app_url', 'APP_URL') || '';
}

// Mutates `charges` in place: collapses its line items into a single
// discounted "listing" line so Stripe (and the invoice) show one clean total
// rather than a per-line discount, and records the promo's use.
function applyPromoToCharges(charges, code) {
  if (!code) return null;
  const promo = getActivePromo(code);
  if (!promo) throw Object.assign(new Error('That promo code is invalid or expired'), { status: 400 });
  const discounted = applyDiscount(charges.totalCents, promo);
  charges.lineItems = [{ kind: 'listing', label: `Listing (promo ${promo.code} applied)`, amount_cents: discounted }];
  charges.totalCents = discounted;
  charges.promo = promo;
  return promo;
}

async function processUploadedImages(files) {
  if (!files || !files.length) return [];
  const out = [];
  for (const file of files) {
    const filename = await processAndSaveImage(file.buffer);
    out.push({ filename, originalName: file.originalname });
  }
  return out;
}

router.post('/', upload.array('images', 6), async (req, res, next) => {
  try {
    const type = req.body.type === 'simcha' ? 'simcha' : 'classified';
    let parsedFields = {};
    try {
      parsedFields = req.body.fields ? JSON.parse(req.body.fields) : {};
    } catch (e) {
      return res.status(400).json({ error: 'fields must be valid JSON' });
    }
    let surpriseEmails = [];
    if (req.body.surpriseEmails) {
      try {
        surpriseEmails = JSON.parse(req.body.surpriseEmails);
      } catch (e) {
        return res.status(400).json({ error: 'surpriseEmails must be valid JSON' });
      }
    }

    const wantsOversized = !!req.body.wantsOversized && req.body.wantsOversized !== 'false';
    const configuredLimits = getCharLimits();
    const charLimits = wantsOversized
      ? { title: OVERSIZED_CHAR_LIMITS.title, description: OVERSIZED_CHAR_LIMITS.description }
      : configuredLimits;

    if (type === 'classified') {
      const payload = validateClassifiedPayload({ ...req.body, fields: parsedFields, wantsOversized }, charLimits);
      const catDef = findCategory(payload.category);
      const uploaded = await processUploadedImages(req.files);
      if (uploaded.length && !catDef.hasImages) {
        return res.status(400).json({ error: `${catDef.label} does not support image uploads` });
      }

      const charges = buildClassifiedCharges({
        category: payload.category,
        categoryDef: catDef,
        pricingTierId: payload.pricingTierId,
        wantsStrike: payload.wantsStrike,
        wantsOversized: payload.wantsOversized,
      });
      applyPromoToCharges(charges, req.body.promoCode);

      const post = insertPost({ type: 'classified', category: payload.category, payload, hasImages: uploaded.length > 0 });
      attachImages(post.id, uploaded);
      const payment = recordPayment({
        postId: post.id,
        kind: 'listing',
        amountCents: charges.totalCents,
        payerEmail: payload.posterEmail,
        status: charges.totalCents === 0 ? 'paid' : 'pending',
      });

      return await finalizeOrCheckout({ res, post, payment, charges, posterEmail: payload.posterEmail, type: 'classified' });
    }

    // simcha - no title/date/location are collected; the title is the
    // chosen category name (e.g. "Engagement", "New Home").
    const payload = validateSimchaPayload({ ...req.body, fields: parsedFields, surpriseEmails }, charLimits);
    const taxonomy = db.prepare('SELECT name FROM taxonomies WHERE id = ? AND grp = ?').get(payload.taxonomyId, 'simcha');
    if (!taxonomy) return res.status(400).json({ error: 'Validation failed', details: ['a valid simcha category is required'] });
    payload.title = taxonomy.name;
    const charges = buildSimchaCharges();
    const post = insertPost({ type: 'simcha', category: 'simcha', payload, hasImages: false });
    attachSimchaSurprises(post.id, payload.surpriseEmails, `${payload.posterFirstName || ''} ${payload.posterLastName || ''}`.trim());
    const payment = recordPayment({
      postId: post.id,
      kind: 'listing',
      amountCents: charges.totalCents,
      payerEmail: payload.posterEmail,
      status: charges.totalCents === 0 ? 'paid' : 'pending',
    });

    return await finalizeOrCheckout({ res, post, payment, charges, posterEmail: payload.posterEmail, type: 'simcha' });
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: 'Validation failed', details: e.errors });
    next(e);
  }
});

async function finalizeOrCheckout({ res, post, payment, charges, posterEmail, type }) {
  if (charges.totalCents === 0) {
    if (charges.promo) recordUse(charges.promo);
    const finalPost = await finalizePostLive(post.id);
    return res.json({ requiresPayment: false, post: formatPostPublic(finalPost) });
  }

  const session = await createCheckoutSession({
    lineItems: charges.lineItems,
    successUrl: `${appUrl()}/post-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}/post.html?canceled=1`,
    customerEmail: posterEmail,
    metadata: { kind: 'listing', postId: String(post.id), paymentId: String(payment.id), type, promoCode: charges.promo?.code || '' },
  });
  db.prepare('UPDATE post_payments SET stripe_session_id = ? WHERE id = ?').run(session.id, payment.id);
  return res.json({ requiresPayment: true, checkoutUrl: session.url });
}

// Boost: enter the email used to post + pay to move the listing back to the top.
router.post('/:publicId/boost', async (req, res, next) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE public_id = ?').get(req.params.publicId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const email = String(req.body.email || '').toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (email !== post.poster_email) return res.status(403).json({ error: 'Email does not match the email used to post this listing' });

    const addon = getAddon('boost');
    const amount = addon ? addon.price_cents : 0;

    if (amount === 0) {
      db.prepare('UPDATE posts SET boosted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), post.id);
      recordPayment({ postId: post.id, kind: 'boost', amountCents: 0, payerEmail: email, status: 'paid' });
      return res.json({ requiresPayment: false, boosted: true });
    }

    const payment = recordPayment({ postId: post.id, kind: 'boost', amountCents: amount, payerEmail: email, status: 'pending' });
    const session = await createCheckoutSession({
      lineItems: [{ label: `Boost listing: ${post.title}`, amount_cents: amount }],
      successUrl: `${appUrl()}/post-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl()}/classifieds/${post.public_id}?canceled=1`,
      customerEmail: email,
      metadata: { kind: 'boost', postId: String(post.id), paymentId: String(payment.id) },
    });
    db.prepare('UPDATE post_payments SET stripe_session_id = ? WHERE id = ?').run(session.id, payment.id);
    res.json({ requiresPayment: true, checkoutUrl: session.url });
  } catch (e) {
    next(e);
  }
});

// Strike: pay an additional fee to feature/highlight a listing.
router.post('/:publicId/strike', async (req, res, next) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE public_id = ?').get(req.params.publicId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const email = String(req.body.email || '').toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (email !== post.poster_email) return res.status(403).json({ error: 'Email does not match the email used to post this listing' });

    const addon = getAddon('strike');
    const amount = addon ? addon.price_cents : 0;

    if (amount === 0) {
      db.prepare('UPDATE posts SET is_featured_strike = 1, updated_at = ? WHERE id = ?').run(Date.now(), post.id);
      recordPayment({ postId: post.id, kind: 'strike', amountCents: 0, payerEmail: email, status: 'paid' });
      return res.json({ requiresPayment: false, featured: true });
    }

    const payment = recordPayment({ postId: post.id, kind: 'strike', amountCents: amount, payerEmail: email, status: 'pending' });
    const session = await createCheckoutSession({
      lineItems: [{ label: `Feature listing: ${post.title}`, amount_cents: amount }],
      successUrl: `${appUrl()}/post-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl()}/classifieds/${post.public_id}?canceled=1`,
      customerEmail: email,
      metadata: { kind: 'strike', postId: String(post.id), paymentId: String(payment.id) },
    });
    db.prepare('UPDATE post_payments SET stripe_session_id = ? WHERE id = ?').run(session.id, payment.id);
    res.json({ requiresPayment: true, checkoutUrl: session.url });
  } catch (e) {
    next(e);
  }
});

router.post('/:publicId/report', async (req, res, next) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE public_id = ?').get(req.params.publicId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const reason = String(req.body.reason || '').slice(0, 1000);
    const reporterEmail = req.body.reporterEmail ? String(req.body.reporterEmail).slice(0, 200) : null;
    db.prepare('INSERT INTO reports (post_id, reason, reporter_email, created_at) VALUES (?, ?, ?, ?)').run(
      post.id, reason, reporterEmail, Date.now()
    );
    const url = `${appUrl()}/${post.type === 'simcha' ? 'simchas' : 'classifieds'}/${post.public_id}`;
    await notifyAdmin(
      `Post reported: ${post.title}`,
      `<p><b>Post:</b> ${post.title}</p><p><b>Reason:</b> ${reason || '(none given)'}</p><p><b>Reported by:</b> ${reporterEmail || 'anonymous'}</p><p><a href="${url}">View post</a></p>`
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/by-ids', (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
    if (!ids.length) return res.json({ posts: [] });
    const placeholders = ids.map(() => '?').join(',');
    const posts = db.prepare(`SELECT * FROM posts WHERE public_id IN (${placeholders}) AND status = 'live'`).all(...ids);
    const postIds = posts.map((p) => p.id);
    let imgMap = new Map();
    if (postIds.length) {
      const ph2 = postIds.map(() => '?').join(',');
      const imgs = db.prepare(`SELECT * FROM post_images WHERE post_id IN (${ph2}) ORDER BY sort_order`).all(...postIds);
      imgs.forEach((i) => {
        if (!imgMap.has(i.post_id)) imgMap.set(i.post_id, []);
        imgMap.get(i.post_id).push(i);
      });
    }
    res.json({ posts: posts.map((p) => formatPostPublic(p, imgMap.get(p.id) || [])) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
