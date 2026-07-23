// Fixed, top-level classifieds categories. These drive form schemas and are not
// admin-editable (unlike taxonomies, which back job/real-estate/simcha sub-lists).
const CLASSIFIED_CATEGORIES = [
  { key: 'job-offers', label: 'Job Offers', labelHe: 'משרות פנויות', hasImages: false, free: false, taxonomyGroup: 'job' },
  { key: 'seeking-a-job', label: 'Seeking A Job', labelHe: 'מחפש עבודה', hasImages: false, free: false, taxonomyGroup: 'job' },
  { key: 'items-for-sale', label: 'Items For Sale', labelHe: 'למכירה', hasImages: true, free: false, taxonomyGroup: null },
  { key: 'items-for-rent', label: 'Items For Rent', labelHe: 'להשכרה', hasImages: true, free: false, taxonomyGroup: null },
  { key: 'free-giveaways', label: 'Free Giveaways', labelHe: 'חינם', hasImages: false, free: false, taxonomyGroup: null },
  { key: 'lost-found', label: 'Lost & Found', labelHe: 'אבידות ומציאות', hasImages: false, free: true, taxonomyGroup: null },
  { key: 'wanted', label: 'Wanted', labelHe: 'דרוש', hasImages: false, free: false, taxonomyGroup: null },
  { key: 'services', label: 'Services', labelHe: 'שירותים', hasImages: false, free: false, taxonomyGroup: null },
  { key: 'real-estate', label: 'Real Estate', labelHe: 'נדל"ן', hasImages: true, free: false, taxonomyGroup: 'real_estate' },
];

const CLASSIFIED_CATEGORY_KEYS = CLASSIFIED_CATEGORIES.map((c) => c.key);

const JOB_TYPES = ['part_time', 'full_time', 'seasonal', 'one_time'];
const PAY_PERIODS = ['hour', 'week', 'month', 'season', 'year', 'project'];
const LOST_FOUND_OPTIONS = ['lost', 'found'];

const POST_STATUSES = ['pending_payment', 'pending_approval', 'live', 'rejected', 'expired', 'removed'];

const DEFAULT_CHAR_LIMITS = {
  title: 80,
  description: 1200,
};

const OVERSIZED_CHAR_LIMITS = {
  title: 140,
  description: 3000,
};

const DEFAULT_BROOKLYN_LOCATION = {
  label: 'Brooklyn, NY',
  lat: 40.6782,
  lng: -73.9442,
  tzid: 'America/New_York',
};

module.exports = {
  CLASSIFIED_CATEGORIES,
  CLASSIFIED_CATEGORY_KEYS,
  JOB_TYPES,
  PAY_PERIODS,
  LOST_FOUND_OPTIONS,
  POST_STATUSES,
  DEFAULT_CHAR_LIMITS,
  OVERSIZED_CHAR_LIMITS,
  DEFAULT_BROOKLYN_LOCATION,
};
