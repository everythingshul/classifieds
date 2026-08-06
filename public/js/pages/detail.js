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
  if (post.contact?.phone) contactButtons.push(`<a class="btn contact-link" data-click-type="phone" href="${post.contact.phone.tel}">${I18N.t('call')} ${escapeHtml(post.contact.phone.display)}${post.contact.phone.ext ? ' x' + escapeHtml(post.contact.phone.ext) : ''}</a>`);
  if (post.contact?.email) contactButtons.push(`<a class="btn btn-outline contact-link" data-click-type="email" href="${post.contact.email.mailto}">${I18N.t('email')} ${escapeHtml(post.contact.email.display)}</a>`);
  if (post.contact?.url) contactButtons.push(`<a class="btn btn-outline contact-link" data-click-type="website" href="${post.contact.url.href}" target="_blank" rel="noopener">${I18N.t('website')}</a>`);
  const hasContact = contactButtons.length > 0;

  const images = post.images || [];
  const gallery = images.length
    ? `<div class="detail-gallery">
        <div class="detail-gallery-main"><img src="${images[0]}" alt="" id="galleryMain"></div>
        ${images.length > 1 ? `<div class="detail-gallery-thumbs">${images.map((src, i) => `<img src="${src}" alt="" class="${i === 0 ? 'active' : ''}" data-src="${src}">`).join('')}</div>` : ''}
      </div>`
    : '';

  const shareUrl = window.location.href;
  const shareText = `${post.title} - ${post.categoryLabel}`;
  const shareRow = `
    <div class="share-row">
      <span class="hint">Share:</span>
      <a href="mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareUrl)}" title="Share by email">Email</a>
      <a href="sms:?&body=${encodeURIComponent(`${shareText} ${shareUrl}`)}" title="Share by text message">SMS</a>
      <a href="https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}" target="_blank" rel="noopener" title="Share on WhatsApp">WhatsApp</a>
      <button type="button" id="copyLinkBtn" title="Copy link">Copy Link</button>
    </div>`;

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="detail-grid detail-anim">
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
          ${hasContact ? contactButtons.join('') : '<p class="sub">No contact info provided.</p>'}
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" id="bookmarkBtn"><span id="bookmarkLabel">${I18N.t(isBookmarked ? 'bookmarked' : 'bookmark')}</span></button>
            <button class="report-link" id="reportBtn" data-i18n="report">Report</button>
          </div>
          <details style="margin-top:16px">
            <summary style="cursor:pointer;font-weight:600;font-size:.88rem">Boost or Feature this listing</summary>
            <form id="boostForm" style="margin-top:10px">
              <div class="field"><label>Email used to post</label><input type="email" name="email" required></div>
              <button class="btn btn-sm" type="submit" name="action" value="boost">Boost to Top</button>
              <button class="btn btn-sm btn-gold" type="submit" name="action" value="strike">Make Featured</button>
            </form>
            <div id="boostCheckoutContainer" style="margin-top:12px"></div>
          </details>`}
        </div>
      </div>
    </div>
  `;
  I18N.apply();
  setPageTitle(`${post.title} - ${post.categoryLabel}`, post.description ? post.description.slice(0, 160) : `${post.categoryLabel} on JListings.`);

  document.getElementById('bookmarkBtn').addEventListener('click', () => {
    const active = Bookmarks.toggle(type, id);
    document.getElementById('bookmarkBtn').classList.toggle('active', active);
    document.getElementById('bookmarkLabel').textContent = I18N.t(active ? 'bookmarked' : 'bookmark');
  });

  document.getElementById('reportBtn').addEventListener('click', async () => {
    const reason = prompt('Why are you reporting this post? (optional)');
    if (reason === null) return;
    await Api.report(id, { reason, reporterEmail: null });
    toast('Report sent. Thank you.');
  });

  document.getElementById('copyLinkBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied!');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Link copied!');
    }
  });

  document.querySelectorAll('.contact-link').forEach((el) => {
    el.addEventListener('click', () => Api.registerClicks([id]));
  });

  const thumbs = document.querySelectorAll('.detail-gallery-thumbs img');
  const mainImg = document.getElementById('galleryMain');
  thumbs.forEach((t) => {
    t.addEventListener('click', () => {
      mainImg.src = t.dataset.src;
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
          await mountEmbeddedCheckout(document.getElementById('boostCheckoutContainer'), result.clientSecret);
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
