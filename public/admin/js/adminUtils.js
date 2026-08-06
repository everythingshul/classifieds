function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatDate(ms) { return ms ? new Date(ms).toLocaleDateString() : ''; }
function formatCents(cents) {
  const n = Number(cents || 0);
  return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`;
}
// Mirrors the server's parseAmountOrText (services/postValidation.js) - a
// price/pay field entered as a numeric amount, free text, or left blank.
function parseAmountOrText(raw) {
  if (raw === undefined || raw === null) return { amount: null, text: null };
  const str = String(raw).trim();
  if (!str) return { amount: null, text: null };
  const num = Number(str);
  return Number.isFinite(num) ? { amount: num, text: null } : { amount: null, text: str };
}
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
