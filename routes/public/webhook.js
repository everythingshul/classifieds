const express = require('express');
const { getStripe, getWebhookSecret } = require('../../utils/stripeClient');
const { fulfillCheckoutSession } = require('../../services/postLifecycle');

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
      await fulfillCheckoutSession(event.data.object);
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook handling error', e);
    res.status(500).json({ error: 'Webhook handling failed' });
  }
});

module.exports = router;
