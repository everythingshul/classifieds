// Editorials: browse/list page, detail page, and submission form -
// grouped into one file since they're one cohesive feature area.

const EDITORIAL_NEW_DAYS = 7;

function editorialIsNew(publishedAt) {
  return publishedAt && Date.now() - publishedAt < EDITORIAL_NEW_DAYS * 24 * 60 * 60 * 1000;
}

function editorialExcerpt(body, max = 160) {
  const clean = String(body || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

function editorialCardHtml(ed, { large = false } = {}) {
  const cover = ed.images && ed.images[0];
  const isNew = editorialIsNew(ed.publishedAt);
  const badges = `
    ${ed.isFeatured ? `<span class="tag tag-featured" data-i18n="featured">${I18N.t('featured')}</span>` : ''}
    ${isNew ? `<span class="tag tag-new" data-i18n="badge_new">${I18N.t('badge_new')}</span>` : ''}`;
  const byline = `<div class="editorial-card-byline">${I18N.t('by_author')} <b>${escapeHtml(ed.penName)}</b> · ${escapeHtml(formatDate(ed.publishedAt))}</div>`;

  // No cover photo (images are optional) - fill the space the photo would
  // have taken with the title/excerpt directly on the accent background,
  // instead of leaving an empty decorative box above a second copy of the
  // same title.
  if (!cover) {
    return `
      <a class="editorial-card editorial-card-textcover ${large ? 'editorial-card-lg' : ''}" href="/editorials/${ed.id}">
        <div class="editorial-card-img editorial-card-img-placeholder">
          <div class="editorial-card-badges">${badges}</div>
          <h3 class="editorial-card-title">${escapeHtml(ed.title)}</h3>
          <p class="editorial-card-excerpt">${escapeHtml(editorialExcerpt(ed.body, large ? 220 : 110))}</p>
        </div>
        <div class="editorial-card-body editorial-card-body-slim">${byline}</div>
      </a>`;
  }

  return `
    <a class="editorial-card ${large ? 'editorial-card-lg' : ''}" href="/editorials/${ed.id}">
      <div class="editorial-card-img" style="background-image:url('${cover}')"></div>
      <div class="editorial-card-body">
        <div class="editorial-card-badges">${badges}</div>
        <h3 class="editorial-card-title">${escapeHtml(ed.title)}</h3>
        <p class="editorial-card-excerpt">${escapeHtml(editorialExcerpt(ed.body, large ? 220 : 110))}</p>
        ${byline}
      </div>
    </a>`;
}

function editorialPagination(page, totalPages) {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination">';
  for (let p = 1; p <= totalPages; p++) {
    if (p !== 1 && p !== totalPages && Math.abs(p - page) > 2) {
      if (p === page - 3 || p === page + 3) html += '<span>…</span>';
      continue;
    }
    html += `<a href="/editorials?page=${p}" class="${p === page ? 'active' : ''}">${p}</a>`;
  }
  html += '</div>';
  return html;
}

async function renderEditorialsListPage({ query }) {
  const page = parseInt(query.page, 10) || 1;
  const data = await Api.editorials({ page, pageSize: 12 });

  if (data.posts.length) Api.registerEditorialImpressions(data.posts.map((p) => p.id));

  document.getElementById('app').innerHTML = `
    <div class="editorial-hero-band">
      <div class="container">
        <h1 data-i18n="editorials_title">${I18N.t('editorials_title')}</h1>
        <p class="editorial-tagline" data-i18n="editorials_tagline">${I18N.t('editorials_tagline')}</p>
        <a href="/editorials/submit" class="btn btn-gold" data-i18n="write_editorial">${I18N.t('write_editorial')}</a>
      </div>
    </div>
    <div class="container">
      ${data.featured.length ? `
        <h2 data-i18n="featured">${I18N.t('featured')}</h2>
        <div class="editorial-featured-strip">
          ${data.featured.map((ed) => editorialCardHtml(ed, { large: true })).join('')}
        </div>
      ` : ''}
      <h2 data-i18n="latest">${I18N.t('latest')}</h2>
      ${data.posts.length
        ? `<div class="editorial-grid">${data.posts.map((ed) => editorialCardHtml(ed)).join('')}</div>`
        : `<p class="empty-state" data-i18n="no_results">${I18N.t('no_results')}</p>`}
      ${editorialPagination(data.page, data.totalPages)}
    </div>
  `;
  I18N.apply();
  setPageTitle(I18N.t('editorials_title'), 'Community editorials and perspectives on JListings.');
}

function videoEmbedUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (/youtube\.com$/i.test(u.hostname.replace(/^www\./, '')) || u.hostname.replace(/^www\./, '') === 'youtube.com') {
      const id = u.searchParams.get('v') || u.pathname.split('/').pop();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.replace(/^www\./, '') === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.replace(/^www\./, '') === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function editorialCommentHtml(c) {
  return `
    <div class="editorial-comment">
      <div class="editorial-comment-head"><b>${escapeHtml(c.penName)}</b><span class="hint">${escapeHtml(formatDate(c.createdAt))}</span></div>
      <p>${escapeHtml(c.body)}</p>
    </div>`;
}

async function renderEditorialDetailPage(id) {
  const ed = await Api.editorialDetail(id);
  Api.registerEditorialImpressions([id]);
  Api.registerEditorialClicks([id]);

  const gallery = ed.images.length
    ? `<div class="detail-gallery">
        <div class="detail-gallery-main"><img src="${ed.images[0]}" alt="" id="galleryMain"></div>
        ${ed.images.length > 1 ? `<div class="detail-gallery-thumbs">${ed.images.map((src, i) => `<img src="${src}" alt="" class="${i === 0 ? 'active' : ''}" data-src="${src}">`).join('')}</div>` : ''}
      </div>`
    : '';

  const videoEmbeds = (ed.videoUrls || [])
    .map(videoEmbedUrl)
    .filter(Boolean)
    .map((src) => `<div class="editorial-video-embed"><iframe src="${src}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`)
    .join('');

  const bodyParagraphs = String(ed.body || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const shareUrl = window.location.href;
  const shareRow = renderShareRow(shareUrl, ed.title);

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="editorial-detail detail-anim">
        <div class="editorial-topline">
          ${ed.isFeatured ? `<span class="tag tag-featured">${I18N.t('featured')}</span>` : ''}
          ${editorialIsNew(ed.publishedAt) ? `<span class="tag tag-new">${I18N.t('badge_new')}</span>` : ''}
        </div>
        <h1 class="editorial-detail-title">${escapeHtml(ed.title)}</h1>
        <div class="editorial-detail-byline">${I18N.t('by_author')} <b>${escapeHtml(ed.penName)}</b> · ${escapeHtml(formatDate(ed.publishedAt))}</div>
        ${gallery}
        <div class="editorial-body">${bodyParagraphs}</div>
        ${videoEmbeds}
        ${shareRow}

        <hr style="border:none;border-top:1px solid var(--border);margin:28px 0">
        <h2 data-i18n="comments">${I18N.t('comments')} (${ed.comments.length})</h2>
        <div id="commentsList">
          ${ed.comments.length ? ed.comments.map(editorialCommentHtml).join('') : `<p class="hint" data-i18n="no_comments_yet">${I18N.t('no_comments_yet')}</p>`}
        </div>

        <form id="commentForm" class="editorial-comment-form">
          <div class="form-cols">
            <div class="form-row"><label data-i18n="field_pen_name">${I18N.t('field_pen_name')}</label><input type="text" name="penName" required maxlength="60"></div>
            <div class="form-row"><label data-i18n="field_email">${I18N.t('field_email')}</label><input type="email" name="email" required></div>
          </div>
          <div class="form-row"><textarea name="body" rows="3" required maxlength="2000" placeholder="${I18N.t('comments')}…"></textarea></div>
          <div id="commentMsg" class="hint"></div>
          <button class="btn btn-sm" type="submit" data-i18n="post_comment">${I18N.t('post_comment')}</button>
        </form>
      </div>
    </div>
  `;
  I18N.apply();
  setPageTitle(ed.title, editorialExcerpt(ed.body, 160));
  wireShareRow();

  const thumbs = document.querySelectorAll('.detail-gallery-thumbs img');
  const mainImg = document.getElementById('galleryMain');
  thumbs.forEach((t) => {
    t.addEventListener('click', () => {
      mainImg.src = t.dataset.src;
      thumbs.forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  document.getElementById('commentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('commentMsg');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await Api.submitEditorialComment(id, { penName: fd.get('penName'), email: fd.get('email'), body: fd.get('body') });
      msg.textContent = I18N.t('comment_pending_notice');
      msg.style.color = 'var(--success)';
      e.target.reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = 'var(--danger)';
    } finally {
      btn.disabled = false;
    }
  });
}

async function renderEditorialSubmitPage() {
  const [instructions] = await Promise.all([Api.editorialInstructions()]);
  let files = [];
  let submitted = false;

  function render() {
    const root = document.getElementById('app');
    if (submitted) {
      root.innerHTML = `
        <div class="container" style="max-width:560px;padding:60px 0;text-align:center">
          <h1 data-i18n="editorial_submitted_title">${I18N.t('editorial_submitted_title')}</h1>
          <p data-i18n="editorial_submitted_body">${I18N.t('editorial_submitted_body')}</p>
          <a href="/editorials" class="btn">${I18N.t('editorials_title')}</a>
        </div>`;
      I18N.apply();
      return;
    }

    root.innerHTML = `
      <div class="container" style="max-width:680px">
        <h1 data-i18n="write_editorial">${I18N.t('write_editorial')}</h1>
        ${instructions.html ? `<div class="editorial-instructions">${instructions.html}</div>` : ''}
        <form id="editorialForm">
          <div class="form-row"><label data-i18n="field_title">${I18N.t('field_title')}</label><input type="text" name="title" required maxlength="150"><div class="char-counter" id="titleCounter"></div></div>
          <div class="form-row"><label data-i18n="field_body">${I18N.t('field_body')}</label><textarea name="body" rows="14" required maxlength="20000"></textarea><div class="char-counter" id="bodyCounter"></div></div>

          <div class="form-row"><label data-i18n="field_images">${I18N.t('field_images')} <span class="hint">(${'optional, up to 6'})</span></label><input type="file" id="f_images" accept="image/png,image/jpeg,image/webp" multiple><div id="imagePreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div></div>

          <div class="form-row">
            <label data-i18n="field_videos">${I18N.t('field_videos')}</label>
            <div class="hint" data-i18n="field_video_hint" style="margin-bottom:4px">${I18N.t('field_video_hint')}</div>
            <input type="text" name="video1" placeholder="https://youtube.com/watch?v=..." style="margin-bottom:6px">
            <input type="text" name="video2" placeholder="https://youtube.com/watch?v=..." style="margin-bottom:6px">
            <input type="text" name="video3" placeholder="https://youtube.com/watch?v=...">
          </div>

          <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
          <h3 data-i18n="never_public_notice" style="font-size:.86rem;font-weight:600;color:var(--ink-soft)">${I18N.t('never_public_notice')}</h3>
          <div class="form-cols">
            <div class="form-row"><label data-i18n="field_pen_name">${I18N.t('field_pen_name')}</label><input type="text" name="penName" required maxlength="60"><span class="hint" data-i18n="field_pen_name_hint">${I18N.t('field_pen_name_hint')}</span></div>
            <div class="form-row"><label data-i18n="field_email">${I18N.t('field_email')}</label><input type="email" name="posterEmail" required></div>
          </div>
          <div class="form-cols">
            <div class="form-row"><label data-i18n="field_first_name">${I18N.t('field_first_name')}</label><input type="text" name="posterFirstName" required maxlength="60"></div>
            <div class="form-row"><label data-i18n="field_last_name">${I18N.t('field_last_name')}</label><input type="text" name="posterLastName" required maxlength="60"></div>
          </div>
          <div class="form-row"><label data-i18n="field_phone">${I18N.t('field_phone')} <span class="hint" data-i18n="field_phone_optional">${I18N.t('field_phone_optional')}</span></label><input type="tel" name="posterPhone"></div>
          <div class="form-row"><label data-i18n="field_notes_admin">${I18N.t('field_notes_admin')} <span class="hint" data-i18n="field_notes_admin_hint">${I18N.t('field_notes_admin_hint')}</span></label><textarea name="notesToAdmin" rows="2" maxlength="1000"></textarea></div>

          <div id="submitError" class="error-list" style="display:none"></div>
          <button class="btn btn-gold" type="submit" data-i18n="submit_editorial">${I18N.t('submit_editorial')}</button>
        </form>
      </div>`;
    I18N.apply();

    const titleInput = document.querySelector('input[name="title"]');
    const bodyInput = document.querySelector('textarea[name="body"]');
    const updateCounters = () => {
      document.getElementById('titleCounter').textContent = `${titleInput.value.length} / ${titleInput.maxLength}`;
      document.getElementById('bodyCounter').textContent = `${bodyInput.value.length} / ${bodyInput.maxLength}`;
    };
    titleInput.addEventListener('input', updateCounters);
    bodyInput.addEventListener('input', updateCounters);
    updateCounters();

    const fileInput = document.getElementById('f_images');
    fileInput.addEventListener('change', () => {
      files = Array.from(fileInput.files).slice(0, 6);
      const preview = document.getElementById('imagePreview');
      preview.innerHTML = '';
      files.forEach((f) => {
        const img = document.createElement('img');
        img.style.cssText = 'width:70px;height:70px;object-fit:cover';
        img.src = URL.createObjectURL(f);
        preview.appendChild(img);
      });
    });

    document.getElementById('editorialForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const box = document.getElementById('submitError');
      box.style.display = 'none';
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const fd = new FormData(e.target);
        const videoUrls = [fd.get('video1'), fd.get('video2'), fd.get('video3')].filter((v) => v && v.trim());
        fd.set('videoUrls', JSON.stringify(videoUrls));
        fd.delete('video1');
        fd.delete('video2');
        fd.delete('video3');
        files.forEach((f) => fd.append('images', f));
        const result = await Api.submitEditorial(fd);
        submitted = true;
        render();
      } catch (err) {
        box.style.display = 'block';
        box.innerHTML = (err.data?.details || [err.message]).map((m) => `<div>${escapeHtml(m)}</div>`).join('');
        btn.disabled = false;
      }
    });
  }

  render();
}
