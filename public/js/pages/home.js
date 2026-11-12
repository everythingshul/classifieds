// A small teaser strip under the weather widget - title, byline, and image
// (or a text placeholder when there's no cover photo, same as the editorial
// cards on /editorials) for each of the 3 most recent live editorials.
function renderHomeEditorialsTeaser(editorials) {
  if (!editorials || !editorials.length) return '';
  return `
    <div class="combo-widget home-editorials-teaser">
      <p class="combo-label" style="margin-bottom:8px" data-i18n="home_editorials_heading">${I18N.t('home_editorials_heading')}</p>
      ${editorials.map((ed) => {
        const cover = ed.images && ed.images[0];
        return `
          <a class="home-editorial-item" href="/editorials/${ed.id}">
            ${cover ? `<div class="home-editorial-thumb" style="background-image:url('${cover}')"></div>` : `<div class="home-editorial-thumb home-editorial-thumb-placeholder"></div>`}
            <div class="home-editorial-text">
              <div class="home-editorial-title">${escapeHtml(ed.title)}</div>
              <div class="home-editorial-excerpt">${escapeHtml(editorialExcerpt(ed.body, 70))}</div>
            </div>
          </a>`;
      }).join('')}
      <a href="/editorials" class="home-editorial-viewall" data-i18n="editorials_title">${I18N.t('editorials_title')}</a>
    </div>`;
}

const HOME_LOC_STORAGE = 'jl_custom_location';
function getCustomHomeLocation() {
  try { return JSON.parse(localStorage.getItem(HOME_LOC_STORAGE) || 'null'); } catch (e) { return null; }
}

// "View More"/"View All" footer shown under each home-page carousel. View
// More pages through the same list endpoint the full browse page uses
// (/api/classifieds, /api/listings, /api/simchas) and appends results in
// place; View All just links to that browse page.
const HOME_SECTIONS = [
  { type: 'classified', apiFn: () => Api.classifieds, browseUrl: '/classifieds', carousel: 'classifiedsCarousel', initialCount: (d) => d.recentClassifieds.length },
  { type: 'listing', apiFn: () => Api.listings, browseUrl: '/listings', carousel: 'listingsCarousel', initialCount: (d) => d.recentListings.length },
  { type: 'simcha', apiFn: () => Api.simchas, browseUrl: '/simchas', carousel: 'simchasCarousel', initialCount: (d) => d.recentSimchas.length },
];

function renderSectionFooter(section, hasMore) {
  return `
    <div class="home-section-more">
      ${hasMore ? `<button type="button" class="btn btn-sm btn-outline" data-view-more="${section.type}">View More</button>` : ''}
      <a href="${section.browseUrl}" class="btn btn-sm">View All</a>
    </div>`;
}

