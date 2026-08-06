const { LOST_FOUND_OPTIONS, CURRENCY_CODES } = require('../utils/constants');
const { isValidEmail, isValidUrl, normalizeUrl } = require('../utils/validate');
const { validatePhone, validateExtension } = require('../utils/phone');
const { getClassifiedCategoryKeys, findCategory, getOptionNames } = require('./categories');
const { getListingCategoryKeys, findListingCategory } = require('./listingCategories');

class ValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.status = 400;
    this.errors = errors;
  }
}

function requireString(v, field, errors, { max } = {}) {
  if (typeof v !== 'string' || !v.trim()) {
    errors.push(`${field} is required`);
    return '';
  }
  if (max && v.length > max) errors.push(`${field} must be ${max} characters or fewer`);
  return v.trim();
}

// Defaults to USD (and silently falls back to USD for an invalid/unknown
// code) rather than erroring - the currency choice is a display preference
// on the poster's own price, not something worth blocking a submission over.
function currencyOrDefault(f) {
  return CURRENCY_CODES.includes(f.currency) ? f.currency : 'USD';
}

// Price/pay fields accept a numeric amount, arbitrary free text (e.g. "Call
// for price", "DOE"), or nothing at all - callers decide whether blank is
// allowed. Returns at most one of amount/text set, never both.
function parseAmountOrText(raw) {
  if (raw === undefined || raw === null) return { amount: null, text: null };
  const str = String(raw).trim();
  if (!str) return { amount: null, text: null };
  const num = Number(str);
  if (Number.isFinite(num)) return { amount: num, text: null };
  return { amount: null, text: str.slice(0, 60) };
}

function validateCategoryFields(category, fields, errors, categoryDef) {
  const f = fields || {};
  const out = {};
  switch (category) {
    case 'job-offers': {
      const jobTypes = getOptionNames('job_type');
      if (!jobTypes.includes(f.jobType)) errors.push('jobType must be one of ' + jobTypes.join(', '));
      out.jobType = f.jobType;
      if (f.payAmount !== undefined && f.payAmount !== null && f.payAmount !== '') {
        const { amount, text } = parseAmountOrText(f.payAmount);
        if (amount !== null && amount < 0) errors.push('payAmount must be a positive number');
        out.payAmount = amount;
        out.payAmountText = text;
        // A period only makes sense alongside a numeric amount - free text
        // like "DOE" or "Competitive" already says everything on its own.
        if (amount !== null) {
          const payPeriods = getOptionNames('pay_period');
          if (!payPeriods.includes(f.payPeriod)) errors.push('payPeriod must be one of ' + payPeriods.join(', '));
          out.payPeriod = f.payPeriod;
          out.payCurrency = CURRENCY_CODES.includes(f.payCurrency) ? f.payCurrency : 'USD';
        }
      }
      break;
    }
    case 'seeking-a-job': {
      out.experience = typeof f.experience === 'string' ? f.experience.slice(0, 300) : '';
      break;
    }
    case 'items-for-sale':
    case 'items-for-rent': {
      const { amount, text } = parseAmountOrText(f.price);
      if (amount !== null && amount < 0) errors.push('price must be a positive number');
      out.price = amount;
      out.priceText = text;
      if (amount !== null) out.currency = currencyOrDefault(f);
      break;
    }
    case 'lost-found': {
      if (!LOST_FOUND_OPTIONS.includes(f.lostOrFound)) errors.push('lostOrFound must be "lost" or "found"');
      out.lostOrFound = f.lostOrFound;
      break;
    }
    case 'real-estate': {
      const { amount, text } = parseAmountOrText(f.price);
      if (amount !== null && amount < 0) errors.push('price must be a positive number');
      out.price = amount;
      out.priceText = text;
      if (amount !== null) out.currency = currencyOrDefault(f);
      break;
    }
    case 'free-giveaways':
    case 'wanted':
    case 'services':
      break;
    default:
      // Admin-added custom category - generic optional price field.
      if (categoryDef?.hasPrice) {
        const { amount, text } = parseAmountOrText(f.price);
        if (amount !== null && amount < 0) errors.push('price must be a positive number');
        out.price = amount;
        out.priceText = text;
        if (amount !== null) out.currency = currencyOrDefault(f);
      }
      break;
  }
  return out;
}

const CATEGORIES_NOT_REQUIRING_DESCRIPTION = new Set(['job-offers', 'seeking-a-job']);
const CATEGORIES_REQUIRING_TAXONOMY = new Set(['job-offers', 'seeking-a-job', 'real-estate']);

