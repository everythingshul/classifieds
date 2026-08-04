const express = require('express');
const db = require('../../db');
const { LOST_FOUND_OPTIONS, DEFAULT_BROOKLYN_LOCATION, CURRENCIES } = require('../../utils/constants');
const { getClassifiedCharLimits, getSimchaCharLimits, getOversizedCharLimits, getListingCharLimits, getSetting, getAddon } = require('../../services/pricing');
const runtimeConfig = require('../../services/runtimeConfig');
const { getCountryList } = require('../../utils/countries');
const { getAllClassifiedCategories, getOptionNames } = require('../../services/categories');
const { getAllListingCategories } = require('../../services/listingCategories');
const { getPublishableKey } = require('../../utils/stripeClient');
const { orderTaxonomyTree } = require('../../services/taxonomySort');

const router = express.Router();

router.get('/', (req, res) => {
  const taxonomies = orderTaxonomyTree(db.prepare('SELECT * FROM taxonomies WHERE active = 1 ORDER BY grp, parent_id, sort_order').all());
  const pricingTiers = db.prepare('SELECT * FROM pricing_tiers WHERE active = 1 ORDER BY category, sort_order').all();

  res.json({
    categories: getAllClassifiedCategories(),
    listingCategories: getAllListingCategories(),
    countries: getCountryList(),
    jobTypes: getOptionNames('job_type'),
    payPeriods: getOptionNames('pay_period'),
    lostFoundOptions: LOST_FOUND_OPTIONS,
    currencies: CURRENCIES,
    taxonomies,
    pricingTiers,
    // Striking/oversized/boost pricing is separate per post type - simchas
    // don't offer any of these, so there's no 'simcha' entry here.
    addons: {
      classified: { strike: getAddon('classified_strike'), oversized: getAddon('classified_oversized'), boost: getAddon('classified_boost') },
      listing: { strike: getAddon('listing_strike'), oversized: getAddon('listing_oversized'), boost: getAddon('listing_boost') },
    },
    charLimits: getClassifiedCharLimits(),
    simchaCharLimits: getSimchaCharLimits(),
    oversizedCharLimits: getOversizedCharLimits(),
    listingCharLimits: getListingCharLimits(),
    defaultLocation: getSetting('default_location', DEFAULT_BROOKLYN_LOCATION),
    googleMapsApiKey: runtimeConfig.get('google_maps_api_key', 'GOOGLE_MAPS_API_KEY') || null,
    stripePublishableKey: getPublishableKey() || null,
    siteName: runtimeConfig.get('site_name', 'SITE_NAME') || 'JListings',
  });
});

module.exports = router;