function wireViewMoreButtons() {
  HOME_SECTIONS.forEach((section) => {
    const btn = document.querySelector(`[data-view-more="${section.type}"]`);
    if (!btn) return;
    let page = 1;
    btn.addEventListener('click', async () => {
      page += 1;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Loading…';
      try {
        const res = await section.apiFn()({ page, pageSize: 10 });
        const carousel = document.getElementById(section.carousel);
        if (res.posts && res.posts.length) {
          registerCardImpressions(res.posts);
          carousel.insertAdjacentHTML('beforeend', res.posts.map(postCardHtml).join(''));
        }
        if (!res.posts.length || page >= res.totalPages) {
          btn.remove();
        } else {
          btn.disabled = false;
          btn.textContent = originalText;
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = originalText;
        toast("Couldn't load more right now - please try again.");
      }
    });
  });
}

// "Picked for you": posts chosen from what this visitor looked at before
// (kept in their own browser, see js/interests.js) and, when the browser
// shared it, where they are. Quietly absent for a first-time visitor.
async function renderPickedForYou(loc) {
  const host = document.getElementById('pickedForYou');
  if (!host) return;
  const profile = Interests.profile();
  if (Interests.isEmpty() && !loc) return;
  try {
    const res = await Api.suggestions(profile, { lat: loc ? loc.lat : null, lng: loc ? loc.lng : null });
    if (!res.sections.length || !document.getElementById('pickedForYou')) return;
    host.innerHTML = `
      <div class="section-heading"><h2>Picked for you</h2>${Interests.isEmpty() ? '' : '<a href="#" id="clearInterests">Clear what you looked at</a>'}</div>
      ${res.sections.map((s) => `
        <h3 class="picked-title">${escapeHtml(s.title)} <span class="hint">${escapeHtml(s.reason)}</span></h3>
        <div>${renderCarousel(s.posts)}</div>`).join('')}`;
    const clear = document.getElementById('clearInterests');
    if (clear) clear.addEventListener('click', (e) => { e.preventDefault(); Interests.clear(); host.innerHTML = ''; });
  } catch (e) { /* suggestions are a bonus; never break the home page */ }
}

async function renderHomePage() {
  // An explicitly-picked location (via the location picker below) always
  // wins over the browser's auto-detected one, until reset. If neither is
  // available, the server itself picks Brooklyn or London as the default
  // based on which domain the request came in on.
  const custom = getCustomHomeLocation();
  const loc = custom || await getBrowserLocation();
  const data = await Api.home(loc ? { lat: loc.lat, lng: loc.lng, label: custom?.label } : {});
  const c = data.calendar;
  const z = c.zmanim;

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="home-grid">
        <div class="home-main">
          <div style="padding:30px 0 6px">
            <a href="/post" class="btn btn-gold" data-i18n="nav_post">Post an Ad</a>
            <span class="hint" style="margin-inline-start:10px">Lost &amp; Found posts are always free.</span>
          </div>

          <div id="pickedForYou"></div>

          <div class="section-heading">
            <h2 data-i18n="recent_classifieds">Recent Classifieds</h2>
            <a href="/classifieds" data-i18n="view_all_classifieds">View All Classifieds</a>
          </div>
          <div id="classifiedsCarousel">${renderCarousel(data.recentClassifieds)}</div>
          ${data.recentClassifieds.length ? renderSectionFooter(HOME_SECTIONS[0], data.recentClassifieds.length >= 10) : ''}

          <div class="section-heading">
            <h2 data-i18n="recent_listings">Recent Listings</h2>
            <a href="/listings" data-i18n="view_all_listings">View All Listings</a>
          </div>
          <div id="listingsCarousel">${renderCarousel(data.recentListings)}</div>
          ${data.recentListings.length ? renderSectionFooter(HOME_SECTIONS[1], data.recentListings.length >= 10) : ''}

          ${Api.simchasOn() ? `
          <div class="section-heading">
            <h2 data-i18n="recent_simchas">Recent Simchas</h2>
            <a href="/simchas" data-i18n="view_all_simchas">View All Simchas</a>
          </div>
          <div id="simchasCarousel">${renderCarousel(data.recentSimchas)}</div>
          ${data.recentSimchas.length ? renderSectionFooter(HOME_SECTIONS[2], data.recentSimchas.length >= 10) : ''}` : ''}
        </div>

        <aside class="home-sidebar">
          <div class="combo-widget">
            <div id="zmanimLocPicker"></div>
            <div class="combo-widget-top">
              <div><span class="combo-label">${escapeHtml(c.hebrew.display)}</span><span class="combo-sub">${escapeHtml(c.english.display)}</span></div>
              <div><span class="combo-label">${escapeHtml(c.dafYomi.display)}</span><span class="combo-sub">${escapeHtml(c.dafYomi.displayEn)}</span></div>
            </div>
            <div class="combo-zman-row">
              <span><b data-i18n="sunrise">Sunrise</b> ${formatTime(z.sunrise, c.location.tzid)}</span>
              <span><b data-i18n="sof_zman_shma">Sof Zman Shma</b> ${formatTime(z.sofZmanShmaMGA, c.location.tzid)} / ${formatTime(z.sofZmanShma, c.location.tzid)}</span>
              <span><b data-i18n="sof_zman_tfilla">Sof Zman Tfilla</b> ${formatTime(z.sofZmanTfillaMGA, c.location.tzid)} / ${formatTime(z.sofZmanTfilla, c.location.tzid)}</span>
              <span><b data-i18n="chatzot">Chatzos</b> ${formatTime(z.chatzot, c.location.tzid)}</span>
              <span><b data-i18n="shkia">Shkia</b> ${formatTime(z.sunset, c.location.tzid)}</span>
              <span><b data-i18n="tzeit60">Tzeis 60</b> ${formatTime(z.tzeit60, c.location.tzid)}</span>
              <span><b data-i18n="tzeit72">Tzeis 72</b> ${formatTime(z.tzeit72, c.location.tzid)}</span>
            </div>
            <p class="zman-disclaimer">נא להחמיר על הזמנים בכמה דקות.</p>
          </div>
          <div id="weatherWidget"></div>
          ${renderHomeEditorialsTeaser(data.recentEditorials)}
          <div id="sidebarBannerSlot" style="display:none"></div>
        </aside>
      </div>
    </div>
  `;
  I18N.apply();
  setPageTitle(null, 'Community classifieds and business listings. Post a job, sell an item, or find a service.');

  initLocationPicker({
    root: document.getElementById('zmanimLocPicker'),
    storageKey: HOME_LOC_STORAGE,
    label: c.location.label,
    isDefault: c.location.isDefault,
    tzid: c.location.tzid,
    onChange: renderHomePage,
  });

  renderPickedForYou(loc);

  if (typeof renderWeatherWidget === 'function') renderWeatherWidget();
  if (typeof Banners !== 'undefined') Banners.renderSidebar('home', 'sidebarBannerSlot');
  wireViewMoreButtons();
}
