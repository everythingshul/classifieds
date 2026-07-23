const { CLASSIFIED_CATEGORY_KEYS, JOB_TYPES, PAY_PERIODS, LOST_FOUND_OPTIONS } = require('../utils/constants');
const { isValidEmail, isValidUrl } = require('../utils/validate');
const { validatePhone, validateExtension } = require('../utils/phone');

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

function validateCategoryFields(category, fields, errors) {
  const f = fields || {};
  const out = {};
  switch (category) {
    case 'job-offers': {
      if (!JOB_TYPES.includes(f.jobType)) errors.push('jobType must be one of ' + JOB_TYPES.join(', '));
      out.jobType = f.jobType;
      if (f.payAmount !== undefined && f.payAmount !== null && f.payAmount !== '') {
        const amt = Number(f.payAmount);
        if (Number.isNaN(amt) || amt < 0) errors.push('payAmount must be a positive number');
        if (!PAY_PERIODS.includes(f.payPeriod)) errors.push('payPeriod must be one of ' + PAY_PERIODS.join(', '));
        out.payAmount = amt;
        out.payPeriod = f.payPeriod;
      }
      break;
    }
    case 'seeking-a-job': {
      out.experience = typeof f.experience === 'string' ? f.experience.slice(0, 300) : '';
      break;
    }
    case 'items-for-sale':
    case 'items-for-rent': {
      const price = Number(f.price);
      if (Number.isNaN(price) || price < 0) errors.push('price is required and must be a positive number');
      out.price = price;
      break;
    }
    case 'lost-found': {
      if (!LOST_FOUND_OPTIONS.includes(f.lostOrFound)) errors.push('lostOrFound must be "lost" or "found"');
      out.lostOrFound = f.lostOrFound;
      break;
    }
    case 'real-estate': {
      if (f.price !== undefined && f.price !== null && f.price !== '') {
        const price = Number(f.price);
        if (Number.isNaN(price) || price < 0) errors.push('price must be a positive number');
        out.price = price;
      }
      break;
    }
    case 'free-giveaways':
    case 'wanted':
    case 'services':
    default:
      break;
  }
  return out;
}

const CATEGORIES_REQUIRING_DESCRIPTION = new Set([
  'items-for-sale', 'items-for-rent', 'free-giveaways', 'lost-found', 'wanted', 'services', 'real-estate',
]);
const CATEGORIES_REQUIRING_TAXONOMY = new Set(['job-offers', 'seeking-a-job', 'real-estate']);

function validateClassifiedPayload(body, charLimits) {
  const errors = [];
  const category = body.category;
  if (!CLASSIFIED_CATEGORY_KEYS.includes(category)) {
    throw new ValidationError([`category must be one of ${CLASSIFIED_CATEGORY_KEYS.join(', ')}`]);
  }

  const title = requireString(body.title, 'title', errors, { max: charLimits.title });
  let description = '';
  if (CATEGORIES_REQUIRING_DESCRIPTION.has(category)) {
    description = requireString(body.description, 'description', errors, { max: charLimits.description });
  } else if (body.description) {
    description = String(body.description).slice(0, charLimits.description);
  }

  const locationText = requireString(body.locationText, 'location', errors, { max: 200 });

  let taxonomyId = null;
  if (CATEGORIES_REQUIRING_TAXONOMY.has(category)) {
    taxonomyId = Number(body.taxonomyId);
    if (!taxonomyId) errors.push('a category selection is required');
  }

  const fields = validateCategoryFields(category, body.fields, errors);

  const posterEmail = requireString(body.posterEmail, 'email', errors);
  if (posterEmail && !isValidEmail(posterEmail)) errors.push('email address is invalid');

  let posterPhone = null;
  if (body.posterPhone) {
    const p = validatePhone(body.posterPhone, body.posterPhoneCountry || 'US');
    if (!p.valid) errors.push('phone number is invalid');
    else posterPhone = p.e164;
  }

  const contact = validateContact(body, errors);

  if (!body.pricingTierId && category !== 'lost-found') {
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
    else contact.url = body.contactUrl;
  }
  return contact;
}

function validateSimchaPayload(body, charLimits) {
  const errors = [];
  const title = requireString(body.title, 'title', errors, { max: charLimits.title });
  const description = body.description ? String(body.description).slice(0, charLimits.description) : '';
  const locationText = requireString(body.locationText, 'location', errors, { max: 200 });
  const taxonomyId = Number(body.taxonomyId);
  if (!taxonomyId) errors.push('a simcha category is required');
  const simchaDate = (body.fields && body.fields.simchaDate) || body.simchaDate || null;

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
    else contact.url = body.contactUrl;
  }

  let surpriseEmails = [];
  if (Array.isArray(body.surpriseEmails)) {
    surpriseEmails = body.surpriseEmails
      .filter((s) => s && s.email)
      .map((s) => {
        if (!isValidEmail(s.email)) errors.push(`surprise email address "${s.email}" is invalid`);
        return { email: String(s.email).toLowerCase(), senderDisplayName: String(s.senderDisplayName || '').slice(0, 80) };
      })
      .slice(0, 10);
  }

  if (errors.length) throw new ValidationError(errors);

  return {
    title,
    description,
    taxonomyId,
    locationText,
    locationCity: body.locationCity || null,
    locationState: body.locationState || null,
    locationLat: body.locationLat != null ? Number(body.locationLat) : null,
    locationLng: body.locationLng != null ? Number(body.locationLng) : null,
    locationPlaceId: body.locationPlaceId || null,
    fields: { simchaDate },
    posterFirstName: body.posterFirstName || null,
    posterLastName: body.posterLastName || null,
    posterEmail: posterEmail.toLowerCase(),
    posterPhone,
    contact,
    surpriseEmails,
  };
}

module.exports = { ValidationError, validateClassifiedPayload, validateSimchaPayload };
