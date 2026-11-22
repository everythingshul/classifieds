// Excel exports for everything in the admin. Each sheet is one dataset; the
// route can send one sheet or all of them as a single multi-tab workbook.
// Secrets (Stripe/SMTP/API keys, password hashes) and admin accounts are never
// exported. Money columns are dollars (or pounds, see the Currency column).
const db = require('../db');
const { buildXlsx } = require('./xlsx');

const all = (sql, ...p) => db.prepare(sql).all(...p);
const $ = (c) => (c == null ? null : Number(c) / 100);
const yn = (v) => (v ? 'Yes' : 'No');
const json = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
const list = (s) => (json(s, []) || []).join('; ');

// Optional date range on a ms-timestamp column (from/to are YYYY-MM-DD).
function range(col, from, to) {
  const w = []; const p = [];
  if (/^\d{4}-\d\d-\d\d$/.test(from || '')) { w.push(`${col} >= ?`); p.push(Date.parse(`${from}T00:00:00`)); }
  if (/^\d{4}-\d\d-\d\d$/.test(to || '')) { w.push(`${col} < ?`); p.push(Date.parse(`${to}T00:00:00`) + 86400000); }
  return { sql: w.length ? ` WHERE ${w.join(' AND ')}` : '', p };
}

const SHEETS = {
  posts: { label: 'Posts (classifieds, listings, simchas)', build: (f, t) => {
    const r = range('p.created_at', f, t);
    const rows = all(`SELECT p.*, l.name loc_name, (SELECT COUNT(*) FROM post_images i WHERE i.post_id = p.id) img FROM posts p LEFT JOIN locations l ON l.id = p.location_id${r.sql} ORDER BY p.id`, ...r.p);
    return { name: 'Posts', cols: [{ h: 'ID' }, { h: 'Type' }, { h: 'Category' }, { h: 'Status' }, { h: 'Title' }, { h: 'Description' }, { h: 'Price', t: 'num' }, { h: 'Price text' }, { h: 'Job type' }, { h: 'Pay' }, { h: 'Location (typed)' }, { h: 'Location group' }, { h: 'City' }, { h: 'State' }, { h: 'Contact phone' }, { h: 'Contact email' }, { h: 'Contact website' }, { h: 'Poster' }, { h: 'Poster email' }, { h: 'Poster phone' }, { h: 'Featured' }, { h: 'Oversized' }, { h: 'Saved forever' }, { h: 'Photos', t: 'int' }, { h: 'Views', t: 'int' }, { h: 'Clicks', t: 'int' }, { h: 'Paid', t: 'money' }, { h: 'Created', t: 'datetime' }, { h: 'Published', t: 'datetime' }, { h: 'Expires', t: 'datetime' }, { h: 'Admin notes' }],
      rows: rows.map((p) => { const fl = json(p.fields, {}) || {}; return [p.public_id, p.type, p.category, p.status, p.title, p.description, fl.price, fl.priceText, fl.jobType, fl.payAmount != null ? `${fl.payAmount}${fl.payPeriod ? ' / ' + fl.payPeriod : ''}` : fl.payAmountText, p.location_text, p.loc_name, p.location_city, p.location_state, p.contact_phone, p.contact_email, p.contact_url, [p.poster_first_name, p.poster_last_name].filter(Boolean).join(' '), p.poster_email, p.poster_phone, yn(p.is_featured_strike), yn(p.is_oversized), yn(p.saved_forever), p.img, p.view_count, p.click_count, $(p.price_cents_paid), p.created_at, p.published_at, p.expires_at, p.admin_notes]; }) };
  } },
  payments: { label: 'Payments', build: (f, t) => {
    const r = range('pp.created_at', f, t);
    return { name: 'Payments', cols: [{ h: 'Date', t: 'datetime' }, { h: 'Invoice' }, { h: 'Post' }, { h: 'Post ID' }, { h: 'Kind' }, { h: 'Status' }, { h: 'Currency' }, { h: 'Amount', t: 'money' }, { h: 'Refunded', t: 'money' }, { h: 'Net', t: 'money' }, { h: 'Payer email' }, { h: 'Stripe payment' }],
      rows: all(`SELECT pp.*, p.title, p.public_id pid FROM post_payments pp LEFT JOIN posts p ON p.id = pp.post_id${r.sql} ORDER BY pp.id`, ...r.p).map((x) => [x.created_at, x.invoice_number, x.title, x.pid, x.kind, x.status, String(x.currency || 'usd').toUpperCase(), $(x.amount_cents), $(x.refunded_cents), x.status === 'paid' ? $(x.amount_cents - x.refunded_cents) : 0, x.payer_email, x.stripe_payment_intent]) };
  } },
  editorials: { label: 'Editorials', build: (f, t) => {
    const r = range('created_at', f, t);
    return { name: 'Editorials', cols: [{ h: 'ID' }, { h: 'Title' }, { h: 'Pen name' }, { h: 'Author' }, { h: 'Email' }, { h: 'Phone' }, { h: 'Status' }, { h: 'Featured' }, { h: 'Views', t: 'int' }, { h: 'Clicks', t: 'int' }, { h: 'Likes', t: 'int' }, { h: 'Notes from author' }, { h: 'Admin notes' }, { h: 'Rejection reason' }, { h: 'Created', t: 'datetime' }, { h: 'Published', t: 'datetime' }, { h: 'Text' }],
      rows: all(`SELECT * FROM editorials${r.sql} ORDER BY id`, ...r.p).map((e) => [e.public_id, e.title, e.pen_name, `${e.poster_first_name} ${e.poster_last_name}`, e.poster_email, e.poster_phone, e.status, yn(e.is_featured), e.view_count, e.click_count, e.like_count, e.notes_to_admin, e.admin_notes, e.rejection_reason, e.created_at, e.published_at, String(e.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()]) };
  } },
  editorial_comments: { label: 'Editorial comments', build: (f, t) => {
    const r = range('c.created_at', f, t);
    return { name: 'Editorial comments', cols: [{ h: 'Date', t: 'datetime' }, { h: 'Editorial' }, { h: 'Pen name' }, { h: 'Email' }, { h: 'Status' }, { h: 'Comment' }],
      rows: all(`SELECT c.*, e.title FROM editorial_comments c LEFT JOIN editorials e ON e.id = c.editorial_id${r.sql} ORDER BY c.id`, ...r.p).map((c) => [c.created_at, c.title, c.pen_name, c.email, c.status, c.body]) };
  } },
  subscribers: { label: 'Email subscribers', build: (f, t) => {
    const r = range('s.created_at', f, t);
    return { name: 'Subscribers', cols: [{ h: 'Email' }, { h: 'Status' }, { h: 'Topics' }, { h: 'Send hour', t: 'int' }, { h: 'Joined', t: 'datetime' }, { h: 'Confirmed', t: 'datetime' }, { h: 'Last sent', t: 'datetime' }, { h: 'Emails sent', t: 'int' }, { h: 'Opened', t: 'int' }, { h: 'Clicked', t: 'int' }],
      rows: all(`SELECT s.*, (SELECT COUNT(*) FROM email_sends e WHERE e.subscription_id = s.id) sent, (SELECT COUNT(*) FROM email_sends e WHERE e.subscription_id = s.id AND e.open_count > 0) opened, (SELECT COUNT(*) FROM email_sends e WHERE e.subscription_id = s.id AND e.click_count > 0) clicked FROM email_subscriptions s${r.sql} ORDER BY s.id`, ...r.p).map((s) => [s.email, s.status, list(s.categories), s.send_hour, s.created_at, s.confirmed_at, s.last_sent_at, s.sent, s.opened, s.clicked]) };
  } },
  contact_messages: { label: 'Contact messages', build: (f, t) => {
    const r = range('created_at', f, t);
    return { name: 'Messages', cols: [{ h: 'Date', t: 'datetime' }, { h: 'Name' }, { h: 'Email' }, { h: 'Subject' }, { h: 'Message' }, { h: 'Archived' }, { h: 'Our reply' }, { h: 'Replied', t: 'datetime' }],
      rows: all(`SELECT * FROM contact_messages${r.sql} ORDER BY id`, ...r.p).map((m) => [m.created_at, m.name, m.email, m.subject, m.message, yn(m.archived), m.reply_text, m.replied_at]) };
  } },
  chats: { label: 'Chat conversations (with a person)', build: (f, t) => {
    const r = range('m.created_at', f, t);
    return { name: 'Chat messages', cols: [{ h: 'Date', t: 'datetime' }, { h: 'Conversation' }, { h: 'Name' }, { h: 'Email' }, { h: 'Status' }, { h: 'From' }, { h: 'Message' }, { h: 'Voice note' }],
      rows: all(`SELECT m.*, c.name, c.email, c.status FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id${r.sql} ORDER BY m.id`, ...r.p).map((m) => [m.created_at, m.conversation_id, m.name, m.email, m.status, m.from_role, m.text, m.voice_url ? 'Yes' : '']) };
  } },
  chesky_unanswered: { label: 'Questions Chesky could not answer', build: () => ({ name: 'Chesky misses', cols: [{ h: 'Question' }, { h: 'Missed', t: 'int' }, { h: 'Thumbs down', t: 'int' }, { h: 'First asked', t: 'datetime' }, { h: 'Last asked', t: 'datetime' }],
    rows: all('SELECT * FROM chat_unanswered ORDER BY miss_count + down_count DESC').map((u) => [u.question, u.miss_count, u.down_count, u.first_at, u.last_at]) }) },
  reports: { label: 'Reported posts', build: (f, t) => {
    const r = range('r.created_at', f, t);
    return { name: 'Reports', cols: [{ h: 'Date', t: 'datetime' }, { h: 'Post' }, { h: 'Post ID' }, { h: 'Post status' }, { h: 'Reason' }, { h: 'Reported by' }],
      rows: all(`SELECT r.*, p.title, p.public_id pid, p.status pstatus FROM reports r LEFT JOIN posts p ON p.id = r.post_id${r.sql} ORDER BY r.id`, ...r.p).map((x) => [x.created_at, x.title, x.pid, x.pstatus, x.reason, x.reporter_email]) };
  } },
  banners: { label: 'Banners (with views and clicks)', build: () => ({ name: 'Banners', cols: [{ h: 'ID' }, { h: 'Link' }, { h: 'Position' }, { h: 'Pages' }, { h: 'Active' }, { h: 'Views', t: 'int' }, { h: 'Clicks', t: 'int' }, { h: 'Created', t: 'datetime' }],
    rows: all("SELECT b.*, (SELECT COUNT(*) FROM analytics_events e WHERE e.banner_id = b.id AND e.type = 'banner_view') v, (SELECT COUNT(*) FROM analytics_events e WHERE e.banner_id = b.id AND e.type = 'banner_click') c FROM banners b ORDER BY b.id").map((b) => [b.public_id, b.link_url, b.position, b.all_pages ? 'All pages' : list(b.pages), yn(b.active), b.v, b.c, b.created_at]) }) },
  locations: { label: 'Locations (and live post counts)', build: () => ({ name: 'Locations', cols: [{ h: 'Location' }, { h: 'State' }, { h: 'Latitude', t: 'num' }, { h: 'Longitude', t: 'num' }, { h: 'Also known as' }, { h: 'Active' }, { h: 'Live posts', t: 'int' }],
    rows: all("SELECT l.*, (SELECT COUNT(*) FROM posts p WHERE p.location_id = l.id AND p.status = 'live') n FROM locations l ORDER BY l.name").map((l) => [l.name, l.state, l.lat, l.lng, list(l.aliases), yn(l.active), l.n]) }) },
  pricing: { label: 'Pricing (plans and add-ons)', build: () => ({ name: 'Pricing', cols: [{ h: 'Kind' }, { h: 'Type' }, { h: 'Category' }, { h: 'Name' }, { h: 'Days', t: 'int' }, { h: 'Price USD', t: 'money' }, { h: 'Price GBP', t: 'money' }, { h: 'Active' }],
    rows: [...all('SELECT * FROM pricing_tiers ORDER BY post_type, sort_order').map((p) => ['Plan', p.post_type, p.category, p.name, p.duration_days, $(p.price_cents), $(p.price_cents_gbp), yn(p.active)]), ...all('SELECT * FROM addon_pricing ORDER BY key').map((a) => ['Add-on', '', '', a.key, null, $(a.price_cents), $(a.price_cents_gbp), 'Yes'])] }) },
  promo_codes: { label: 'Promo codes', build: () => ({ name: 'Promo codes', cols: [{ h: 'Code' }, { h: 'Percent off', t: 'int' }, { h: 'Amount off', t: 'money' }, { h: 'Used', t: 'int' }, { h: 'Max uses', t: 'int' }, { h: 'Expires', t: 'datetime' }, { h: 'Active' }, { h: 'Applies to' }, { h: 'Created', t: 'datetime' }],
    rows: all('SELECT * FROM promo_codes ORDER BY id').map((c) => [c.code, c.percent_off, $(c.amount_off_cents), c.used_count, c.max_uses, c.expires_at, yn(c.active), c.applies_to, c.created_at]) }) },
  categories: { label: 'Categories (classifieds, listings, sub-categories)', build: () => ({ name: 'Categories', cols: [{ h: 'Section' }, { h: 'Key / group' }, { h: 'Name' }, { h: 'Hebrew name' }, { h: 'Parent' }, { h: 'Active' }],
    rows: [...all('SELECT * FROM custom_categories ORDER BY sort_order').map((c) => ['Classifieds', c.key, c.label, c.label_he, '', yn(c.active)]), ...all('SELECT * FROM listing_categories ORDER BY sort_order').map((c) => ['Listings', c.key, c.label, c.label_he, '', yn(c.active)]), ...all('SELECT t.*, p.name pname FROM taxonomies t LEFT JOIN taxonomies p ON p.id = t.parent_id ORDER BY t.grp, t.sort_order').map((c) => ['Sub-category', c.grp, c.name, c.name_he, c.pname, yn(c.active)])] }) },
  analytics_visits: { label: 'Analytics: visits', build: (f, t) => {
    const r = range('ts', f, t);
    return { name: 'Visits', cols: [{ h: 'Start', t: 'datetime' }, { h: 'New visitor' }, { h: 'Site' }, { h: 'Landing page' }, { h: 'Exit page' }, { h: 'Source' }, { h: 'Channel' }, { h: 'Campaign' }, { h: 'Country' }, { h: 'Device' }, { h: 'OS' }, { h: 'Browser' }, { h: 'Pages', t: 'int' }, { h: 'Actions', t: 'int' }, { h: 'Seconds on site', t: 'int' }],
      rows: all(`SELECT * FROM analytics_sessions${r.sql} ORDER BY ts`, ...r.p).map((s) => [s.ts, yn(s.is_new), s.domain, s.landing, s.exit_path, s.ref_host, s.channel, s.utm_campaign, s.country, s.device, s.os, s.browser, s.pages, s.events, s.active_s]) };
  } },
  analytics_searches: { label: 'Analytics: what people searched for', build: (f, t) => {
    const r = range('ts', f, t);
    return { name: 'Searches', cols: [{ h: 'Date', t: 'datetime' }, { h: 'Where' }, { h: 'Search' }, { h: 'Results', t: 'int' }, { h: 'Page' }],
      rows: all(`SELECT * FROM analytics_hits${r.sql ? r.sql + " AND" : " WHERE"} type = 'se' ORDER BY ts`, ...r.p).map((h) => [h.ts, h.name, json(h.extra, {}).q || '', h.value, h.path]) };
  } },
};

const KINDS = Object.keys(SHEETS);
const catalog = () => KINDS.map((k) => ({ kind: k, label: SHEETS[k].label, count: (() => { try { return SHEETS[k].build().rows.length; } catch (e) { return 0; } })() }));

// kind is one dataset, or 'all' for every dataset as tabs of one workbook.
function workbook(kind, from, to) {
  const kinds = kind === 'all' ? KINDS : KINDS.includes(kind) ? [kind] : null;
  if (!kinds) return null;
  return buildXlsx(kinds.map((k) => SHEETS[k].build(from, to)));
}

module.exports = { workbook, catalog, KINDS };