function validateClassifiedPayload(body, charLimits) {
  const errors = [];
  const category = body.category;
  const categoryDef = findCategory(category);
  if (!categoryDef) {
    throw new ValidationError([`category must be one of ${getClassifiedCategoryKeys().join(', ')}`]);
  }

  const title = requireString(body.title, 'title', errors, { max: charLimits.title });
  let description = '';
  if (!CATEGORIES_NOT_REQUIRING_DESCRIPTION.has(category)) {
    description = requireString(body.description, 'description', errors, { max: charLimits.description });
  } else if (body.description) {
    description = String(body.description).slice(0, charLimits.description);
  }

  const locationText = requireString(body.locationText, 'location', errors, { max: 200 });

  // Required for the categories that have always needed it (job/real-estate);
  // optional-but-accepted for any other category with admin-defined
  // sub-categories, since not every category will have any defined yet.
  let taxonomyId = body.taxonomyId ? Number(body.taxonomyId) || null : null;
  if (CATEGORIES_REQUIRING_TAXONOMY.has(category) && !taxonomyId) {
    errors.push('a category selection is required');
  }

  const fields = validateCategoryFields(category, body.fields, errors, categoryDef);

  const posterEmail = requireString(body.posterEmail, 'email', errors);
  if (posterEmail && !isValidEmail(posterEmail)) errors.push('email address is invalid');

  let posterPhone = null;
  if (body.posterPhone) {
    const p = validatePhone(body.posterPhone, body.posterPhoneCountry || 'US');
    if (!p.valid) errors.push('phone number is invalid');
    else posterPhone = p.e164;
  }

  const contact = validateContact(body, errors);

  if (!body.pricingTierId && !categoryDef.free) {
    errors.push('a pricing tier must be selected');
  }

  if (errors.length) throw new ValidationError(errors);

  return {
    category,
    taxonomyId: taxonomyId || null,
    title,
    description,
    fields,
    locationText,
    locationCity: body.locationCity || null,
    locationState: body.locationState || null,
    locationLat: body.locationLat != null ? Number(body.locationLat) : null,
    locationLng: body.locationLng != null ? Number(body.locationLng) : null,
    locationPlaceId: body.locationPlaceId || null,
    posterFirstName: body.posterFirstName || null,
    posterLastName: body.posterLastName || null,
    posterEmail: posterEmail.toLowerCase(),
    posterPhone,
    contact,
    pricingTierId: body.pricingTierId ? Number(body.pricingTierId) : null,
    wantsStrike: !!body.wantsStrike,
    wantsOversized: !!body.wantsOversized,
  };
}

function validateContact(body, errors) {
  const contact = {};
  const hasPhone = !!body.contactPhone;
  const hasEmail = !!body.contactEmail;
  const hasUrl = !!body.contactUrl;
  if (!hasPhone && !hasEmail && !hasUrl) {
    errors.push('at least one contact method (phone, email, or website) is required');
    return contact;
  }
  if (hasPhone) {
    const p = validatePhone(body.contactPhone, body.contactPhoneCountry || 'US');
    if (!p.valid) errors.push('contact phone number is invalid');
    else contact.phone = p.e164;
    const ext = validateExtension(body.contactPhoneExt);
    if (!ext.valid) errors.push('contact phone extension is invalid');
    else contact.phoneExt = ext.ext || null;
  }
  if (hasEmail) {
    if (!isValidEmail(body.contactEmail)) errors.push('contact email is invalid');
    else contact.email = body.contactEmail.toLowerCase();
  }
  if (hasUrl) {
    if (!isValidUrl(body.contactUrl)) errors.push('contact website is invalid');
    else contact.url = normalizeUrl(body.contactUrl);
  }
  return contact;
}

