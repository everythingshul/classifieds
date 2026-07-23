const express = require('express');
const db = require('../../db');
const { getStripe, getWebhookSecret } = require('../../utils/stripeClient');
const { finalizePostLive } = require('../../services/postLifecycle');
const { sendMail } = require('../../utils/mailer');
const { getActivePromo, recordUse } = require('../../services/promoCodes');

const router = express.Router();

// Mounted with express.raw() in server.js - Stripe requires the raw body to verify signatures.
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const stripe = getStripe();
    const webhookSecret = getWebhookSecret();
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (e) {
    console.error('Webhook signature verification failed', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};
      const payment = meta.paymentId ? db.prepare('SELECT * FROM post_payments WHERE id = ?').get(Number(meta.paymentId)) : null;
      if (payment && payment.status !== 'paid') {
        db.prepare('UPDATE post_payments SET status = ?, stripe_payment_intent = ? WHERE id = ?').run(
          'paid', session.payment_intent || null, payment.id
        );
      }

      if (meta.kind === 'listing' && meta.postId) {
        if (meta.promoCode) {
          const promo = getActivePromo(meta.promoCode);
          if (promo) recordUse(promo);
        }
        await finalizePostLive(Number(meta.postId));
      } else if (meta.kind === 'boost' && meta.postId) {
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(meta.postId));
        if (post) {
          db.prepare('UPDATE posts SET boosted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), post.id);
          await sendMail({
            to: post.poster_email,
            subject: `Your listing was boosted: ${post.title}`,
            html: `<p>Your listing "${post.title}" has been moved back to the top.</p>`,
          }).catch(() => {});
        }
      } else if (meta.kind === 'strike' && meta.postId) {
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(meta.postId));
        if (post) {
          db.prepare('UPDATE posts SET is_featured_strike = 1, updated_at = ? WHERE id = ?').run(Date.now(), post.id);
          await sendMail({
            to: post.poster_email,
            subject: `Your listing is now featured: ${post.title}`,
            html: `<p>Your listing "${post.title}" is now featured/striking.</p>`,
          }).catch(() => {});
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook handling error', e);
    res.status(500).json({ error: 'Webhook handling failed' });
  }
});

module.exports = router;
