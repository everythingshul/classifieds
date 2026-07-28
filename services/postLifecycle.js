const db = require('../db');
const { newPublicId, newInvoiceNumber } = require('../utils/ids');
const { categoryLabel } = require('./postFormat');
const { sendInvoiceEmail, notifyAdminNewPost } = require('../utils/invoice');
const { sendMail } = require('../utils/mailer');
const { formatCents } = require('../utils/money');
const runtimeConfig = require('./runtimeConfig');

const DAY_MS = 24 * 60 * 60 * 1000;
const appUrl = () => runtimeConfig.get('app_url', 'APP_URL') || '';

function insertPost({ type, category, payload, hasImages }) {
  const now = Date.now();
  const publicId = newPublicId();
  const contact = payload.contact || {};
  const stmt = db.prepare(`
    INSERT INTO posts (
      public_id, type, category, taxonomy_id, title, description, fields,
      location_text, location_city, location_state, location_lat, location_lng, location_place_id,
      contact_phone, contact_phone_ext, contact_email, contact_url, contact_url_approved,
      poster_first_name, poster_last_name, poster_email, poster_phone,
      pricing_tier_id, price_cents_paid, is_featured_strike, is_oversized,
      status, has_images, view_count, created_at, updated_at
    ) VALUES (
      @public_id, @type, @category, @taxonomy_id, @title, @description, @fields,
      @location_text, @location_city, @location_state, @location_lat, @location_lng, @location_place_id,
      @contact_phone, @contact_phone_ext, @contact_email, @contact_url, 0,
      @poster_first_name, @poster_last_name, @poster_email, @poster_phone,
      @pricing_tier_id, 0, @is_featured_strike, @is_oversized,
      'pending_payment', @has_images, 0, @created_at, @updated_at
    )
  `);
  const info = stmt.run({
    public_id: publicId,
    type,
    category,
    taxonomy_id: payload.taxonomyId || null,
    title: payload.title,
    description: payload.description || '',
    fields: JSON.stringify(payload.fields || {}),
    location_text: payload.locationText || null,
    location_city: payload.locationCity || null,
    location_state: payload.locationState || null,
    location_lat: payload.locationLat ?? null,
    location_lng: payload.locationLng ?? null,
    location_place_id: payload.locationPlaceId || null,
    contact_phone: contact.phone || null,
    contact_phone_ext: contact.phoneExt || null,
    contact_email: contact.email || null,
    contact_url: contact.url || null,
    poster_first_name: payload.posterFirstName || null,
    poster_last_name: payload.posterLastName || null,
    poster_email: payload.posterEmail,
    poster_phone: payload.posterPhone || null,
    pricing_tier_id: payload.pricingTierId || null,
    is_featured_strike: payload.wantsStrike ? 1 : 0,
    is_oversized: payload.wantsOversized ? 1 : 0,
    has_images: hasImages ? 1 : 0,
    created_at: now,
    updated_at: now,
  });
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid);
}

function attachImages(postId, filenames) {
  if (!filenames || !filenames.length) return;
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT INTO post_images (post_id, filename, original_name, approved, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?)'
  );
  filenames.forEach((f, i) => stmt.run(postId, f.filename, f.originalName || null, i, now));
}

function recordPayment({ postId, kind, amountCents, payerEmail, status, stripeSessionId, invoiceNumber }) {
  const info = db
    .prepare(
      `INSERT INTO post_payments (post_id, kind, amount_cents, stripe_session_id, payer_email, status, invoice_number, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(postId, kind, amountCents, stripeSessionId || null, payerEmail, status, invoiceNumber || null, Date.now());
  return db.prepare('SELECT * FROM post_payments WHERE id = ?').get(info.lastInsertRowid);
}

function attachSimchaSurprises(postId, surpriseEmails, senderDisplayName) {
  if (!surpriseEmails || !surpriseEmails.length) return;
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT INTO simcha_surprises (post_id, recipient_email, sender_display_name, sent, created_at) VALUES (?, ?, ?, 0, ?)'
  );
  surpriseEmails.forEach((s) => stmt.run(postId, s.email, s.senderDisplayName || senderDisplayName || '', now));
}

async function sendSurpriseEmails(post) {
  const surprises = db.prepare('SELECT * FROM simcha_surprises WHERE post_id = ? AND sent = 0').all(post.id);
  const url = `${appUrl()}/simchas/${post.public_id}`;
  for (const s of surprises) {
    const from = s.sender_display_name || 'A friend';
    try {
      await sendMail({
        to: s.recipient_email,
        subject: `A surprise Mazel Tov for you!`,
        html: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto">
          <h2 style="color:#1f3b57">Mazel Tov!</h2>
          <p><b>${from}</b> wanted to surprise you with a Mazel Tov!</p>
          <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#1f3b57;color:#fff;text-decoration:none;border-radius:4px">View the Simcha</a></p>
        </div>`,
      });
      db.prepare('UPDATE simcha_surprises SET sent = 1 WHERE id = ?').run(s.id);
    } catch (e) {
      console.error('Failed to send surprise email', s.id, e.message);
    }
  }
}

function computeExpiry(post) {
  let durationDays = 30;
  if (post.pricing_tier_id) {
    const tier = db.prepare('SELECT duration_days FROM pricing_tiers WHERE id = ?').get(post.pricing_tier_id);
    if (tier) durationDays = tier.duration_days;
  } else if (post.type === 'simcha') {
    durationDays = require('./pricing').getSetting('simcha_retention_days', 30);
  }
  return Date.now() + durationDays * DAY_MS;
}

