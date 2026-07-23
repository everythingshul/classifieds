function postUrl(post) {
  return `/${post.type === 'simcha' ? 'simchas' : 'classifieds'}/${post.id}`;
}

function categoryLabelFor(post) {
  if (I18N.get() !== 'he') return post.categoryLabel;
  if (post.type === 'simcha') return 'שמחה';
  const def = window.SITE_CONFIG?.categories.find((c) => c.key === post.category);
  return def?.labelHe || post.categoryLabel;
}

function postCardHtml(post) {
  const img = post.images && post.images[0];
  const media = img
    ? `<img class="thumb" src="${img}" alt="">`
    : `<div class="thumb-placeholder">${post.type === 'simcha' ? '&#127881;' : '&#128196;'}</div>`;
  const priceField = post.fields && (post.fields.price !== undefined ? post.fields.price : null);
  const meta = [post.location?.text, post.fields?.simchaDate ? formatDate(new Date(post.fields.simchaDate).getTime()) : null]
    .filter(Boolean)
    .join(' • ');
  return `
    <a class="card ${post.isFeatured ? 'featured' : ''}" href="${postUrl(post)}">
      <div class="card-media">
        ${post.isFeatured ? `<span class="badge-featured">&#9733; Featured</span>` : ''}
        ${media}
      </div>
      <div class="body">
        <span class="cat">${escapeHtml(categoryLabelFor(post))}</span>
        <span class="title">${escapeHtml(post.title)}</span>
        ${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ''}
        ${priceField !== null && priceField !== undefined ? `<span class="price">${formatCents(priceField * 100)}</span>` : ''}
      </div>
    </a>`;
}

function renderCarousel(posts) {
  if (!posts.length) return `<p class="empty-state" data-i18n="no_results">${I18N.t('no_results')}</p>`;
  return `<div class="carousel">${posts.map(postCardHtml).join('')}</div>`;
}

function renderGrid(posts) {
  if (!posts.length) return `<p class="empty-state" data-i18n="no_results">${I18N.t('no_results')}</p>`;
  return `<div class="results-grid">${posts.map(postCardHtml).join('')}</div>`;
}
