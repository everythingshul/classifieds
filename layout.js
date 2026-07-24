@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap');

:root {
  --navy: #1f3b57;
  --navy-dark: #142838;
  --gold: #b08d3f;
  --gold-light: #e8dcc0;
  --cta: #2f6b63;
  --cta-dark: #234f49;
  --paper: #faf8f4;
  --ink: #232323;
  --ink-soft: #62666b;
  --border: #e4e1d8;
  --success: #2f6f4f;
  --danger: #a13d3d;
  --radius: 0;
  --shadow: 0 1px 3px rgba(31, 59, 87, 0.07), 0 1px 2px rgba(31, 59, 87, 0.05);
  --max-width: 1100px;
  --font-body: 'Heebo', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-head: 'Heebo', system-ui, -apple-system, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }
html { font-size: 15px; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-body);
  color: var(--ink);
  background: var(--paper);
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
body[dir='rtl'] { direction: rtl; }

h1, h2, h3, h4 { font-family: var(--font-head); color: var(--navy); margin: 0 0 .4em; font-weight: 800; letter-spacing: -.01em; }
h1 { font-size: 1.5rem; }
h2 { font-size: 1.2rem; }
h3 { font-size: 1.02rem; }
a { color: var(--navy); text-decoration: none; }
a:hover { color: var(--gold); }
img { max-width: 100%; display: block; }
button { font-family: inherit; cursor: pointer; }
p { margin: 0 0 .7em; }

.container { max-width: var(--max-width); margin: 0 auto; padding: 0 18px; }

