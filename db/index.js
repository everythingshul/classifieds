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

function seed() {
  const now = Date.now();

  const tierCount = db.prepare('SELECT COUNT(*) AS c FROM pricing_tiers').get().c;
  if (tierCount === 0) {
    const insert = db.prepare(
      `INSERT INTO pricing_tiers (category, name, duration_days, price_cents, sort_order, active)
       VALUES (@category, @name, @duration_days, @price_cents, @sort_order, 1)`
    );
    const generic = [
      { category: null, name: '7 Days', duration_days: 7, price_cents: 1000, sort_order: 1 },
      { category: null, name: '14 Days', duration_days: 14, price_cents: 1500, sort_order: 2 },
      { category: null, name: '30 Days', duration_days: 30, price_cents: 2500, sort_order: 3 },
      { category: null, name: '60 Days', duration_days: 60, price_cents: 4000, sort_order: 4 },
    ];
    const freeTiers = [
      { category: 'lost-found', name: 'Standard (Free)', duration_days: 30, price_cents: 0, sort_order: 1 },
      { category: 'simcha', name: 'Standard (Free)', duration_days: 30, price_cents: 0, sort_order: 1 },
    ];
    const txn = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
    txn([...generic, ...freeTiers]);
  }

  const addonCount = db.prepare('SELECT COUNT(*) AS c FROM addon_pricing').get().c;
  if (addonCount === 0) {
    const insert = db.prepare('INSERT INTO addon_pricing (key, price_cents, config) VALUES (?, ?, ?)');
    insert.run('boost', 500, JSON.stringify({ label: 'Boost to top' }));
    insert.run('strike', 1000, JSON.stringify({ label: 'Featured / Striking listing' }));
    insert.run(
      'oversized',
      300,
      JSON.stringify({ label: 'Oversized post', titleLimit: 140, descriptionLimit: 3000 })
    );
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

  // INSERT OR IGNORE per key (rather than gating on an empty table) so new
  // settings keys introduced later get seeded into existing databases too,
  // without ever overwriting a value an admin already edited.
  const seedSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  const seed = (key, value) => seedSetting.run(key, JSON.stringify(value));

  seed('simcha_retention_days', 30);
  seed('simcha_retention_max_days', 365);
  seed('admin_notify_email', process.env.ADMIN_NOTIFY_EMAIL || '');
  seed('char_limits', { title: 80, description: 200 });
  seed('default_location', { label: 'Brooklyn, NY', lat: 40.6782, lng: -73.9442, tzid: 'America/New_York' });

  // Integration settings - editable from the admin portal's Settings page so
  // the site can be configured after deploy without touching env vars.
  seed('site_name', process.env.SITE_NAME || 'Everything Shul Classifieds');
  seed('app_url', process.env.APP_URL || '');
  seed('stripe_secret_key', process.env.STRIPE_SECRET_KEY || '');
  seed('stripe_webhook_secret', process.env.STRIPE_WEBHOOK_SECRET || '');
  seed('google_maps_api_key', process.env.GOOGLE_MAPS_API_KEY || '');
  seed('smtp_host', process.env.SMTP_HOST || '');
  seed('smtp_port', process.env.SMTP_PORT || '587');
  seed('smtp_secure', process.env.SMTP_SECURE === 'true');
  seed('smtp_user', process.env.SMTP_USER || '');
  seed('smtp_pass', process.env.SMTP_PASS || '');
  seed('mail_from', process.env.MAIL_FROM || '');

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
