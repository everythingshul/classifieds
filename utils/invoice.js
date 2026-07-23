const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { formatCents } = require('./money');
const { sendMail, notifyAdmin } = require('./mailer');
const runtimeConfig = require('../services/runtimeConfig');

async function createInvoicePdf(invoice) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const left = 56;
  const draw = (text, opts = {}) => {
    page.drawText(String(text), {
      x: opts.x ?? left,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= opts.gap ?? 16;
  };

  draw(runtimeConfig.get('site_name', 'SITE_NAME') || 'Everything Shul Classifieds', { size: 18, bold: true, gap: 26 });
  draw(`Invoice ${invoice.invoiceNumber}`, { size: 13, bold: true, gap: 18 });
  draw(`Date: ${invoice.issuedAt.toDateString()}`, { gap: 22 });

  draw('Bill To', { bold: true, gap: 15 });
  draw(`${invoice.poster.firstName || ''} ${invoice.poster.lastName || ''}`.trim() || '(no name provided)', { gap: 14 });
  draw(invoice.poster.email, { gap: 14 });
  if (invoice.poster.phone) draw(invoice.poster.phone, { gap: 14 });
  y -= 8;

  draw('Post Details', { bold: true, gap: 15 });
  draw(`Type: ${invoice.post.type === 'simcha' ? 'Simcha' : 'Classified'}`, { gap: 14 });
  draw(`Category: ${invoice.post.categoryLabel}`, { gap: 14 });
  draw(`Title: ${invoice.post.title}`, { gap: 14 });
  if (invoice.post.location) draw(`Location: ${invoice.post.location}`, { gap: 14 });
  draw(`Post ID: ${invoice.post.publicId}`, { gap: 14 });
  draw(`Live from: ${invoice.post.publishedAtText || 'upon approval'}`, { gap: 14 });
  draw(`Expires: ${invoice.post.expiresAtText || 'n/a'}`, { gap: 14 });
  y -= 8;

  draw('Charges', { bold: true, gap: 15 });
  invoice.lineItems.forEach((item) => {
    draw(item.label, { size: 11 });
    page.drawText(formatCents(item.amount_cents), { x: 480, y: y + 16, size: 11, font });
  });
  y -= 6;
  draw(`Total: ${formatCents(invoice.totalCents)}`, { bold: true, size: 13, gap: 20 });

  y -= 10;
  draw('This listing will automatically expire on the date above unless renewed.', { size: 9, gap: 12 });
  draw('All sales, listings and payments are subject to our Terms & Conditions and Refund Policy.', { size: 9, gap: 12 });

  return Buffer.from(await doc.save());
}

function invoiceHtml(invoice) {
  const rows = invoice.lineItems
    .map((i) => `<tr><td style="padding:4px 8px">${i.label}</td><td style="padding:4px 8px;text-align:right">${formatCents(i.amount_cents)}</td></tr>`)
    .join('');
  return `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#222">
    <h2 style="color:#1f3b57">Invoice ${invoice.invoiceNumber}</h2>
    <p>Thank you for your posting${invoice.poster.firstName ? `, ${invoice.poster.firstName}` : ''}.</p>
    <h3>Post Details</h3>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:4px 8px;color:#666">Type</td><td style="padding:4px 8px">${invoice.post.type === 'simcha' ? 'Simcha' : 'Classified'}</td></tr>
      <tr><td style="padding:4px 8px;color:#666">Category</td><td style="padding:4px 8px">${invoice.post.categoryLabel}</td></tr>
      <tr><td style="padding:4px 8px;color:#666">Title</td><td style="padding:4px 8px">${invoice.post.title}</td></tr>
      ${invoice.post.location ? `<tr><td style="padding:4px 8px;color:#666">Location</td><td style="padding:4px 8px">${invoice.post.location}</td></tr>` : ''}
      <tr><td style="padding:4px 8px;color:#666">Post ID</td><td style="padding:4px 8px">${invoice.post.publicId}</td></tr>
      <tr><td style="padding:4px 8px;color:#666">Link</td><td style="padding:4px 8px"><a href="${invoice.post.url}">${invoice.post.url}</a></td></tr>
      <tr><td style="padding:4px 8px;color:#666">Live from</td><td style="padding:4px 8px">${invoice.post.publishedAtText || 'upon approval'}</td></tr>
      <tr><td style="padding:4px 8px;color:#666"><b>Expires</b></td><td style="padding:4px 8px"><b>${invoice.post.expiresAtText || 'n/a'}</b></td></tr>
    </table>
    <h3>Charges</h3>
    <table style="width:100%;border-collapse:collapse">${rows}
      <tr><td style="padding:8px;font-weight:bold;border-top:1px solid #ccc">Total</td><td style="padding:8px;font-weight:bold;text-align:right;border-top:1px solid #ccc">${formatCents(invoice.totalCents)}</td></tr>
    </table>
    <p style="font-size:12px;color:#777;margin-top:24px">This listing will automatically expire on the date above unless renewed. All sales, listings and payments are subject to our Terms &amp; Conditions and Refund Policy.</p>
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
