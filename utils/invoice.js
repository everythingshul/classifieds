const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { formatCents } = require('./money');
const { sendMail, notifyAdmin } = require('./mailer');
const runtimeConfig = require('../services/runtimeConfig');

const NAVY = rgb(0.1216, 0.2314, 0.3412); // #1f3b57
const NAVY_DARK = rgb(0.0784, 0.1569, 0.2196); // #142838
const GOLD = rgb(0.6902, 0.5529, 0.2471); // #b08d3f
const INK = rgb(0.137, 0.137, 0.137); // #232323
const INK_SOFT = rgb(0.384, 0.4, 0.42); // #62666b
const BORDER = rgb(0.894, 0.882, 0.847); // #e4e1d8
const PAPER = rgb(0.98, 0.973, 0.957); // #faf8f4

function typeLabel(type) {
  if (type === 'simcha') return 'Simcha';
  if (type === 'listing') return 'Listing';
  return 'Classified';
}

function appUrl() {
  return runtimeConfig.get('app_url', 'APP_URL') || '';
}

// Reads the site's own logo straight off disk (whatever the admin has
// uploaded to public/img/logo.png) so the invoice PDF/email always match
// whatever's live, with no separate asset to keep in sync. Returns null if
// no logo has been uploaded - callers fall back to text-only.
function readLogoFile() {
  try {
    const logoPath = path.join(__dirname, '..', 'public', 'img', 'logo.png');
    return fs.readFileSync(logoPath);
  } catch (e) {
    return null;
  }
}

