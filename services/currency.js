// Decides which currency a checkout happens in, based on which domain the
// request came in on. jlistings.co.uk (and any other .co.uk domain this app
// serves) charges in GBP; every other domain keeps USD. Never trust a
// client-sent value for this - it decides what a Stripe charge is for.
function currencyForHost(hostname) {
  return /\.co\.uk$/i.test(hostname || '') ? 'gbp' : 'usd';
}

module.exports = { currencyForHost };
