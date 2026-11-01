// Shared branded wrapper for every outgoing email except the invoice (which
// already has its own full billing-document layout, see utils/invoice.js) -
// a navy header with the site logo, a white content card, and a consistent
// footer, so every email - poster-facing or admin-facing - looks like it's
// actually from the site instead of a bare paragraph of text. Table-based
// markup with inline styles throughout, same approach the invoice email
// already uses, since that's what renders reliably across email clients.

const runtimeConfig = require('./runtimeConfig');

const appUrl = () => (runtimeConfig.get('app_url', 'APP_URL') || 'https://jlistings.com').replace(/\/$/, '');
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
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f2f0eb;padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e1d8">
      <tr>
        <td style="background:#142838;padding:20px 28px">
          <div style="background:#ffffff;display:inline-block;padding:7px 13px">
            <img src="${logoUrl()}" alt="${escapeHtml(siteName())}" height="28" style="display:block;height:28px" onerror="this.style.display='none'">
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 28px 8px">
          ${eyebrow ? `<div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#b08d3f;margin-bottom:8px">${escapeHtml(eyebrow).toUpperCase()}</div>` : ''}
          <h1 style="margin:0 0 16px;font-size:20px;color:#142838;font-family:Georgia,serif">${heading}</h1>
          <div style="font-size:14px;color:#232323;line-height:1.65">${bodyHtml}</div>
          ${ctaText && ctaUrl ? `
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px">
              <tr><td style="background:#2f6b63">
                <a href="${ctaUrl}" style="display:inline-block;padding:11px 22px;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">${escapeHtml(ctaText)}</a>
              </td></tr>
            </table>` : ''}
        </td>
      </tr>
      <tr>
        <td style="background:#f2f0eb;padding:16px 28px;text-align:center;border-top:1px solid #e4e1d8">
          <span style="font-size:11px;color:#62666b">${footerNote || `${escapeHtml(siteName())} &middot; <a href="${site}" style="color:#62666b">${site.replace(/^https?:\/\//, '')}</a>`}</span>
        </td>
      </tr>
    </table>
  </div>`;
}

module.exports = { emailShell, escapeHtml, appUrl, siteName };