async function createInvoicePdf(invoice) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const siteName = runtimeConfig.get('site_name', 'SITE_NAME') || 'JListings';

  const margin = 50;
  const headerHeight = 96;

  // Header band
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: headerHeight, color: NAVY_DARK });

  let logoDrawn = false;
  const logoBytes = readLogoFile();
  if (logoBytes) {
    try {
      const logoImage = await doc.embedPng(logoBytes);
      const maxLogoHeight = 46;
      const scale = maxLogoHeight / logoImage.height;
      const logoW = logoImage.width * scale;
      const logoH = logoImage.height * scale;
      // White plate behind the logo, matching the site's own header
      // treatment, since the logo's own colors may not read against navy.
      const plateW = logoW + 24;
      const plateH = logoH + 14;
      page.drawRectangle({
        x: margin, y: height - margin - plateH + 10, width: plateW, height: plateH, color: rgb(1, 1, 1),
      });
      page.drawImage(logoImage, {
        x: margin + 12, y: height - margin - plateH + 10 + (plateH - logoH) / 2, width: logoW, height: logoH,
      });
      logoDrawn = true;
    } catch (e) {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) {
    page.drawText(siteName, { x: margin, y: height - margin - 8, size: 20, font: bold, color: rgb(1, 1, 1) });
  }

  page.drawText('INVOICE', { x: width - margin - 110, y: height - margin + 4, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(invoice.invoiceNumber, { x: width - margin - 110, y: height - margin - 14, size: 10, font, color: rgb(0.85, 0.87, 0.9) });
  page.drawText(invoice.issuedAt.toDateString(), { x: width - margin - 110, y: height - margin - 28, size: 10, font, color: rgb(0.85, 0.87, 0.9) });

  let y = height - headerHeight - 40;
  const colLeft = margin;
  const colRight = width / 2 + 10;

  function sectionLabel(text, x, atY) {
    page.drawText(text.toUpperCase(), { x, y: atY, size: 9, font: bold, color: GOLD });
    return atY - 16;
  }
  function line(text, x, atY, opts = {}) {
    page.drawText(String(text), { x, y: atY, size: opts.size ?? 10.5, font: opts.bold ? bold : font, color: opts.color ?? INK });
    return atY - (opts.gap ?? 15);
  }

  // Two-column: Bill To / Post Details
  let leftY = sectionLabel('Bill To', colLeft, y);
  leftY = line(`${invoice.poster.firstName || ''} ${invoice.poster.lastName || ''}`.trim() || '(no name provided)', colLeft, leftY);
  leftY = line(invoice.poster.email, colLeft, leftY);
  if (invoice.poster.phone) leftY = line(invoice.poster.phone, colLeft, leftY);

  let rightY = sectionLabel('Post', colRight, y);
  rightY = line(invoice.post.title, colRight, rightY, { bold: true });
  rightY = line(`${typeLabel(invoice.post.type)} - ${invoice.post.categoryLabel}`, colRight, rightY, { color: INK_SOFT, size: 9.5 });
  if (invoice.post.location) rightY = line(invoice.post.location, colRight, rightY, { color: INK_SOFT, size: 9.5 });
  rightY = line(`ID: ${invoice.post.publicId}`, colRight, rightY, { color: INK_SOFT, size: 9.5 });

  y = Math.min(leftY, rightY) - 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.75, color: BORDER });
  y -= 20;

  y = sectionLabel('Listing Window', colLeft, y);
  page.drawText('Live from', { x: colLeft, y, size: 9.5, font, color: INK_SOFT });
  page.drawText(invoice.post.publishedAtText || 'upon approval', { x: colLeft + 70, y, size: 9.5, font: bold, color: INK });
  page.drawText('Expires', { x: colRight, y, size: 9.5, font, color: INK_SOFT });
  page.drawText(invoice.post.expiresAtText || 'n/a', { x: colRight + 55, y, size: 9.5, font: bold, color: INK });
  y -= 28;

  // Charges table
  const tableTop = y;
  const tableRight = width - margin;
  page.drawRectangle({ x: margin, y: tableTop - 22, width: tableRight - margin, height: 22, color: NAVY });
  page.drawText('DESCRIPTION', { x: margin + 10, y: tableTop - 15, size: 9, font: bold, color: rgb(1, 1, 1) });
  page.drawText('AMOUNT', { x: tableRight - 70, y: tableTop - 15, size: 9, font: bold, color: rgb(1, 1, 1) });
  y = tableTop - 22;

  invoice.lineItems.forEach((item, i) => {
    const rowH = 24;
    if (i % 2 === 1) page.drawRectangle({ x: margin, y: y - rowH, width: tableRight - margin, height: rowH, color: PAPER });
    page.drawText(item.label, { x: margin + 10, y: y - 16, size: 10, font, color: INK });
    page.drawText(formatCents(item.amount_cents), { x: tableRight - 70, y: y - 16, size: 10, font, color: INK });
    y -= rowH;
  });

  page.drawRectangle({ x: margin, y: y - 28, width: tableRight - margin, height: 28, color: NAVY_DARK });
  page.drawText('TOTAL', { x: margin + 10, y: y - 18, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText(formatCents(invoice.totalCents), { x: tableRight - 75, y: y - 18, size: 13, font: bold, color: GOLD });
  y -= 50;

  page.drawText('This listing will automatically expire on the date above unless renewed.', { x: margin, y, size: 8.5, font: italic, color: INK_SOFT });
  y -= 12;
  page.drawText('All sales, listings and payments are subject to our Terms & Conditions and Refund Policy.', { x: margin, y, size: 8.5, font: italic, color: INK_SOFT });

  // Footer rule + site link
  page.drawLine({ start: { x: margin, y: 50 }, end: { x: width - margin, y: 50 }, thickness: 0.75, color: BORDER });
  const site = appUrl() || siteName;
  page.drawText(site.replace(/^https?:\/\//, ''), { x: margin, y: 34, size: 9, font: bold, color: NAVY });

  return Buffer.from(await doc.save());
}

function invoiceHtml(invoice) {
  const site = appUrl();
  const siteName = runtimeConfig.get('site_name', 'SITE_NAME') || 'JListings';
  const logoUrl = site ? `${site}/img/logo.png` : '/img/logo.png';

  const rows = invoice.lineItems
    .map((i, idx) => `
      <tr style="background:${idx % 2 === 1 ? '#faf8f4' : '#ffffff'}">
        <td style="padding:10px 14px;font-size:14px;color:#232323;border-bottom:1px solid #e4e1d8">${i.label}</td>
        <td style="padding:10px 14px;font-size:14px;color:#232323;text-align:right;border-bottom:1px solid #e4e1d8">${formatCents(i.amount_cents)}</td>
      </tr>`)
    .join('');

  const detailRow = (label, value, bold) => value ? `
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#62666b;width:110px;vertical-align:top">${label}</td>
        <td style="padding:6px 0;font-size:13px;color:#232323;${bold ? 'font-weight:700' : ''}">${value}</td>
      </tr>` : '';

  return `
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f2f0eb;padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e1d8">
      <tr>
        <td style="background:#142838;padding:22px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle">
                <div style="background:#ffffff;display:inline-block;padding:8px 14px">
                  <img src="${logoUrl}" alt="${siteName}" height="34" style="display:block;height:34px" onerror="this.style.display='none'">
                </div>
              </td>
              <td style="text-align:right;vertical-align:middle">
                <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.04em">INVOICE</div>
                <div style="color:#c7cedb;font-size:12px;margin-top:2px">${invoice.invoiceNumber}</div>
                <div style="color:#c7cedb;font-size:12px">${invoice.issuedAt.toDateString()}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 28px 6px">
          <p style="margin:0 0 20px;font-size:15px;color:#232323">Thank you for your posting${invoice.poster.firstName ? `, ${invoice.poster.firstName}` : ''}! Here's your receipt.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:50%;vertical-align:top;padding-right:16px">
                <div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#b08d3f;margin-bottom:8px">BILL TO</div>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  ${detailRow('Name', `${invoice.poster.firstName || ''} ${invoice.poster.lastName || ''}`.trim() || '(none provided)')}
                  ${detailRow('Email', invoice.poster.email)}
                  ${detailRow('Phone', invoice.poster.phone)}
                </table>
              </td>
              <td style="width:50%;vertical-align:top">
                <div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#b08d3f;margin-bottom:8px">POST</div>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  ${detailRow('Title', invoice.post.title, true)}
                  ${detailRow('Category', `${typeLabel(invoice.post.type)} - ${invoice.post.categoryLabel}`)}
                  ${detailRow('Location', invoice.post.location)}
                  ${detailRow('Post ID', invoice.post.publicId)}
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-top:1px solid #e4e1d8;padding-top:14px">
            <tr>
              ${detailRow('Live from', invoice.post.publishedAtText || 'upon approval')}
              ${detailRow('Expires', invoice.post.expiresAtText || 'n/a', true)}
            </tr>
          </table>
          <p style="margin:18px 0 0"><a href="${invoice.post.url}" style="color:#2f6b63;font-size:13px;font-weight:700;text-decoration:none">View your post &rarr;</a></p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#b08d3f;margin-bottom:8px">CHARGES</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e1d8">
            <tr style="background:#1f3b57">
              <td style="padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:.04em;color:#ffffff">DESCRIPTION</td>
              <td style="padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:.04em;color:#ffffff;text-align:right">AMOUNT</td>
            </tr>
            ${rows}
            <tr style="background:#142838">
              <td style="padding:12px 14px;font-size:13px;font-weight:700;color:#ffffff">TOTAL</td>
              <td style="padding:12px 14px;font-size:15px;font-weight:700;color:#e8dcc0;text-align:right">${formatCents(invoice.totalCents)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 26px">
          <p style="font-size:11.5px;color:#62666b;line-height:1.6;margin:0">This listing will automatically expire on the date above unless renewed. All sales, listings and payments are subject to our <a href="${site}/terms" style="color:#2f6b63">Terms &amp; Conditions</a> and <a href="${site}/refund-policy" style="color:#2f6b63">Refund Policy</a>.</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f2f0eb;padding:14px 28px;text-align:center;border-top:1px solid #e4e1d8">
          <span style="font-size:11px;color:#62666b">A PDF copy of this invoice is attached. Questions? <a href="${site}/contact" style="color:#2f6b63">Contact us</a>.</span>
        </td>
      </tr>
    </table>
  </div>`;
}

async function sendInvoiceEmail(invoice) {
  const pdf = await createInvoicePdf(invoice);
  await sendMail({
    to: invoice.poster.email,
    subject: `Invoice ${invoice.invoiceNumber} - ${invoice.post.title}`,
    html: invoiceHtml(invoice),
    attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf }],
  });
  return pdf;
}

async function notifyAdminNewPost(post, reason) {
  const url = `${runtimeConfig.get('app_url', 'APP_URL') || ''}/admin/#/posts/${post.public_id}`;
  await notifyAdmin(
    `Post needs attention: ${post.title}`,
    `<p><b>Reason:</b> ${reason}</p><p><b>Post:</b> ${post.title} (${post.category})</p><p><b>Poster:</b> ${post.poster_email}</p><p><a href="${url}">Review in admin portal</a></p>`
  );
}

module.exports = { createInvoicePdf, sendInvoiceEmail, notifyAdminNewPost, invoiceHtml };
