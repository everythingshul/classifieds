async function renderDetailPage(id, type) {
  const post = type === 'simcha' ? await Api.simchaDetail(id) : await Api.classifiedDetail(id);
  const isBookmarked = Bookmarks.has(type, id);

  const fieldRows = [];
  if (post.fields?.jobType) fieldRows.push(['Job Type', post.fields.jobType.replace('_', ' ')]);
  if (post.fields?.payAmount) fieldRows.push(['Pay', `${formatCents(post.fields.payAmount * 100)} / ${post.fields.payPeriod}`]);
  if (post.fields?.experience) fieldRows.push(['Experience', post.fields.experience]);
  if (post.fields?.lostOrFound) fieldRows.push(['Status', post.fields.lostOrFound.toUpperCase()]);
  if (post.fields?.price !== undefined && post.fields?.price !== null) fieldRows.push(['Price', formatCents(post.fields.price * 100)]);
  if (post.fields?.simchaDate) fieldRows.push(['Date', formatDate(new Date(post.fields.simchaDate).getTime())]);
  if (post.location?.text) fieldRows.push([I18N.t('location'), post.location.text]);
  fieldRows.push([I18N.t('posted'), formatDate(post.publishedAt)]);
  fieldRows.push([I18N.t('views'), post.viewCount]);

  const contactButtons = [];
  if (post.contact?.phone) contactButtons.push(`<a class="btn" href="${post.contact.phone.tel}">&#128222; ${I18N.t('call')} ${escapeHtml(post.contact.phone.display)}${post.contact.phone.ext ? ' x' + escapeHtml(post.contact.phone.ext) : ''}</a>`);
  if (post.contact?.email) contactButtons.push(`<a class="btn btn-outline" href="${post.contact.email.mailto}">&#9993; ${I18N.t('email')}</a>`);
  if (post.contact?.url) contactButtons.push(`<a class="btn btn-outline" href="${post.contact.url.href}" target="_blank" rel="noopener">&#127760; ${I18N.t('website')}</a>`);

  const images = post.images && post.images.length ? post.images.map((i) => `<img src="${i}" alt="">`).join('') : '';

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="detail-grid">
        <div>
          <span class="tag">${escapeHtml(post.categoryLabel)}</span>
          <h1>${escapeHtml(post.title)}</h1>
          ${images ? `<div class="detail-images">${images}</div>` : ''}
          <p style="white-space:pre-wrap">${escapeHtml(post.description || '')}</p>
          <ul class="detail-meta-list">
            ${fieldRows.map(([k, v]) => `<li><span>${escapeHtml(String(k))}</span><span>${escapeHtml(String(v))}</span></li>`).join('')}
          </ul>
        </div>
        <div class="contact-card">
          <h3 data-i18n="contact">Contact</h3>
          ${contactButtons.join('') || '<p class="sub">No contact info provided.</p>'}
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" id="bookmarkBtn">&#9733; <span id="bookmarkLabel">${I18N.t(isBookmarked ? 'bookmarked' : 'bookmark')}</span></button>
            <button class="report-link" id="reportBtn" data-i18n="report">Report</button>
          </div>
          ${type === 'classified' ? `
          <details style="margin-top:16px">
            <summary style="cursor:pointer;font-weight:600;font-size:.88rem">Boost or Feature this listing</summary>
            <form id="boostForm" style="margin-top:10px">
              <div class="field"><label>Email used to post</label><input type="email" name="email" required></div>
              <button class="btn btn-sm" type="submit" name="action" value="boost">Boost to Top</button>
              <button class="btn btn-sm btn-gold" type="submit" name="action" value="strike">Make Featured</button>
            </form>
          </details>` : ''}
        </div>
      </div>
    </div>
  `;
  I18N.apply();

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

  const boostForm = document.getElementById('boostForm');
  if (boostForm) {
    boostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const action = e.submitter?.value || 'boost';
      const email = new FormData(e.target).get('email');
      try {
        const result = action === 'boost' ? await Api.boost(id, { email }) : await Api.strike(id, { email });
        if (result.checkoutUrl) window.location.href = result.checkoutUrl;
        else { toast('Done!'); Router.navigate(window.location.pathname); }
      } catch (err) {
        toast(err.message);
      }
    });
  }
}
