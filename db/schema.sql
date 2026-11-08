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

-- Admin-added classifieds category types, on top of the 9 built-in ones. These
-- use a generic form (description, location, optional price, optional images)
-- rather than the specialized fields the 9 built-ins have (job type, lost/found, etc).
CREATE TABLE IF NOT EXISTS custom_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  label_he TEXT,
  has_images INTEGER NOT NULL DEFAULT 0,
  has_price INTEGER NOT NULL DEFAULT 0,
  free INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Listings: a fully separate section from Classifieds. Starts empty - every
-- category is admin-defined, using the same generic form shape (description,
-- location, optional price, optional images) as admin-added classifieds types.
CREATE TABLE IF NOT EXISTS listing_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  label_he TEXT,
  has_images INTEGER NOT NULL DEFAULT 0,
  has_price INTEGER NOT NULL DEFAULT 0,
  free INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  -- AI-generated icon (inline SVG shape markup) for the chooser grid -
  -- see createListingCategory in services/taxonomy.js.
  icon_svg TEXT
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  percent_off INTEGER,
  amount_off_cents INTEGER,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  applies_to TEXT, -- JSON array of post types ['classified','listing','simcha'] - NULL/empty = all sections
  included_features TEXT, -- JSON array of line-item kinds ['listing','strike','oversized'] this promo discounts - NULL/empty = all
  excluded_features TEXT, -- JSON array of line-item kinds this promo never discounts, even if included above - NULL/empty = none
  created_at INTEGER NOT NULL
);

-- Duration/price tiers a poster can choose. category = NULL means it applies to any
-- classifieds category that doesn't have its own dedicated tiers.
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT, -- one of the 9 fixed classifieds category keys, or NULL, or 'simcha'
  post_type TEXT NOT NULL DEFAULT 'classified', -- 'classified' | 'listing' - keeps Listings pricing/rules separate
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  -- GBP price for .co.uk domains (see services/currency.js). NULL means "not
  -- configured yet" - checkout falls back to charging the USD price (in USD)
  -- rather than guessing a conversion or mixing currencies in one order.
  price_cents_gbp INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_pricing_tiers_category ON pricing_tiers(category);

-- Add-on pricing: boost, strike (featured), oversized post.
CREATE TABLE IF NOT EXISTS addon_pricing (
  key TEXT PRIMARY KEY, -- 'boost' | 'strike' | 'oversized'
  price_cents INTEGER NOT NULL DEFAULT 0,
  price_cents_gbp INTEGER, -- see pricing_tiers.price_cents_gbp above
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
  -- JSON array subset of "call"/"sms"/"whatsapp" - which ways contact_phone
  -- can be reached. NULL (posts from before this existed) is treated as
  -- ["call"] in code, matching what every phone number supported before.
  contact_phone_methods TEXT,
  contact_email TEXT,
  -- AI-generated search aid (services/aiAssist.js) - synonyms/related terms
  -- a visitor might search for that the title/description don't literally
  -- contain. Never shown to visitors or admins anywhere, only ever checked
  -- alongside title/description in a search query's WHERE clause.
  search_keywords TEXT,
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
  -- pending_payment | pending_approval | scheduled | live | rejected | expired | removed
  has_images INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  boosted_at INTEGER,
  published_at INTEGER,
  scheduled_at INTEGER, -- admin-only: when a 'scheduled' post should go live (cron flips it to 'live' at this time)
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

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  reply_text TEXT,
  replied_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Chesky chat widget: human-handoff conversations plus the Q&A the team has
-- taught it. The AI itself is stateless (services/chesky.js calls the
-- Anthropic API fresh each turn) - only handoff and teaching need storage.
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  unread INTEGER NOT NULL DEFAULT 1,
  page TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  notified_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  from_role TEXT NOT NULL, -- 'visitor' | 'admin' | 'bot'
  text TEXT,
  voice_url TEXT,
  voice_mime TEXT,
  voice_dur REAL,
  voice_peaks TEXT, -- JSON array of 0-100 waveform levels
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, id);