/* ---------- Header ---------- */
.site-header {
  background: var(--navy);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 40;
  box-shadow: var(--shadow);
}
.site-header .container { display: flex; align-items: center; gap: 16px; height: 52px; }
.brand { display: flex; align-items: center; gap: 8px; color: #fff; font-family: var(--font-head); font-size: 1.08rem; font-weight: 800; letter-spacing: -.01em; }
.brand img { height: 26px; }
.main-nav { display: flex; gap: 2px; flex: 1; overflow-x: auto; scrollbar-width: none; }
.main-nav a { color: rgba(255,255,255,.82); padding: 6px 10px; border-radius: var(--radius); font-size: .86rem; font-weight: 500; white-space: nowrap; }
.main-nav a:hover, .main-nav a.active { background: rgba(255,255,255,.12); color: #fff; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.btn-post {
  background: var(--cta); color: #fff; font-weight: 700; padding: 7px 15px;
  border-radius: 0; border: none; font-size: .84rem;
}
.btn-post:hover { background: var(--cta-dark); color: #fff; }
.lang-toggle, .bookmarks-link {
  background: transparent; border: 1px solid rgba(255,255,255,.35); color: #fff; border-radius: 0;
  padding: 5px 11px; font-size: .78rem;
}
.hamburger { display: none; background: none; border: none; color: #fff; font-size: 1.3rem; }

@media (max-width: 860px) {
  .main-nav { display: none; position: absolute; top: 52px; inset-inline: 0; background: var(--navy-dark); flex-direction: column; padding: 6px; }
  .main-nav.open { display: flex; }
  .hamburger { display: block; }
}

/* ---------- Buttons ---------- */
.btn { display: inline-block; padding: 8px 16px; border-radius: var(--radius); border: 1px solid var(--navy); background: var(--navy); color: #fff; font-weight: 600; font-size: .86rem; }
.btn:hover { background: var(--navy-dark); color: #fff; }
.btn-outline { background: transparent; color: var(--navy); }
.btn-outline:hover { background: var(--navy); color: #fff; }
.btn-gold { background: var(--cta); border-color: var(--cta); color: #fff; }
.btn-gold:hover { background: var(--cta-dark); border-color: var(--cta-dark); }
.btn-danger { background: var(--danger); border-color: var(--danger); }
.btn-sm { padding: 5px 11px; font-size: .78rem; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

/* ---------- Combo widget (home page: date + daf yomi + zmanim, one compact card) ---------- */
.combo-widget { background: #fff; border: 1px solid var(--border); padding: 10px 14px; box-shadow: var(--shadow); margin: 14px 0 26px; font-size: .82rem; }
.combo-widget-top { display: flex; gap: 24px; flex-wrap: wrap; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.combo-label { display: block; font-weight: 700; color: var(--navy); font-size: .88rem; }
.combo-sub { display: block; color: var(--ink-soft); font-size: .72rem; }
.combo-zman-row { display: flex; gap: 14px; flex-wrap: wrap; color: var(--ink-soft); font-size: .74rem; }
.combo-zman-row b { color: var(--ink); font-weight: 600; margin-inline-end: 3px; }

/* ---------- Carousels ---------- */
.section-heading { display: flex; align-items: baseline; justify-content: space-between; margin: 24px 0 10px; }
.section-heading a { font-size: .82rem; font-weight: 600; }
.carousel { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x mandatory; }
.carousel::-webkit-scrollbar { height: 5px; }
.carousel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 0; }
.carousel .card { scroll-snap-align: start; flex: 0 0 210px; }

/* ---------- Cards ---------- */
/* Square corners by design - no image, the card is a compact text summary;
   full contact info only ever appears after clicking through to the post. */
.card {
  background: #fff; border: 1px solid var(--border); border-radius: 0; overflow: hidden;
  box-shadow: var(--shadow); display: flex; flex-direction: column; transition: transform .12s ease;
}
.card:hover { transform: translateY(-2px); border-color: var(--gold); }
.card .body { padding: 12px 13px; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.card .cat { font-size: .66rem; text-transform: uppercase; letter-spacing: .04em; color: var(--gold); font-weight: 700; }
.card .title { font-weight: 700; color: var(--navy); font-size: .94rem; line-height: 1.3; }
.card .card-desc {
  font-size: .8rem; color: var(--ink); margin: 0; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.card .meta { font-size: .76rem; color: var(--ink-soft); }
.card .price { font-weight: 700; color: var(--success); font-size: .88rem; }
.card.featured { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold-light); }
.badge-featured { color: var(--gold); font-size: .9rem; }

/* ---------- List/grid pages ---------- */
.page-header { padding: 20px 0 6px; }
.category-pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 16px; }
.category-pills a { padding: 5px 12px; border: 1px solid var(--border); border-radius: 0; font-size: .78rem; background: #fff; }
.category-pills a.active { background: var(--navy); color: #fff; border-color: var(--navy); }
.category-pills a .count { color: var(--ink-soft); margin-inline-start: 3px; }
.category-pills a.active .count { color: rgba(255,255,255,.7); }

.filters-bar { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 11px 13px; margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
.field { display: flex; flex-direction: column; gap: 3px; font-size: .76rem; color: var(--ink-soft); }
.field input, .field select, .field textarea {
  padding: 6px 9px; border: 1px solid var(--border); border-radius: 0; font-family: inherit; font-size: .85rem; background: #fff;
}
.field textarea { resize: vertical; }

.results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.empty-state { text-align: center; padding: 44px 16px; color: var(--ink-soft); font-size: .9rem; }

.pagination { display: flex; justify-content: center; gap: 5px; margin: 22px 0; flex-wrap: wrap; }
.pagination a, .pagination span { padding: 6px 11px; border: 1px solid var(--border); border-radius: 0; background: #fff; font-size: .82rem; }
.pagination a.active { background: var(--navy); color: #fff; border-color: var(--navy); }

/* ---------- Detail page ---------- */
.detail-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 22px; margin: 18px 0 44px; align-items: start; }
@media (max-width: 800px) { .detail-grid { grid-template-columns: 1fr; } }
.detail-images { display: grid; grid-template-columns: 1fr; gap: 6px; }
.detail-images img { border-radius: var(--radius); border: 1px solid var(--border); }
.contact-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); position: sticky; top: 66px; }
.contact-card .btn { width: 100%; margin-bottom: 6px; text-align: center; }
.detail-meta-list { list-style: none; margin: 10px 0; padding: 0; font-size: .85rem; }
.detail-meta-list li { padding: 4px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; }

/* ---------- Forms / wizard ---------- */
.wizard-steps { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
.wizard-steps span { padding: 5px 10px; border-radius: 0; background: #fff; border: 1px solid var(--border); font-size: .76rem; color: var(--ink-soft); }
.wizard-steps span.active { background: var(--navy); color: #fff; border-color: var(--navy); }
.form-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); max-width: 680px; }
.form-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.form-row label { font-weight: 600; font-size: .84rem; }
.form-row .hint { font-size: .74rem; color: var(--ink-soft); font-weight: 400; }
.form-row input, .form-row select, .form-row textarea {
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 0; font-family: inherit; font-size: .88rem;
}
.form-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 600px) { .form-cols { grid-template-columns: 1fr; } }
.category-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media (max-width: 700px) { .category-grid { grid-template-columns: repeat(2, 1fr); } }
.category-tile { border: 2px solid var(--border); border-radius: var(--radius); padding: 12px 8px; text-align: center; background: #fff; font-size: .82rem; font-weight: 600; }
.category-tile.selected { border-color: var(--gold); background: var(--gold-light); }
.tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.tier-tile { border: 2px solid var(--border); border-radius: var(--radius); padding: 11px; text-align: center; background: #fff; }
.tier-tile.selected { border-color: var(--navy); background: #eef3f7; }
.tier-tile .price { font-family: var(--font-head); font-size: 1.05rem; color: var(--navy); font-weight: 700; }
.addon-row { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--border); border-radius: 0; margin-bottom: 6px; font-size: .86rem; }
.error-list { background: #fdecec; border: 1px solid var(--danger); color: var(--danger); padding: 8px 12px; border-radius: 0; margin-bottom: 12px; font-size: .84rem; }
.error-list ul { margin: 4px 0 0; padding-inline-start: 18px; }

/* ---------- Footer ---------- */
.site-footer { background: var(--navy-dark); color: rgba(255,255,255,.7); margin-top: 44px; padding: 24px 0; font-size: .8rem; }
.site-footer a { color: rgba(255,255,255,.85); }
.footer-links { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; }

/* ---------- Misc ---------- */
.tag { display: inline-block; padding: 2px 7px; border-radius: 0; background: var(--gold-light); color: var(--navy-dark); font-size: .7rem; font-weight: 700; }
.spinner { text-align: center; padding: 30px; color: var(--ink-soft); font-size: .88rem; }
.toast { position: fixed; bottom: 16px; inset-inline: 0; margin: 0 auto; max-width: 340px; background: var(--navy); color: #fff; padding: 10px 16px; border-radius: var(--radius); text-align: center; box-shadow: var(--shadow); z-index: 100; font-size: .86rem; }
.report-link, .bookmark-btn { background: none; border: 1px solid var(--border); border-radius: 0; padding: 5px 9px; font-size: .76rem; color: var(--ink-soft); }
.bookmark-btn.active { color: var(--gold); border-color: var(--gold); }
