const { formatPhoneDashed } = require('../utils/phone');
const { normalizeUrl } = require('../utils/validate');
const { findCategory, findListingCategory } = require('./taxonomy');

function categoryLabel(category, type) {
  if (category === 'simcha') return 'Simcha';
  if (type === 'listing') return findListingCategory(category)?.label || category;
  return findCategory(category)?.label || category;
}

function buildContactLinks(post) {
  const contact = {};
  if (post.contact_phone) {
    const ext = post.contact_phone_ext ? `,${post.contact_phone_ext}` : '';
    // Which ways this number can be reached - posts from before this field
    // existed have no value stored, and default to ["call"] (the only way
    // a phone number could ever be reached before). contact_phone is stored
    // as E.164 (see utils/phone.js), so stripping everything but digits
    // gives wa.me exactly the country-code-prefixed digits it requires.
    let methods;
    try { methods = post.contact_phone_methods ? JSON.parse(post.contact_phone_methods) : ['call']; }
    catch (e) { methods = ['call']; }
    const digits = post.contact_phone.replace(/\D/g, '');
    contact.phone = {
      display: formatPhoneDashed(post.contact_phone),
      ext: post.contact_phone_ext || null,
      methods,
      tel: methods.includes('call') ? `tel:${post.contact_phone.replace(/[^\d+]/g, '')}${ext}` : null,
      sms: methods.includes('sms') ? `sms:${post.contact_phone.replace(/[^\d+]/g, '')}` : null,
      whatsapp: methods.includes('whatsapp') ? `https://wa.me/${digits}` : null,
    };
  }
  if (post.contact_email) {
    contact.email = { display: post.contact_email, mailto: `mailto:${post.contact_email}` };
  }
  if (post.contact_url && post.contact_url_approved) {
    // Defensive: normalizes even URLs stored without a protocol before this
    // was fixed at submission time (e.g. "example.com"), which would
    // otherwise resolve as a relative in-site path instead of an external
    // link.
    const href = normalizeUrl(post.contact_url);
    contact.url = { display: post.contact_url, href };
  }
  return contact;
}

function parseFields(post) {
  try {
    return JSON.parse(post.fields || '{}');
  } catch (e) {
    return {};
  }
}

// Listings only - the extra category keys beyond the primary `category`.
// Always [] for classifieds/simchas, and for a listing with just its one.
function parseExtraCategories(post) {
  if (!post.extra_categories) return [];
  try {
    const arr = JSON.parse(post.extra_categories);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function formatPostPublic(post, images = []) {
  return {
    id: post.public_id,
    type: post.type,
    status: post.status,
    category: post.category,
    categoryLabel: categoryLabel(post.category, post.type),
    extraCategories: parseExtraCategories(post),
    extraCategoryLabels: parseExtraCategories(post).map((c) => categoryLabel(c, post.type)),
    taxonomyId: post.taxonomy_id || null,
    title: post.title,
    description: post.description,
    fields: parseFields(post),
    location: {
      text: post.location_text,
      city: post.location_city,
      state: post.location_state,
      lat: post.location_lat,
      lng: post.location_lng,
    },
    // Simchas never show contact info publicly - it's collected only so
    // admins/CRM can reach the poster, and for the report-post workflow.
    // Expired posts stay visible (see routes/public/{classifieds,listings,
    // simchas}.js's detail routes) but lose their contact info the same
    // way - the poster may no longer be reachable at it, and it's no
    // longer meant to generate new contact, just stay findable with an
    // "expired" stamp.
    contact: post.type === 'simcha' || post.status === 'expired' ? {} : buildContactLinks(post),
    isFeatured: !!post.is_featured_strike,
    // View count is tracked (see /api/posts/impressions) but not shown
    // publicly for now - it's still visible to admins via formatPostAdmin.
    publishedAt: post.published_at,
    // Expiration is intentionally not exposed on public listings - it's only
    // ever shown during the posting flow itself (review step + invoice).
    images: images.filter((i) => i.approved).map((i) => `/uploads/${i.filename}`),
  };
}

function formatPostAdmin(post, images = []) {
  return {
    id: post.id,
    publicId: post.public_id,
    type: post.type,
    category: post.category,
    categoryLabel: categoryLabel(post.category, post.type),
    extraCategories: parseExtraCategories(post),
    extraCategoryLabels: parseExtraCategories(post).map((c) => categoryLabel(c, post.type)),
    taxonomyId: post.taxonomy_id || null,
    title: post.title,
    description: post.description,
    fields: parseFields(post),
    location: {
      text: post.location_text,
      city: post.location_city,
      state: post.location_state,
      lat: post.location_lat,
      lng: post.location_lng,
      placeId: post.location_place_id,
    },
    contact: {
      phone: post.contact_phone,
      phoneExt: post.contact_phone_ext,
      email: post.contact_email,
      url: post.contact_url,
      urlApproved: !!post.contact_url_approved,
    },
    poster: {
      firstName: post.poster_first_name,
      lastName: post.poster_last_name,
      email: post.poster_email,
      phone: post.poster_phone,
    },
    pricingTierId: post.pricing_tier_id,
    priceCentsPaid: post.price_cents_paid,
    isFeaturedStrike: !!post.is_featured_strike,
    isOversized: !!post.is_oversized,
    status: post.status,
    hasImages: !!post.has_images,
    viewCount: post.view_count,
    clickCount: post.click_count,
    boostedAt: post.boosted_at,
    publishedAt: post.published_at,
    scheduledAt: post.scheduled_at,
    expiresAt: post.expires_at,
    savedForever: !!post.saved_forever,
    adminNotes: post.admin_notes,
    rejectionReason: post.rejection_reason,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    images: images.map((i) => ({ id: i.id, url: `/uploads/${i.filename}`, approved: !!i.approved })),
  };
}

module.exports = { formatPostPublic, formatPostAdmin, buildContactLinks, categoryLabel, parseFields, parseExtraCategories };
