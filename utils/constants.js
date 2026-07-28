// Fixed, top-level classifieds categories. These drive form schemas and are not
// admin-editable (unlike taxonomies, which back job/real-estate/simcha sub-lists).
const CLASSIFIED_CATEGORIES = [
  { key: 'job-offers', label: 'Job Offers', labelHe: 'משרות פנויות', hasImages: false, hasPrice: false, free: false, taxonomyGroup: 'job', isSystem: true },
  { key: 'seeking-a-job', label: 'Seeking A Job', labelHe: 'מחפש עבודה', hasImages: false, hasPrice: false, free: false, taxonomyGroup: 'job', isSystem: true },
  { key: 'items-for-sale', label: 'Items For Sale', labelHe: 'למכירה', hasImages: true, hasPrice: true, free: false, taxonomyGroup: 'cat:items-for-sale', isSystem: true },
  { key: 'items-for-rent', label: 'Items For Rent', labelHe: 'להשכרה', hasImages: true, hasPrice: true, free: false, taxonomyGroup: 'cat:items-for-rent', isSystem: true },
  { key: 'free-giveaways', label: 'Free Giveaways', labelHe: 'חינם', hasImages: false, hasPrice: false, free: false, taxonomyGroup: 'cat:free-giveaways', isSystem: true },
  { key: 'lost-found', label: 'Lost & Found', labelHe: 'אבידות ומציאות', hasImages: false, hasPrice: false, free: true, taxonomyGroup: 'cat:lost-found', isSystem: true },
  { key: 'wanted', label: 'Wanted', labelHe: 'דרוש', hasImages: false, hasPrice: false, free: false, taxonomyGroup: 'cat:wanted', isSystem: true },
  { key: 'services', label: 'Services', labelHe: 'שירותים', hasImages: false, hasPrice: false, free: false, taxonomyGroup: 'cat:services', isSystem: true },
  { key: 'real-estate', label: 'Real Estate', labelHe: 'נדל"ן', hasImages: true, hasPrice: true, free: false, taxonomyGroup: 'real_estate', isSystem: true },
];

const CLASSIFIED_CATEGORY_KEYS = CLASSIFIED_CATEGORIES.map((c) => c.key);

const LOST_FOUND_OPTIONS = ['lost', 'found'];

const POST_STATUSES = ['pending_payment', 'pending_approval', 'live', 'rejected', 'expired', 'removed'];

const DEFAULT_CHAR_LIMITS = {
  title: 80,
  description: 200,
};

const OVERSIZED_CHAR_LIMITS = {
  title: 140,
  description: 500,
};

const DEFAULT_BROOKLYN_LOCATION = {
  label: 'Brooklyn, NY',
  lat: 40.6782,
  lng: -73.9442,
  tzid: 'America/New_York',
};

// Currencies a poster can choose for their own listed price (e.g. an item's
// asking price) - separate from what the site itself charges for the
// listing fee via Stripe, which stays in whatever currency the site's
// Stripe account is configured for.
const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar (CAD)' },
  { code: 'ILS', symbol: '₪', label: 'Israeli Shekel (ILS)' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar (AUD)' },
];
const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

module.exports = {
  CLASSIFIED_CATEGORIES,
  CLASSIFIED_CATEGORY_KEYS,
  LOST_FOUND_OPTIONS,
  POST_STATUSES,
  DEFAULT_CHAR_LIMITS,
  OVERSIZED_CHAR_LIMITS,
  DEFAULT_BROOKLYN_LOCATION,
  CURRENCIES,
  CURRENCY_CODES,
};
