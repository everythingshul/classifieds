const SMS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const WHATSAPP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.76.46 3.48 1.34 5L2 22l5.14-1.35a9.96 9.96 0 0 0 4.9 1.25h.01c5.52 0 10-4.48 10-10s-4.48-9.9-10.01-9.9zm0 18.1a8.3 8.3 0 0 1-4.24-1.16l-.3-.18-3.05.8.82-2.98-.2-.3a8.26 8.26 0 0 1-1.27-4.38c0-4.58 3.73-8.3 8.31-8.3 4.58 0 8.3 3.72 8.3 8.3 0 4.58-3.72 8.2-8.37 8.2zm4.55-6.2c-.25-.12-1.47-.72-1.7-.81-.23-.08-.4-.12-.56.13-.17.25-.65.81-.8.97-.14.17-.3.19-.55.06-.25-.12-1.05-.39-2-1.23a7.5 7.5 0 0 1-1.38-1.72c-.15-.25-.02-.38.11-.5.11-.11.25-.3.37-.44.12-.15.16-.25.24-.42.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08s.9 2.41 1.02 2.58c.12.17 1.76 2.69 4.27 3.77.6.26 1.06.41 1.43.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.16-.48-.28z"/></svg>';

async function renderDetailPage(id, type) {
  const post = type === 'simcha' ? await Api.simchaDetail(id) : type === 'listing' ? await Api.listingDetail(id) : await Api.classifiedDetail(id);
  const isBookmarked = Bookmarks.has(type, id);
  Api.registerImpressions([id]);
  Api.registerClicks([id]);

  const fieldRows = [];
  if (post.taxonomyId) {
    const tax = window.SITE_CONFIG?.taxonomies?.find((t) => String(t.id) === String(post.taxonomyId));
    if (tax) fieldRows.push(['Category', tax.name]);
  }
  if (post.fields?.jobType) fieldRows.push(['Job Type', post.fields.jobType.replace('_', ' ')]);
  if (post.fields?.payAmount !== undefined && post.fields?.payAmount !== null) fieldRows.push(['Pay', `${formatMoney(post.fields.payAmount * 100, post.fields.payCurrency)} / ${post.fields.payPeriod}`]);
  else if (post.fields?.payAmountText) fieldRows.push(['Pay', post.fields.payAmountText]);
  if (post.fields?.experience) fieldRows.push(['Experience', post.fields.experience]);
  if (post.fields?.lostOrFound) fieldRows.push(['Status', post.fields.lostOrFound.toUpperCase()]);
  const priceDisplay = formatPriceField(post.fields?.price, post.fields?.priceText, post.fields?.currency);
  if (priceDisplay) fieldRows.push(['Price', priceDisplay]);
  if (post.location?.text) fieldRows.push([I18N.t('location'), post.location.text]);

  const contactButtons = [];
  if (post.contact?.phone) {
    const phone = post.contact.phone;
    const numberLabel = `${escapeHtml(phone.display)}${phone.ext ? ' x' + escapeHtml(phone.ext) : ''}`;
    const parts = [];
    // The number itself: a Call button when supported, otherwise just shown
    // as text (it's still worth displaying even if this number is
    // text/WhatsApp-only) - then small icon buttons for whichever other
    // ways it can be reached.
    parts.push(phone.tel
      ? `<a class="btn contact-link" data-click-type="phone" href="${phone.tel}">${I18N.t('call')} ${numberLabel}</a>`
      : `<span class="contact-phone-label">${numberLabel}</span>`);
    if (phone.sms) parts.push(`<a class="btn-icon-contact contact-link" data-click-type="sms" href="${phone.sms}" title="Text/SMS" aria-label="Text/SMS">${SMS_ICON}</a>`);
    if (phone.whatsapp) parts.push(`<a class="btn-icon-contact contact-link" data-click-type="whatsapp" href="${phone.whatsapp}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${WHATSAPP_ICON}</a>`);
    contactButtons.push(`<div class="contact-phone-row">${parts.join('')}</div>`);
  }
  if (post.contact?.email) contactButtons.push(`<a class="btn btn-outline contact-link" data-click-type="email" href="${post.contact.email.mailto}">${I18N.t('email')} ${escapeHtml(post.contact.email.display)}</a>`);
  if (post.contact?.url) contactButtons.push(`<a class="btn btn-outline contact-link" data-click-type="website" href="${post.contact.url.href}" target="_blank" rel="noopener">${I18N.t('website')}</a>`);
  const hasContact = contactButtons.length > 0;

  const images = post.images || [];
  const gallery = images.length
    ? `<div class="detail-gallery">
        <div class="detail-gallery-main"><img src="${images[0]}" alt="" id="galleryMain"></div>
        ${images.length > 1 ? `<div class="detail-gallery-thumbs">${images.map((src, i) => `<img src="${src}" alt="" loading="lazy" class="${i === 0 ? 'active' : ''}" data-src="${src}">`).join('')}</div>` : ''}
      </div>`
    : '';

  const shareUrl = window.location.href;
  const shareText = `${post.title} - ${post.categoryLabel}`;
  const shareRow = renderShareRow(shareUrl, shareText);
  const isExpired = post.status === 'expired';

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="detail-grid detail-anim ${isExpired ? 'is-expired' : ''}">
        ${isExpired ? '<div class="detail-expired-stamp">Expired</div>' : ''}
        <div class="detail-main">
          <div class="detail-topline">
            <span class="tag tag-lg">${escapeHtml(post.categoryLabel)}</span>
            ${post.isFeatured ? '<span class="badge-featured" style="position:static">Featured</span>' : ''}
            <span class="detail-posted">${I18N.t('posted')} ${escapeHtml(formatRelativeTime(post.publishedAt))}</span>
          </div>
          <h1 class="detail-title">${escapeHtml(post.title)}</h1>
          ${gallery}
          <p class="detail-desc">${escapeHtml(post.description || '')}</p>
          ${fieldRows.length ? `<ul class="detail-meta-list">${fieldRows.map(([k, v]) => `<li><span>${escapeHtml(String(k))}</span><span>${escapeHtml(String(v))}</span></li>`).join('')}</ul>` : ''}
          ${shareRow}
        </div>
        <div class="contact-card">
          ${type === 'simcha' ? `
          <div style="display:flex;gap:8px">
            <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" id="bookmarkBtn"><span id="bookmarkLabel">${I18N.t(isBookmarked ? 'bookmarked' : 'bookmark')}</span></button>
            <button class="report-link" id="reportBtn" data-i18n="report">Report</button>
          </div>` : `
          <h3 data-i18n="contact">Contact</h3>
          ${hasContact ? contactButtons.join('') : `<p class="sub">${isExpired ? 'No contact available on expired posts.' : 'No contact info provided.'}</p>`}
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" id="bookmarkBtn"><span id="bookmarkLabel">${I18N.t(isBookmarked ? 'bookmarked' : 'bookmark')}</span></button>
            <button class="report-link" id="reportBtn" data-i18n="report">Report</button>
          </div>
          ${isExpired ? '' : `
          <details style="margin-top:16px">
            <summary style="cursor:pointer;font-weight:600;font-size:.88rem">Boost or Feature this listing</summary>
            <form id="boostForm" style="margin-top:10px">
              <div class="field"><label>Email used to post</label><input type="email" name="email" required></div>
              <button class="btn btn-sm" type="submit" name="action" value="boost">Boost to Top</button>
              <button class="btn btn-sm btn-gold" type="submit" name="action" value="strike">Make Featured</button>
            </form>
            <div id="boostCheckoutContainer" style="margin-top:12px"></div>
          </details>`}`}
          <div id="sidebarBannerSlot" style="display:none;margin-top:14px"></div>
        </div>
      </div>
    </div>
  `;
  I18N.apply();
  setPageTitle(`${post.title} - ${post.categoryLabel}`, post.description ? post.description.slice(0, 160) : `${post.categoryLabel} on JListings.`);
  if (typeof Banners !== 'undefined') Banners.renderSidebar(type === 'simcha' ? 'simchas' : type === 'listing' ? 'listings' : 'classifieds', 'sidebarBannerSlot');

  document.getElementById('bookmarkBtn').addEventListener('click', () => {
    const active = Bookmarks.toggle(type, id);
    const btn = document.getElementById('bookmarkBtn');
    btn.classList.toggle('active', active);
    document.getElementById('bookmarkLabel').textContent = I18N.t(active ? 'bookmarked' : 'bookmark');
    btn.classList.remove('pop');
    void btn.offsetWidth;
    btn.classList.add('pop');
  });

  document.getElementById('reportBtn').addEventListener('click', async () => {
    const reason = prompt('Why are you reporting this post? (optional)');
    if (reason === null) return;
    await Api.report(id, { reason, reporterEmail: null });
    toast('Report sent. Thank you.');
  });

  wireShareRow();

  document.querySelectorAll('.contact-link').forEach((el) => {
    el.addEventListener('click', () => Api.registerClicks([id]));
  });

  const thumbs = document.querySelectorAll('.detail-gallery-thumbs img');
  const mainImg = document.getElementById('galleryMain');
  thumbs.forEach((t) => {
    t.addEventListener('click', () => {
      if (t.dataset.src === mainImg.src) return;
      mainImg.classList.add('fading');
      setTimeout(() => {
        mainImg.src = t.dataset.src;
        mainImg.classList.remove('fading');
      }, 150);
      thumbs.forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  const boostForm = document.getElementById('boostForm');
  if (boostForm) {
    boostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const action = e.submitter?.value || 'boost';
      const email = new FormData(e.target).get('email');
      try {
        const result = action === 'boost' ? await Api.boost(id, { email }) : await Api.strike(id, { email });
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
          return;
        }
        if (result.clientSecret) {
          boostForm.style.display = 'none';
          const checkoutEl = document.getElementById('boostCheckoutContainer');
          await mountEmbeddedCheckout(checkoutEl, result.clientSecret);
          checkoutEl.classList.add('show');
        } else {
          toast('Done!');
          Router.navigate(window.location.pathname);
        }
      } catch (err) {
        toast(err.message);
      }
    });
  }
}
