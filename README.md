# JListings

A community classifieds, listings and simchas board: free-form Node.js/Express backend, SQLite
storage, Stripe Checkout for paid listings, and a dependency-free vanilla-JS frontend
with full Hebrew/RTL support.

## Features

- **Home page**: recent classifieds & simchas carousels, live zmanim (sunrise, sunset,
  tzeit, chatzot, sof zman shma, etc.) for the visitor's geolocation (falls back to
  Brooklyn, NY), Daf Yomi, and a Hebrew/Yiddish date display with the traditional
  `אור ליום` prefix from nightfall (72 minutes after sunset) until sunrise.
- **9 classifieds categories** (Job Offers, Seeking a Job, Items For Sale, Items For
  Rent, Free Giveaways, Lost & Found, Wanted, Services, Real Estate), each with its own
  fields, search/filtering, and pagination, plus a "View All" page and per-category
  pages that cross-link to each other.
- **Simchas board** with admin-configurable categories, date/location/nearby search,
  and an optional "surprise a friend" Mazel Tov email with a link to the post.
- **Posting flow**: a single wizard for both classifieds and simchas, image upload
  (auto-moderated - nothing with a photo goes live until an admin approves it),
  Stripe Checkout, an emailed PDF invoice with full listing details (including the
  expiration date), and an admin notification email for anything needing attention.
- **Boost & Strike add-ons**: boost a listing back to the top or make it "featured" by
  re-entering the posting email and paying an additional fee.
- **Admin portal** (`/admin`): moderation queue, full post editor (edit/delete/extend/
  save-forever/boost), per-post view counts, a CRM searchable by post or by customer
  (email/phone/name), and full control over categories, sub-categories, and pricing.
- **No user accounts** - bookmarking is per-browser (localStorage) and posting only
  needs an email address.
- Bilingual UI (English/Hebrew) with automatic RTL layout.

## Getting started

```bash
npm install
cp .env.example .env   # fill in the values described below
npm start
```

The app listens on `PORT` (default `3000`). On first boot it creates the SQLite
database (`DATA_DIR/classifieds.db`, default `./data`), runs the schema, and seeds
default categories/pricing. If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and no admin
exists yet, an admin account is created automatically - log in at `/admin`.

### Required environment variables

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs admin session tokens. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstraps the first admin account. |
| `STRIPE_PUBLISHABLE_KEY` | Powers the embedded Stripe Checkout form on the client (safe to expose publicly). |
| `STRIPE_SECRET_KEY` | Needed for any paid listing/boost/strike checkout. |
| `STRIPE_WEBHOOK_SECRET` | Verifies the `/api/webhook` Stripe callback that finalizes paid posts. If this is ever missing or misconfigured, the post-success page still finalizes the payment itself as a fallback. |
| `APP_URL` | Base URL used in emails and Stripe redirect URLs. |

### Optional environment variables

| Variable | Purpose |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | Outbound email. If unset, emails are logged to the console instead of sent - useful for local development. |
| `ADMIN_NOTIFY_EMAIL` | Where "needs attention" emails go (reports, new posts awaiting approval). Also editable from the admin Settings page. |
| `GOOGLE_MAPS_API_KEY` | Enables Google Places autocomplete on location fields. Without it, location is still a plain, fully functional text field. Restrict the key by HTTP referrer in the Google Cloud console since it's exposed to the browser. |
| `DATA_DIR` | Where the SQLite database lives (default `./data`). |
| `UPLOAD_DIR` | Where uploaded images are stored (default `./uploads`). |

## Architecture

Plain Express + `better-sqlite3`, no build step or frontend framework:

```
server.js               Express app wiring
db/schema.sql, db/index.js   SQLite schema + seed data
routes/public/*         Public API (config, home, classifieds, simchas, posts, webhook)
routes/admin/*          Admin API (auth, taxonomies, pricing, settings, posts, CRM, stats)
services/*              Post validation, pricing, lifecycle (create -> pay -> approve -> expire), Stripe checkout, formatting
utils/*                 Zmanim/Hebrew date/Daf Yomi, phone validation, mailer, invoice PDF, ids
public/                 Public site (vanilla JS, client-side routed)
public/admin/           Admin portal (separate hash-routed vanilla JS app)
```

### Zmanim / Hebrew date / Daf Yomi

Implemented in `utils/hebrewCalendar.js` and `utils/dafyomi.js` on top of `@hebcal/core`
and `@hebcal/learning`, with `geo-tz` for offline timezone lookup from coordinates (no
API key needed). Three independent day-boundaries are modeled, matching how these are
traditionally displayed:

- **English date** flips at local civil midnight.
- **Hebrew/Yiddish date** flips at halachic nightfall (72 fixed minutes after sunset)
  and shows the `אור ליום` prefix from that moment until the next sunrise.
- **Daf Yomi** flips at local civil midnight (independent of the Hebrew date's
  nightfall boundary).

### Posts

Classifieds and simchas share one `posts` table (`type` discriminates them); category-
specific attributes (job type, price, lost/found, pay period, etc.) live in a `fields`
JSON column so new attributes don't require a migration. A post's lifecycle is
`pending_payment -> pending_approval (if it has images) or live -> expired`, driven by
`services/postLifecycle.js` and a cron job (`utils/cron.js`) that expires stale
listings every 15 minutes.

## Deploying

`render.yaml` is included for deploying to Render, but the app is a standard Node
process (`npm start`) and runs anywhere Node 20+ and a writable disk are available.
Point `DATA_DIR` and `UPLOAD_DIR` at persistent storage in production.

## Legal pages

`/terms` and `/refund-policy` are plain-language starting points that disclaim
liability for user-generated content and set a non-refundable-by-default policy -
have them reviewed by a lawyer before relying on them.
