const { getCountries, getCountryCallingCode } = require('libphonenumber-js');

let cached = null;
function getCountryList() {
  if (cached) return cached;
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  cached = getCountries()
    .map((code) => ({ code, name: dn.of(code) || code, dial: getCountryCallingCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cached;
}

module.exports = { getCountryList };