async function finalizePostLive(postId) {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return null;
  const now = Date.now();
  const expiresAt = computeExpiry(post);
  const nextStatus = post.has_images ? 'pending_approval' : 'live';
  db.prepare(
    `UPDATE posts SET status = ?, published_at = ?, expires_at = ?, boosted_at = ?, updated_at = ? WHERE id = ?`
  ).run(nextStatus, nextStatus === 'live' ? now : null, nextStatus === 'live' ? expiresAt : null, now, now, postId);

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);

  // The post's status/expiry has already been committed above - a broken
  // mail config (bad SMTP creds, unreachable host, etc.) must never throw
  // back out of here and make the post-live transition itself look like it
  // failed. Log clearly so send failures are still diagnosable from server
  // logs instead of disappearing silently.
  try {
    await sendInvoiceForPost(updated);
  } catch (e) {
    console.error('[postLifecycle] Failed to send invoice email for post', updated.public_id, '-', e.message);
  }

  if (nextStatus === 'pending_approval') {
    try {
      await notifyAdminNewPost(updated, 'New post with images awaiting approval');
    } catch (e) {
      console.error('[postLifecycle] Failed to notify admin of new post', updated.public_id, '-', e.message);
    }
  }
  if (updated.type === 'simcha') {
    await sendSurpriseEmails(updated);
  }
  return updated;
}

async function sendInvoiceForPost(post) {
  const payments = db.prepare('SELECT * FROM post_payments WHERE post_id = ? AND status = ?').all(post.id, 'paid');
  const totalCents = payments.reduce((s, p) => s + p.amount_cents, 0);
  const invoiceNumber = payments[0]?.invoice_number || newInvoiceNumber();
  const urlSegment = post.type === 'simcha' ? '/simchas/' : post.type === 'listing' ? '/listings/' : '/classifieds/';
  const url = `${appUrl()}${urlSegment}${post.public_id}`;
  const invoice = {
    invoiceNumber,
    issuedAt: new Date(),
    poster: { firstName: post.poster_first_name, lastName: post.poster_last_name, email: post.poster_email, phone: post.poster_phone },
    post: {
      type: post.type,
      categoryLabel: categoryLabel(post.category, post.type),
      title: post.title,
      publicId: post.public_id,
      url,
      location: post.location_text,
      publishedAtText: post.published_at ? new Date(post.published_at).toDateString() : 'upon approval',
      expiresAtText: post.expires_at ? new Date(post.expires_at).toDateString() : 'n/a (pending approval)',
    },
    lineItems: payments.length
      ? payments.map((p) => ({ label: p.kind === 'listing' ? 'Listing' : p.kind, amount_cents: p.amount_cents }))
      : [{ label: 'Listing (free)', amount_cents: 0 }],
    totalCents,
  };
  await sendInvoiceEmail(invoice);
  return invoice;
}

// Shared by the Stripe webhook (primary path) and the success-page fallback
// verification (in case the webhook is misconfigured or delayed) so a paid
// checkout session is fulfilled exactly the same way regardless of which one
// gets there first. Safe to call twice - once a payment is marked 'paid' or
// a boost/strike already applied, re-running is a no-op.
async function fulfillCheckoutSession(session) {
  const { getActivePromo, recordUse } = require('./promoCodes');
  const meta = session.metadata || {};
  const payment = meta.paymentId ? db.prepare('SELECT * FROM post_payments WHERE id = ?').get(Number(meta.paymentId)) : null;
  if (payment && payment.status !== 'paid') {
    db.prepare('UPDATE post_payments SET status = ?, stripe_payment_intent = ? WHERE id = ?').run(
      'paid', session.payment_intent || null, payment.id
    );
  }

  if (meta.kind === 'listing' && meta.postId) {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(meta.postId));
    if (post && post.status === 'pending_payment') {
      if (meta.promoCode) {
        const promo = getActivePromo(meta.promoCode);
        if (promo) recordUse(promo);
      }
      await finalizePostLive(Number(meta.postId));
    }
    return db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(meta.postId));
  }
  if (meta.kind === 'boost' && meta.postId) {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(meta.postId));
    if (post) {
      db.prepare('UPDATE posts SET boosted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), post.id);
      if (payment && payment.status !== 'paid') {
        await sendMail({
          to: post.poster_email,
          subject: `Your listing was boosted: ${post.title}`,
          html: `<p>Your listing "${post.title}" has been moved back to the top.</p>`,
        }).catch((e) => console.error('[postLifecycle] Failed to send boost confirmation email for post', post.public_id, '-', e.message));
      }
    }
    return post;
  }
  if (meta.kind === 'strike' && meta.postId) {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(meta.postId));
    if (post) {
      db.prepare('UPDATE posts SET is_featured_strike = 1, updated_at = ? WHERE id = ?').run(Date.now(), post.id);
      if (payment && payment.status !== 'paid') {
        await sendMail({
          to: post.poster_email,
          subject: `Your listing is now featured: ${post.title}`,
          html: `<p>Your listing "${post.title}" is now featured/striking.</p>`,
        }).catch((e) => console.error('[postLifecycle] Failed to send strike confirmation email for post', post.public_id, '-', e.message));
      }
    }
    return post;
  }
  return null;
}

module.exports = {
  fulfillCheckoutSession,
  insertPost,
  attachImages,
  recordPayment,
  attachSimchaSurprises,
  sendSurpriseEmails,
  finalizePostLive,
  sendInvoiceForPost,
  computeExpiry,
  DAY_MS,
};
