const { getStripe, getPublishableKey } = require('../utils/stripeClient');

// Embedded Checkout (the payment form renders inline via Stripe.js) requires
// a publishable key on top of the secret key. If one hasn't been set in
// Admin -> Settings, fall back to Stripe's classic hosted, redirect-based
// Checkout instead, which only needs the secret key - so a site that never
// configures the new publishable-key field still takes payments rather than
// failing outright.
async function createCheckoutSession({ lineItems, returnUrl, cancelUrl, metadata, customerEmail }) {
  const stripe = getStripe();
  const base = {
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customerEmail,
    line_items: lineItems.map((item) => ({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: item.amount_cents,
        product_data: { name: item.label },
      },
    })),
    metadata,
  };

  if (getPublishableKey()) {
    return stripe.checkout.sessions.create({ ...base, ui_mode: 'embedded', return_url: returnUrl });
  }
  return stripe.checkout.sessions.create({ ...base, success_url: returnUrl, cancel_url: cancelUrl || returnUrl });
}

module.exports = { createCheckoutSession };
