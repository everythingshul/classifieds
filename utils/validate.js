// Simple, deliberately permissive checks - just confirming shape, not deliverability.
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const s = email.trim();
  const at = s.indexOf('@');
  if (at < 1 || at === s.length - 1) return false;
  const domain = s.slice(at + 1);
  if (!domain.includes('.')) return false;
  // Excludes quotes/angle brackets too - these are stored verbatim and
  // rendered into href="mailto:..." attributes later, so letting markup
  // delimiters through here would make that an injection point.
  return /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/.test(s);
}

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (/["'<>]/.test(url)) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.includes('.');
  } catch (e) {
    return false;
  }
}

function normalizeUrl(url) {
  if (!url) return null;
  // Round-trip through URL so the stored value is always the parser's own
  // percent-encoded form, not whatever raw text was submitted - this is
  // later rendered into an href="..." attribute, so this keeps markup
  // delimiters out of the stored value even if some render path forgets
  // to escape it.
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).toString();
  } catch (e) {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
}

module.exports = { isValidEmail, isValidUrl, normalizeUrl };
