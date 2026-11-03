// Shared branded wrapper for every outgoing email except the invoice (which
// already has its own full billing-document layout, see utils/invoice.js).
// Deliberately built to look like an extension of the actual site rather
// than a generic templated email: same cream background, same sharp-cornered
// white card with a 1px border, same navy/gold/teal, same sans-serif - no
// gradients, no rounded pills, no stock-photo hero, no "Hi there! 👋"
// marketing voice. Table-based markup with inline styles throughout, same
// approach the invoice email already uses, since that's what renders
// reliably across email clients.

const runtimeConfig = require('./runtimeConfig');
const { appUrl } = require('./appUrl');

const siteName = () => runtimeConfig.get('site_name', 'SITE_NAME') || 'JListings';
const logoUrl = () => `${appUrl()}/img/logo.png`;

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// bodyHtml/footerNote are trusted, pre-built HTML (caller already escaped
// any user-provided text going into them) - same assumption every other
// email builder in this codebase makes.
function emailShell({ eyebrow, heading, bodyHtml, ctaText, ctaUrl, footerNote }) {
  const site = appUrl();
  return `
  <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#faf8f4">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4">
      <tr><td style="height:4px;line-height:4px;font-size:0;background:#b08d3f">&nbsp;</td></tr>
      <tr><td style="padding:26px 32px 18px">
        <img src="${logoUrl()}" alt="${escapeHtml(siteName())}" height="32" style="display:block;height:32px;width:auto;border:0">
      </td></tr>
      <tr><td style="padding:0 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e1d8">
          <tr><td style="padding:30px 30px 26px">
            ${eyebrow ? `<div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#b08d3f;margin-bottom:10px;text-transform:uppercase">${escapeHtml(eyebrow)}</div>` : ''}
            <h1 style="margin:0 0 15px;font-size:21px;line-height:1.3;color:#1f3b57;font-weight:800">${heading}</h1>
            <div style="font-size:14.5px;color:#232323;line-height:1.65">${bodyHtml}</div>
            ${ctaText && ctaUrl ? `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px">
                <tr><td style="background:#2f6b63">
                  <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:13.5px;font-weight:700;text-decoration:none">${escapeHtml(ctaText)}</a>
                </td></tr>
              </table>` : ''}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 32px 30px;text-align:center">
        <span style="font-size:11.5px;color:#62666b;line-height:1.6">${footerNote || `${escapeHtml(siteName())} &middot; <a href="${site}" style="color:#62666b">${site.replace(/^https?:\/\//, '')}</a>`}</span>
      </td></tr>
    </table>
  </div>`;
}

module.exports = { emailShell, escapeHtml, appUrl, siteName };
