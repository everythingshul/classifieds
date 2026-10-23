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
// Fully inline-styled (not CSS-animation-driven) so it's guaranteed to show
// regardless of any CSS issue - same approach the other Everything Shul
// dashboards use for this.
function toast(msg, type = 'ok') {
  const c = document.getElementById('toast-wrap');
  if (!c) return;
  const el = document.createElement('div');
  const bg = type === 'err' ? '#c9432e' : type === 'warn' ? '#b3823a' : '#1e8a63';
  el.setAttribute('style', `
    background:${bg};color:#fff;padding:11px 16px;border-radius:8px;font-size:13px;
    font-family:Inter,Arial,sans-serif;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,.22);
    max-width:340px;word-break:break-word;line-height:1.4;position:relative;right:-320px;opacity:0;
    transition:right .25s ease, opacity .25s ease;
  `);
  el.textContent = msg;
  c.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.right = '0'; el.style.opacity = '1'; }));
  const dur = type === 'err' ? 6000 : 3200;
  setTimeout(() => {
    el.style.right = '-320px';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, dur);
}

// Shared popup used across the admin portal (post editor, confirmations,
// etc.) instead of each page building its own inline edit panel.
const Modal = {
  open(title, bodyHtml, opts = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-box').className = 'modal-box'
      + (opts.lg ? ' lg' : '') + (opts.sm ? ' sm' : '') + (opts.tall ? ' tall' : '');
    document.getElementById('modal-overlay').style.display = 'flex';
    if (opts.onOpen) setTimeout(opts.onOpen, 0);
  },
  close() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('modal-body').innerHTML = '';
  },
  setBody(html) { document.getElementById('modal-body').innerHTML = html; },
};

// Wires up a bold/italic/underline/list toolbar sitting directly before a
// contenteditable `.rich-editor` div - shared by the editorial instructions
// editor (Settings) and the editorial body editor (Editorials editor/create).
function wireRichToolbars(root = document) {
  root.querySelectorAll('.rich-toolbar').forEach((toolbar) => {
    const editor = toolbar.nextElementSibling;
    if (!editor || !editor.classList.contains('rich-editor')) return;
    toolbar.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        editor.focus();
        document.execCommand(btn.dataset.cmd, false, null);
      });
    });
  });
}