// Listings is a fully separate section from Classifieds - every category is
// admin-defined and generic (no specialized fields like job type/lost-found).
function validateListingPayload(body, charLimits) {
  const errors = [];
  const category = body.category;
  const categoryDef = findListingCategory(category);
  if (!categoryDef) {
    throw new ValidationError([`category must be one of ${getListingCategoryKeys().join(', ')}`]);
  }

  const title = requireString(body.title, 'title', errors, { max: charLimits.title });
  const description = requireString(body.description, 'description', errors, { max: charLimits.description });
  const locationText = requireString(body.locationText, 'location', errors, { max: 200 });

  const fields = {};
  if (categoryDef.hasPrice) {
    const { amount, text } = parseAmountOrText(body.fields?.price);
    if (amount !== null && amount < 0) errors.push('price must be a positive number');
    fields.price = amount;
    fields.priceText = text;
    if (amount !== null) fields.currency = currencyOrDefault(body.fields || {});
  }

  // Optional: only used if the admin has defined sub-categories for this
  // listing category (see taxonomyGroup on the category, "lst:<key>").
  const taxonomyId = body.taxonomyId ? Number(body.taxonomyId) || null : null;

  const posterEmail = requireString(body.posterEmail, 'email', errors);
  if (posterEmail && !isValidEmail(posterEmail)) errors.push('email address is invalid');

  let posterPhone = null;
  if (body.posterPhone) {
    const p = validatePhone(body.posterPhone, body.posterPhoneCountry || 'US');
    if (!p.valid) errors.push('phone number is invalid');
    else posterPhone = p.e164;
  }

  const contact = validateContact(body, errors);

  if (!body.pricingTierId && !categoryDef.free) {
    errors.push('a pricing tier must be selected');
  }

  if (errors.length) throw new ValidationError(errors);

  return {
    category,
    taxonomyId,
    title,
    description,
    fields,
    locationText,
    locationCity: body.locationCity || null,
    locationState: body.locationState || null,
    locationLat: body.locationLat != null ? Number(body.locationLat) : null,
    locationLng: body.locationLng != null ? Number(body.locationLng) : null,
    locationPlaceId: body.locationPlaceId || null,
    posterFirstName: body.posterFirstName || null,
    posterLastName: body.posterLastName || null,
    posterEmail: posterEmail.toLowerCase(),
    posterPhone,
    contact,
    pricingTierId: body.pricingTierId ? Number(body.pricingTierId) : null,
    wantsStrike: !!body.wantsStrike,
    wantsOversized: !!body.wantsOversized,
  };
}

function validateSimchaPayload(body, charLimits) {
  const errors = [];
  // Simchas have no title, date, or location field to fill in - just a
  // category and (optional) details. The title is auto-generated from the
  // chosen category name once we have DB access (see routes/public/posts.js).
  const description = body.description ? String(body.description).slice(0, charLimits.description) : '';
  const taxonomyId = Number(body.taxonomyId);
  if (!taxonomyId) errors.push('a simcha category is required');

  const posterEmail = requireString(body.posterEmail, 'email', errors);
  if (posterEmail && !isValidEmail(posterEmail)) errors.push('email address is invalid');

  let posterPhone = null;
  if (body.posterPhone) {
    const p = validatePhone(body.posterPhone, body.posterPhoneCountry || 'US');
    if (!p.valid) errors.push('phone number is invalid');
    else posterPhone = p.e164;
  }

  const contact = {};
  if (body.contactPhone) {
    const p = validatePhone(body.contactPhone, body.contactPhoneCountry || 'US');
    if (!p.valid) errors.push('contact phone number is invalid');
    else contact.phone = p.e164;
  }
  if (body.contactEmail) {
    if (!isValidEmail(body.contactEmail)) errors.push('contact email is invalid');
    else contact.email = body.contactEmail.toLowerCase();
  }
  if (body.contactUrl) {
    if (!isValidUrl(body.contactUrl)) errors.push('contact website is invalid');
    else contact.url = normalizeUrl(body.contactUrl);
  }

  // Limited to a single surprise recipient by design.
  let surpriseEmails = [];
  if (Array.isArray(body.surpriseEmails)) {
    surpriseEmails = body.surpriseEmails.filter((s) => s && s.email).slice(0, 1);
  } else if (body.surpriseEmail) {
    surpriseEmails = [{ email: body.surpriseEmail, senderDisplayName: body.posterFirstName || '' }];
  }
  surpriseEmails = surpriseEmails.map((s) => {
    if (!isValidEmail(s.email)) errors.push(`surprise email address "${s.email}" is invalid`);
    return { email: String(s.email).toLowerCase(), senderDisplayName: String(s.senderDisplayName || '').slice(0, 80) };
  });

  if (errors.length) throw new ValidationError(errors);

  return {
    description,
    taxonomyId,
    fields: {},
    posterFirstName: body.posterFirstName || null,
    posterLastName: body.posterLastName || null,
    posterEmail: posterEmail.toLowerCase(),
    posterPhone,
    contact,
    surpriseEmails,
  };
}

module.exports = { ValidationError, validateClassifiedPayload, validateSimchaPayload, validateListingPayload, validateCategoryFields, parseAmountOrText };
