const { getStripe } = require('../utils/stripeClient');

async function createCheckoutSession({ lineItems, successUrl, cancelUrl, metadata, customerEmail }) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
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
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

module.exports = { createCheckoutSession };