-- Answers the team has taught Chesky, checked before the AI is asked - lets
-- the team pin down exact business answers (pricing, policy) authoritatively.
CREATE TABLE IF NOT EXISTS chat_learned (
  id TEXT PRIMARY KEY,
  questions TEXT NOT NULL, -- JSON array of trigger phrases
  answer TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Questions Chesky couldn't help with (visitor declined / thumbs-downed),
-- grouped by normalized text so the team can review and teach real answers.
CREATE TABLE IF NOT EXISTS chat_unanswered (
  normalized_key TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  miss_count INTEGER NOT NULL DEFAULT 0,
  down_count INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL
);

-- Thumbs up/down tallies, keyed by a chat_learned id or 'ai' for the model's own replies.
CREATE TABLE IF NOT EXISTS chat_entry_stats (
  entry_id TEXT PRIMARY KEY,
  up_count INTEGER NOT NULL DEFAULT 0,
  down_count INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL
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
  currency TEXT NOT NULL DEFAULT 'usd', -- 'usd' | 'gbp' - see services/currency.js
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  payer_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  invoice_number TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_post_payments_post ON post_payments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_payments_email ON post_payments(payer_email);

-- Every page load and post view/click, tagged with an anonymous per-browser
-- visitor id (localStorage, no cookies/PII) so the admin analytics dashboard
-- can report unique vs. recurring visitors over any date range, not just
-- lifetime totals (posts.view_count/click_count already cover that).
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'pageview' | 'post_view' | 'post_click' | 'editorial_view' | 'editorial_click' | 'banner_view' | 'banner_click'
  path TEXT,
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  post_type TEXT, -- denormalized from posts.type at event time, for fast breakdowns without a join
  category TEXT, -- denormalized from posts.category at event time
  editorial_id INTEGER REFERENCES editorials(id) ON DELETE SET NULL,
  visitor_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor ON analytics_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_post ON analytics_events(post_id);
-- idx_analytics_events_editorial is created in db/index.js, after the
-- editorial_id column migration runs - see the comment there for why.
-- Same story for the banner_id column/index (added after this table already
-- existed in deployed databases).

-- Admin-managed clickable ad/promo banners - top-of-page or sidebar, each
-- one targeted to specific page zones or every page, with an image (GIFs
-- supported - see middleware/upload.js's separate banner upload path that
-- skips the post-image re-encoding pipeline so animation survives) and a
-- link. Views/clicks are logged as analytics_events rows (banner_id set,
-- type 'banner_view'/'banner_click'), same system as post/editorial
-- impressions, so they show up in the same admin Analytics dashboard.
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  image_filename TEXT NOT NULL,
  link_url TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'top', -- 'top' | 'sidebar'
  pages TEXT NOT NULL DEFAULT '[]', -- JSON array of page-zone keys ('home','classifieds','listings','simchas','editorials','post','search','bookmarks') - ignored when all_pages = 1
  all_pages INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(active);

-- One row per digest actually sent (not per subscriber overall) - gives
-- both per-send and aggregate open/click numbers. opened_at/clicked_at are
-- the first time each happened; open_count/click_count keep incrementing
-- past that (a subscriber opening the same email on their phone and laptop
-- both count).
CREATE TABLE IF NOT EXISTS email_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  subscription_id INTEGER NOT NULL REFERENCES email_subscriptions(id) ON DELETE CASCADE,
  item_count INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,
  opened_at INTEGER,
  open_count INTEGER NOT NULL DEFAULT 0,
  clicked_at INTEGER,
  click_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_email_sends_subscription ON email_sends(subscription_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_sent_at ON email_sends(sent_at);

-- Editorials: a separate, free-to-post content type (opinion pieces/community
-- writing) - always requires admin approval, unlike classifieds/listings
-- which only need it when photos are attached. poster_first_name/last_name/
-- email/phone are never shown publicly (same "private poster record" pattern
-- as simchas) - pen_name is the public byline.
CREATE TABLE IF NOT EXISTS editorials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pen_name TEXT NOT NULL,
  poster_first_name TEXT NOT NULL,
  poster_last_name TEXT NOT NULL,
  poster_email TEXT NOT NULL,
  poster_phone TEXT,
  notes_to_admin TEXT,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  -- pending_approval | scheduled | live | rejected | removed
  rejection_reason TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  admin_notes TEXT,
  published_at INTEGER,
  scheduled_at INTEGER, -- admin-only: when a 'scheduled' editorial should go live (cron flips it to 'live' at this time)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorials_status ON editorials(status);
CREATE INDEX IF NOT EXISTS idx_editorials_published_at ON editorials(published_at);

CREATE TABLE IF NOT EXISTS editorial_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  editorial_id INTEGER NOT NULL REFERENCES editorials(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Videos are stored as external links (YouTube/Vimeo etc.), embedded on the
-- detail page - hosting/transcoding video files ourselves is a different
-- order of infrastructure than this site otherwise needs.
CREATE TABLE IF NOT EXISTS editorial_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  editorial_id INTEGER NOT NULL REFERENCES editorials(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Comments always require approval before showing publicly - pen_name +
-- email only (no full name), matching the lighter-weight identity bar for
-- commenting vs. submitting a full editorial.
CREATE TABLE IF NOT EXISTS editorial_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  editorial_id INTEGER NOT NULL REFERENCES editorials(id) ON DELETE CASCADE,
  pen_name TEXT NOT NULL,
  email TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval', -- pending_approval | live | rejected
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_comments_editorial ON editorial_comments(editorial_id);
CREATE INDEX IF NOT EXISTS idx_editorial_comments_status ON editorial_comments(status);

-- Daily email digest subscriptions. categories is a JSON array of strings
-- like "classified:items-for-sale", "listing:restaurants", "simcha",
-- "editorial" - one row per email (re-subscribing just updates it in place).
-- Double opt-in (status starts 'pending' until the confirm link is
-- clicked) and a one-click unsubscribe (public_id doubles as the
-- confirm/unsubscribe token) are both there specifically to protect sender
-- reputation/deliverability, not just as a UX nicety.
CREATE TABLE IF NOT EXISTS email_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  categories TEXT NOT NULL,
  send_hour INTEGER NOT NULL DEFAULT 8, -- 0-23, interpreted in the site's configured timezone (Settings -> Default Location)
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | unsubscribed
  confirmed_at INTEGER,
  last_sent_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_subscriptions_status_hour ON email_subscriptions(status, send_hour);
