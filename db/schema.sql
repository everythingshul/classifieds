-- Everything Shul Classifieds & Simchas board schema (SQLite)

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL
);

-- Generic editable taxonomy used for job categories, real-estate categories/sub-categories,
-- and simcha categories. parent_id is only used by the real_estate group (sub-categories).
CREATE TABLE IF NOT EXISTS taxonomies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grp TEXT NOT NULL, -- 'job' | 'real_estate' | 'simcha'
  parent_id INTEGER REFERENCES taxonomies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_he TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_taxonomies_grp ON taxonomies(grp);
CREATE INDEX IF NOT EXISTS idx_taxonomies_parent ON taxonomies(parent_id);

-- Duration/price tiers a poster can choose. category = NULL means it applies to any
-- classifieds category that doesn't have its own dedicated tiers.
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT, -- one of the 9 fixed classifieds category keys, or NULL, or 'simcha'
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_pricing_tiers_category ON pricing_tiers(category);

-- Add-on pricing: boost, strike (featured), oversized post.
CREATE TABLE IF NOT EXISTS addon_pricing (
  key TEXT PRIMARY KEY, -- 'boost' | 'strike' | 'oversized'
  price_cents INTEGER NOT NULL DEFAULT 0,
  config TEXT -- JSON, e.g. oversized character allowance
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- 'classified' | 'simcha'
  category TEXT NOT NULL, -- one of 9 classifieds keys, or 'simcha'
  taxonomy_id INTEGER REFERENCES taxonomies(id),
  title TEXT NOT NULL,
  description TEXT,
  fields TEXT NOT NULL DEFAULT '{}', -- JSON, category-specific attributes
  location_text TEXT,
  location_city TEXT,
  location_state TEXT,
  location_lat REAL,
  location_lng REAL,
  location_place_id TEXT,
  contact_phone TEXT,
  contact_phone_ext TEXT,
  contact_email TEXT,
  contact_url TEXT,
  contact_url_approved INTEGER NOT NULL DEFAULT 0,
  poster_first_name TEXT,
  poster_last_name TEXT,
  poster_email TEXT NOT NULL,
  poster_phone TEXT,
  pricing_tier_id INTEGER REFERENCES pricing_tiers(id),
  price_cents_paid INTEGER NOT NULL DEFAULT 0,
  is_featured_strike INTEGER NOT NULL DEFAULT 0,
  is_oversized INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  -- pending_payment | pending_approval | live | rejected | expired | removed
  has_images INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  boosted_at INTEGER,
  published_at INTEGER,
  expires_at INTEGER,
  saved_forever INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_type_category ON posts(type, category);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_boosted_at ON posts(boosted_at);
CREATE INDEX IF NOT EXISTS idx_posts_poster_email ON posts(poster_email);
CREATE INDEX IF NOT EXISTS idx_posts_expires_at ON posts(expires_at);

CREATE TABLE IF NOT EXISTS post_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_id);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reason TEXT,
  reporter_email TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS simcha_surprises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  sender_display_name TEXT,
  sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS post_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- 'listing' | 'boost' | 'strike' | 'oversized'
  amount_cents INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  payer_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
  invoice_number TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_post_payments_post ON post_payments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_payments_email ON post_payments(payer_email);
