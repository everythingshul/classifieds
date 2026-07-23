const { parsePhoneNumberFromString } = require('libphonenumber-js');

// Validates a phone number against the real digit-count/format rules for its
// country code, ignoring dashes, dots, parens and spaces (libphonenumber-js
// already strips those). defaultCountry is used only when the number has no
// explicit "+countrycode" prefix.
function validatePhone(raw, defaultCountry = 'US') {
  if (!raw || typeof raw !== 'string') return { valid: false };
  const cleaned = raw.trim();
  if (!cleaned) return { valid: false };
  let parsed;
  try {
    parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  } catch (e) {
    return { valid: false };
  }
  if (!parsed || !parsed.isValid()) return { valid: false };
  return {
    valid: true,
    e164: parsed.number,
    national: parsed.formatNational(),
    international: parsed.formatInternational(),
    country: parsed.country,
    tel: `tel:${parsed.number}`,
  };
}

function validateExtension(ext) {
  if (!ext) return { valid: true, ext: '' };
  const digits = String(ext).replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 8) return { valid: false };
  return { valid: true, ext: digits };
}

module.exports = { validatePhone, validateExtension };
