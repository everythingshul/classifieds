const { formatPhoneDashed } = require('../utils/phone');
const { normalizeUrl } = require('../utils/validate');
const { findCategory } = require('./categories');
const { findListingCategory } = require('./listingCategories');

function categoryLabel(category, type) {
  if (category === 'simcha') return 'Simcha';
  if (type === 'listing') return findListingCategory(category)?.label || category;
  return findCategory(category)?.label || category;
}

function buildContactLinks(post) {
  const contact = {};
  if (post.contact_phone) {
    const ext = post.contact_phone_ext ? `,${post.contact_phone_ext}` : '';
    contact.phone = {
      display: formatPhoneDashed(post.contact_phone),
      ext: post.contact_phone_ext || null,
      tel: `tel:${post.contact_phone.replace(/[^\d+]/g, '')}${ext}`,
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

function formatPostPublic(post, images = []) {
  return {
    id: post.public_id,
    type: post.type,
    status: post.status,
    category: post.category,
    categoryLabel: categoryLabel(post.category, post.type),
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
    contact: post.type === 'simcha' ? {} : buildContactLinks(post),
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
    expiresAt: post.expires_at,
    savedForever: !!post.saved_forever,
    adminNotes: post.admin_notes,
    rejectionReason: post.rejection_reason,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    images: images.map((i) => ({ id: i.id, url: `/uploads/${i.filename}`, approved: !!i.approved })),
  };
}

module.exports = { formatPostPublic, formatPostAdmin, buildContactLinks, categoryLabel, parseFields };
