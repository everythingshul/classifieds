const Stripe = require('stripe');
const runtimeConfig = require('../services/runtimeConfig');

// Not cached across requests: the secret key can be changed live from the
// admin portal, and constructing a Stripe client is cheap.
function getStripe() {
  const key = runtimeConfig.get('stripe_secret_key', 'STRIPE_SECRET_KEY');
  if (!key) {
    throw Object.assign(new Error('Stripe is not configured. Add a Stripe secret key in Admin → Settings.'), { status: 500, expose: true });
  }
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

function getWebhookSecret() {
  return runtimeConfig.get('stripe_webhook_secret', 'STRIPE_WEBHOOK_SECRET');
}

function getPublishableKey() {
  return runtimeConfig.get('stripe_publishable_key', 'STRIPE_PUBLISHABLE_KEY');
}

module.exports = { getStripe, getWebhookSecret, getPublishableKey };
