const { getStripe } = require('../utils/stripeClient');

// Embedded Checkout: the payment form itself renders inline on our page (via
// Stripe.js) instead of redirecting to a Stripe-hosted page. Stripe still
// needs a `return_url` for after payment completes (e.g. 3D Secure), which is
// where post-success.html verifies the session and finalizes the post - a
// fallback that doesn't depend on the webhook having arrived yet.
async function createCheckoutSession({ lineItems, returnUrl, metadata, customerEmail }) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: 'payment',
    ui_mode: 'embedded',
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
    return_url: returnUrl,
    metadata,
  });
}

module.exports = { createCheckoutSession };
