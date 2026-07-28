function formatCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

// For a poster's own listed price (e.g. an item's asking price), which can
// be in a currency other than USD - unlike formatCents, which is only ever
// used for what the site itself charges (always USD via Stripe).
function formatMoney(cents, currency) {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch (e) {
    return formatCents(cents);
  }
}

module.exports = { formatCents, formatMoney };
