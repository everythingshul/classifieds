async function renderHomePage() {
  const loc = await getBrowserLocation();
  const data = await Api.home(loc ? { lat: loc.lat, lng: loc.lng } : {});
  const c = data.calendar;
  const z = c.zmanim;

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div style="padding:30px 0 6px">
        <h1>${escapeHtml(window.SITE_CONFIG?.siteName || 'Everything Shul Classifieds')}</h1>
        <p class="sub" style="color:var(--ink-soft)">${escapeHtml(c.location.label)}${c.location.isDefault ? ' (default — allow location access for your local zmanim)' : ''}</p>
        <a href="/post" class="btn btn-gold" data-i18n="nav_post">Post an Ad</a>
      </div>

      <div class="widgets-grid">
        <div class="widget-card">
          <h3 data-i18n="hebrew_date">Hebrew Date</h3>
          <div class="big">${escapeHtml(c.hebrew.display)}</div>
          <div class="sub">${escapeHtml(c.english.display)}</div>
        </div>
        <div class="widget-card">
          <h3 data-i18n="daf_yomi">Daf Yomi</h3>
          <div class="big">${escapeHtml(c.dafYomi.display)}</div>
          <div class="sub">${escapeHtml(c.dafYomi.displayEn)}</div>
        </div>
        <div class="widget-card">
          <h3 data-i18n="zmanim_today">Today's Zmanim</h3>
          <ul class="zman-list">
            <li><span data-i18n="sunrise">Sunrise</span><span>${formatTime(z.sunrise)}</span></li>
            <li><span data-i18n="sunset">Sunset</span><span>${formatTime(z.sunset)}</span></li>
            <li><span data-i18n="tzeit">Tzeit Hakochavim</span><span>${formatTime(z.tzeit72)}</span></li>
            <li><span data-i18n="chatzot">Chatzot</span><span>${formatTime(z.chatzot)}</span></li>
            <li><span data-i18n="sof_zman_shma">Sof Zman Shma</span><span>${formatTime(z.sofZmanShma)}</span></li>
            <li><span data-i18n="plag_hamincha">Plag HaMincha</span><span>${formatTime(z.plagHaMincha)}</span></li>
          </ul>
        </div>
      </div>

      <div class="section-heading">
        <h2 data-i18n="recent_classifieds">Recent Classifieds</h2>
        <a href="/classifieds" data-i18n="view_all_classifieds">View All Classifieds</a>
      </div>
      ${renderCarousel(data.recentClassifieds)}

      <div class="section-heading">
        <h2 data-i18n="recent_simchas">Recent Simchas</h2>
        <a href="/simchas" data-i18n="view_all_simchas">View All Simchas</a>
      </div>
      ${renderCarousel(data.recentSimchas)}
    </div>
  `;
  I18N.apply();
}
