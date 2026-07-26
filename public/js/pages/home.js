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

      <div class="combo-widget">
        <div class="combo-widget-top">
          <div><span class="combo-label">${escapeHtml(c.hebrew.display)}</span><span class="combo-sub">${escapeHtml(c.english.display)}</span></div>
          <div><span class="combo-label">${escapeHtml(c.dafYomi.display)}</span><span class="combo-sub">${escapeHtml(c.dafYomi.displayEn)}</span></div>
        </div>
        <div class="combo-zman-row">
          <span><b data-i18n="sunrise">Sunrise</b> ${formatTime(z.sunrise)}</span>
          <span><b data-i18n="sof_zman_shma">Sof Zman Shma</b> ${formatTime(z.sofZmanShmaMGA)} / ${formatTime(z.sofZmanShma)}</span>
          <span><b data-i18n="sof_zman_tfilla">Sof Zman Tfilla</b> ${formatTime(z.sofZmanTfillaMGA)} / ${formatTime(z.sofZmanTfilla)}</span>
          <span><b data-i18n="chatzot">Chatzos</b> ${formatTime(z.chatzot)}</span>
          <span><b data-i18n="shkia">Shkia</b> ${formatTime(z.sunset)}</span>
          <span><b data-i18n="tzeit60">Tzeis 60</b> ${formatTime(z.tzeit60)}</span>
          <span><b data-i18n="tzeit72">Tzeis 72</b> ${formatTime(z.tzeit72)}</span>
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
