const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'classifieds.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Lightweight column migrations for databases created before a column existed
// - CREATE TABLE IF NOT EXISTS above doesn't add columns to an already-existing table.
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
addColumnIfMissing('posts', 'location_id', 'location_id INTEGER');
addColumnIfMissing('posts', 'location_route', 'location_route TEXT');
addColumnIfMissing('posts', 'click_count', 'click_count INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('pricing_tiers', 'post_type', "post_type TEXT NOT NULL DEFAULT 'classified'");
addColumnIfMissing('contact_messages', 'archived', 'archived INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('contact_messages', 'reply_text', 'reply_text TEXT');
addColumnIfMissing('contact_messages', 'replied_at', 'replied_at INTEGER');
addColumnIfMissing('post_payments', 'refunded_cents', 'refunded_cents INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('promo_codes', 'applies_to', 'applies_to TEXT');
addColumnIfMissing('promo_codes', 'included_features', 'included_features TEXT');
addColumnIfMissing('promo_codes', 'excluded_features', 'excluded_features TEXT');
addColumnIfMissing('posts', 'scheduled_at', 'scheduled_at INTEGER');
addColumnIfMissing('editorials', 'scheduled_at', 'scheduled_at INTEGER');
addColumnIfMissing('editorials', 'like_count', 'like_count INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('analytics_events', 'editorial_id', 'editorial_id INTEGER REFERENCES editorials(id) ON DELETE SET NULL');
addColumnIfMissing('analytics_events', 'banner_id', 'banner_id INTEGER REFERENCES banners(id) ON DELETE SET NULL');
// Host header the event came in on (e.g. "jlistings.com" vs
// "jlistings.co.uk") - lets the admin analytics dashboard break traffic
// down per domain. Null on rows logged before this column existed.
addColumnIfMissing('analytics_events', 'domain', 'domain TEXT');
addColumnIfMissing('pricing_tiers', 'price_cents_gbp', 'price_cents_gbp INTEGER');
addColumnIfMissing('addon_pricing', 'price_cents_gbp', 'price_cents_gbp INTEGER');
addColumnIfMissing('post_payments', 'currency', "currency TEXT NOT NULL DEFAULT 'usd'");
addColumnIfMissing('posts', 'contact_phone_methods', 'contact_phone_methods TEXT');
addColumnIfMissing('posts', 'search_keywords', 'search_keywords TEXT');
// AI-generated icon (sanitized inline SVG shape markup, no outer <svg> tag)
// for the listings category chooser grid - generated once per category at
// creation time (see services/taxonomy.js's createListingCategory), so a
// pre-existing category just has this null and falls back to a keyword-
// matched/generic icon (see public/js/pages/browseLists.js).
addColumnIfMissing('listing_categories', 'icon_svg', 'icon_svg TEXT');
// Must run after the migrations above, not in schema.sql - CREATE INDEX IF NOT
// EXISTS still fails with "no such column" on a pre-existing analytics_events
// table where the column was just added by ALTER TABLE, not by the original
// CREATE TABLE (which schema.sql's CREATE TABLE IF NOT EXISTS skips entirely
// when the table already exists).
db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_events_editorial ON analytics_events(editorial_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_events_banner ON analytics_events(banner_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_events_domain ON analytics_events(domain)');

// Simcha pricing tiers used to be stored with post_type defaulting to
// 'classified' (only distinguished by category = 'simcha'), which mixed
// them into the admin Pricing page's Classifieds table with no dedicated
// section of their own. Gives them their own post_type so they're properly
// separate everywhere.
db.prepare("UPDATE pricing_tiers SET post_type = 'simcha' WHERE category = 'simcha' AND post_type != 'simcha'").run();

// One-time migration: boost/strike/oversized add-on pricing used to be one
// shared row per add-on regardless of post type. Splits each into its own
// classified_X / listing_X row, carrying the old shared price forward as the
// starting value for both, then drops the legacy row. Simchas intentionally
// don't get their own rows here - they don't offer these add-ons.
(function migrateAddonPricingPerType() {
  ['boost', 'strike', 'oversized'].forEach((legacyKey) => {
    const legacy = db.prepare('SELECT * FROM addon_pricing WHERE key = ?').get(legacyKey);
    if (!legacy) return;
    ['classified', 'listing'].forEach((postType) => {
      const newKey = `${postType}_${legacyKey}`;
      const exists = db.prepare('SELECT 1 FROM addon_pricing WHERE key = ?').get(newKey);
      if (!exists) {
        db.prepare('INSERT INTO addon_pricing (key, price_cents, config) VALUES (?, ?, ?)').run(newKey, legacy.price_cents, legacy.config);
      }
    });
    db.prepare('DELETE FROM addon_pricing WHERE key = ?').run(legacyKey);
  });
})();

// Simchas never expire (see utils/cron.js) - brings back any that were
// already flipped to 'expired' before that rule existed. Idempotent: a no-op
// once they're all back to 'live'.
db.prepare("UPDATE posts SET status = 'live', updated_at = ? WHERE type = 'simcha' AND status = 'expired'").run(Date.now());

// One-time migration: website links and photos added through the admin
// "+ New Post" page and the bulk-posting tool used to be auto-approved with
// no human review at all (see services/adminPostCreate.js) - including
// through the bulk tool, whose password is a far more casually-shared,
// lower-trust credential than a real admin login. None of those approvals
// were ever actually verified by anyone, so on first boot after that fix,
// every currently-approved website link and photo is sent back through the
// Moderation Queue for a real review (see routes/admin/posts.js's
// needsUrlApproval/needsImageApproval). There's no stored record of which
// approvals came from that shortcut versus a genuine admin review, so this
// errs toward re-checking everything rather than risking leaving something
// unverified - already-fine content just needs one more click to re-approve.
// Guarded by a flag so it only ever runs once; without it, every restart
// would also wipe out approvals an admin had since deliberately re-confirmed.
(function reverifyUnauditedContent() {
  const FLAG_KEY = 'migration_reverify_unaudited_content_done';
  const already = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(FLAG_KEY);
  if (already) return;

  const urlReset = db.prepare(
    "UPDATE posts SET contact_url_approved = 0 WHERE contact_url_approved = 1 AND contact_url IS NOT NULL AND contact_url != ''"
  ).run();
  const imgReset = db.prepare('UPDATE post_images SET approved = 0 WHERE approved = 1').run();

  db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    FLAG_KEY,
    JSON.stringify({ ranAt: Date.now(), websiteLinksReset: urlReset.changes, imagesReset: imgReset.changes })
  );
  if (urlReset.changes || imgReset.changes) {
    console.log(`[migration] Sent ${urlReset.changes} website link(s) and ${imgReset.changes} photo(s) back to the Moderation Queue for verification.`);
  }
})();

function seed() {
  const now = Date.now();

  const tierCount = db.prepare('SELECT COUNT(*) AS c FROM pricing_tiers').get().c;
  if (tierCount === 0) {
    const insert = db.prepare(
      `INSERT INTO pricing_tiers (category, post_type, name, duration_days, price_cents, sort_order, active)
       VALUES (@category, @post_type, @name, @duration_days, @price_cents, @sort_order, 1)`
    );
    const generic = [
      { category: null, post_type: 'classified', name: '7 Days', duration_days: 7, price_cents: 1000, sort_order: 1 },
      { category: null, post_type: 'classified', name: '14 Days', duration_days: 14, price_cents: 1500, sort_order: 2 },
      { category: null, post_type: 'classified', name: '30 Days', duration_days: 30, price_cents: 2500, sort_order: 3 },
      { category: null, post_type: 'classified', name: '60 Days', duration_days: 60, price_cents: 4000, sort_order: 4 },
    ];
    const freeTiers = [
      { category: 'lost-found', post_type: 'classified', name: 'Standard (Free)', duration_days: 30, price_cents: 0, sort_order: 1 },
      { category: 'simcha', post_type: 'simcha', name: 'Standard (Free)', duration_days: 30, price_cents: 0, sort_order: 1 },
    ];
    const txn = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
    txn([...generic, ...freeTiers]);
  }

  const addonCount = db.prepare('SELECT COUNT(*) AS c FROM addon_pricing').get().c;
  if (addonCount === 0) {
    const insert = db.prepare('INSERT INTO addon_pricing (key, price_cents, config) VALUES (?, ?, ?)');
    ['classified', 'listing'].forEach((postType) => {
      insert.run(`${postType}_boost`, 500, JSON.stringify({ label: 'Boost to top' }));
      insert.run(`${postType}_strike`, 1000, JSON.stringify({ label: 'Featured / Striking listing' }));
      insert.run(
        `${postType}_oversized`,
        300,
        JSON.stringify({ label: 'Oversized post', titleLimit: 140, descriptionLimit: 3000 })
      );
    });
  }

  const taxCount = db.prepare('SELECT COUNT(*) AS c FROM taxonomies').get().c;
  if (taxCount === 0) {
    const insert = db.prepare(
      `INSERT INTO taxonomies (grp, parent_id, name, name_he, sort_order, active)
       VALUES (@grp, @parent_id, @name, @name_he, @sort_order, 1)`
    );
    const jobCategories = [
      'Administrative / Office', 'Education / Chinuch', 'Retail / Sales', 'Healthcare', 'Food Service',
      'Skilled Trades', 'Childcare', 'Technology', 'Bookkeeping / Accounting', 'Driving / Delivery', 'Other',
    ];
    jobCategories.forEach((name, i) =>
      insert.run({ grp: 'job', parent_id: null, name, name_he: null, sort_order: i })
    );

    const simchaCategories = [
      'Birth', 'Bris / Upsherin', 'Bar / Bat Mitzvah', 'Engagement', 'Wedding', 'Anniversary',
      'New Home', 'Award / Achievement', 'Refuah Shleima', 'Other',
    ];
    simchaCategories.forEach((name, i) =>
      insert.run({ grp: 'simcha', parent_id: null, name, name_he: null, sort_order: i })
    );

    const reInsert = db.prepare(
      `INSERT INTO taxonomies (grp, parent_id, name, name_he, sort_order, active)
       VALUES ('real_estate', @parent_id, @name, NULL, @sort_order, 1)`
    );
    const forSale = reInsert.run({ parent_id: null, name: 'For Sale', sort_order: 0 });
    const forRent = reInsert.run({ parent_id: null, name: 'For Rent', sort_order: 1 });
    ['Apartment', 'House', 'Condo', 'Room', 'Commercial'].forEach((name, i) =>
      reInsert.run({ parent_id: forSale.lastInsertRowid, name, sort_order: i })
    );
    ['Apartment', 'House', 'Condo', 'Room', 'Commercial'].forEach((name, i) =>
      reInsert.run({ parent_id: forRent.lastInsertRowid, name, sort_order: i })
    );
  }

  // Seeded independently (not gated on the whole taxonomies table) so these
  // two groups still get created on databases that already existed before
  // job type / pay period became admin-editable.
  const seedFlatGroup = (grp, names) => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM taxonomies WHERE grp = ?').get(grp).c;
    if (count > 0) return;
    const insert = db.prepare(
      `INSERT INTO taxonomies (grp, parent_id, name, name_he, sort_order, active) VALUES (?, NULL, ?, NULL, ?, 1)`
    );
    names.forEach((name, i) => insert.run(grp, name, i));
  };
  seedFlatGroup('job_type', ['Part Time', 'Full Time', 'Seasonal', 'One Time']);
  seedFlatGroup('pay_period', ['Hour', 'Week', 'Month', 'Season', 'Year', 'Project']);

  // INSERT OR IGNORE per key (rather than gating on an empty table) so new
  // settings keys introduced later get seeded into existing databases too,
  // without ever overwriting a value an admin already edited.
  const seedSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  const seed = (key, value) => seedSetting.run(key, JSON.stringify(value));

  seed('simcha_retention_days', 30);
  seed('simcha_retention_max_days', 365);
  seed('admin_notify_email', process.env.ADMIN_NOTIFY_EMAIL || '');
  seed('char_limits', { title: 80, description: 200 });
  seed('editorial_instructions_html', '<p>Share your perspective with the community. Please keep submissions <b>respectful</b> and <i>on-topic</i> - all editorials are reviewed before publishing.</p>');
  seed('editorial_char_limits', { title: 150, body: 20000 });
  seed('default_location', { label: 'Brooklyn, NY', lat: 40.6782, lng: -73.9442, tzid: 'America/New_York' });

  // Integration settings - editable from the admin portal's Settings page so
  // the site can be configured after deploy without touching env vars.
  seed('site_name', process.env.SITE_NAME || 'JListings');
  seed('app_url', process.env.APP_URL || '');
  // Any other domain pointed at this same site (e.g. a second ccTLD) - see
  // services/appUrl.js. Adding one here needs no deploy, just DNS + this.
  seed('app_domains', []);
  seed('bulk_post_password_hash', '');
  seed('category_manage_password_hash', '');
  seed('stripe_publishable_key', process.env.STRIPE_PUBLISHABLE_KEY || '');
  seed('stripe_secret_key', process.env.STRIPE_SECRET_KEY || '');
  seed('stripe_webhook_secret', process.env.STRIPE_WEBHOOK_SECRET || '');
  seed('google_maps_api_key', process.env.GOOGLE_MAPS_API_KEY || '');
  seed('smtp_host', process.env.SMTP_HOST || '');
  seed('smtp_port', process.env.SMTP_PORT || '587');
  seed('smtp_secure', process.env.SMTP_SECURE === 'true');
  seed('smtp_user', process.env.SMTP_USER || '');
  seed('smtp_pass', process.env.SMTP_PASS || '');
  seed('mail_from', process.env.MAIL_FROM || '');
  seed('mail_reply_to', process.env.MAIL_REPLY_TO || '');
  seed('mail_provider', process.env.MAIL_PROVIDER || 'smtp'); // 'smtp' | 'brevo'
  seed('brevo_api_key', process.env.BREVO_API_KEY || '');
  seed('anthropic_api_key', process.env.ANTHROPIC_API_KEY || '');
  seed('chesky_model', 'claude-opus-5-5');
  seed('openai_api_key', process.env.OPENAI_API_KEY || '');

  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  if (adminCount === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO admin_users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
      process.env.ADMIN_EMAIL.toLowerCase(),
      hash,
      'Administrator',
      'admin',
      now
    );
  }
}

seed();

module.exports = db;
