const express = require('express');
const db = require('../../db');
const { LOST_FOUND_OPTIONS, DEFAULT_BROOKLYN_LOCATION } = require('../../utils/constants');
const { getClassifiedCharLimits, getSimchaCharLimits, getOversizedCharLimits, getSetting, getAddon } = require('../../services/pricing');
const runtimeConfig = require('../../services/runtimeConfig');
const { getCountryList } = require('../../utils/countries');
const { getAllClassifiedCategories, getOptionNames } = require('../../services/categories');

const router = express.Router();

router.get('/', (req, res) => {
  const taxonomies = db.prepare('SELECT * FROM taxonomies WHERE active = 1 ORDER BY grp, parent_id, sort_order').all();
  const pricingTiers = db.prepare('SELECT * FROM pricing_tiers WHERE active = 1 ORDER BY category, sort_order').all();

  res.json({
    categories: getAllClassifiedCategories(),
    countries: getCountryList(),
    jobTypes: getOptionNames('job_type'),
    payPeriods: getOptionNames('pay_period'),
    lostFoundOptions: LOST_FOUND_OPTIONS,
    taxonomies,
    pricingTiers,
    addons: {
      strike: getAddon('strike'),
      oversized: getAddon('oversized'),
      boost: getAddon('boost'),
    },
    charLimits: getClassifiedCharLimits(),
    simchaCharLimits: getSimchaCharLimits(),
    oversizedCharLimits: getOversizedCharLimits(),
    defaultLocation: getSetting('default_location', DEFAULT_BROOKLYN_LOCATION),
    googleMapsApiKey: runtimeConfig.get('google_maps_api_key', 'GOOGLE_MAPS_API_KEY') || null,
    siteName: runtimeConfig.get('site_name', 'SITE_NAME') || 'Everything Shul Classifieds',
  });
});

module.exports = router;
