// Simple, deliberately permissive checks - just confirming shape, not deliverability.
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const s = email.trim();
  const at = s.indexOf('@');
  if (at < 1 || at === s.length - 1) return false;
  const domain = s.slice(at + 1);
  if (!domain.includes('.')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.includes('.');
  } catch (e) {
    return false;
  }
}

function normalizeUrl(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

module.exports = { isValidEmail, isValidUrl, normalizeUrl };
