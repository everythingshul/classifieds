function postUrl(post) {
  return `/${post.type === 'simcha' ? 'simchas' : 'classifieds'}/${post.id}`;
}

function categoryLabelFor(post) {
  if (I18N.get() !== 'he') return post.categoryLabel;
  if (post.type === 'simcha') return 'שמחה';
  const def = window.SITE_CONFIG?.categories.find((c) => c.key === post.category);
  return def?.labelHe || post.categoryLabel;
}

// Cards show everything needed to judge relevance at a glance - no image, no
// contact info (that's a click-through-to-contact action on the detail page).
function cardMetaLine(post) {
  const f = post.fields || {};
  const parts = [];
  if (f.jobType) parts.push(String(f.jobType).replace('_', ' '));
  if (f.payAmount) parts.push(`${formatCents(f.payAmount * 100)}/${f.payPeriod}`);
  if (f.lostOrFound) parts.push(f.lostOrFound.toUpperCase());
  if (f.experience) parts.push(f.experience);
  if (post.location?.text) parts.push(post.location.text);
  return parts.filter(Boolean).join(' • ');
}

function postCardHtml(post) {
  const priceField = post.fields && (post.fields.price !== undefined ? post.fields.price : null);
  const meta = cardMetaLine(post);
  return `
    <a class="card ${post.isFeatured ? 'featured' : ''}" href="${postUrl(post)}">
      <div class="body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
          <span class="cat">${escapeHtml(categoryLabelFor(post))}</span>
          ${post.isFeatured ? `<span class="badge-featured" style="position:static;margin:0">&#9733;</span>` : ''}
        </div>
        <span class="title">${escapeHtml(post.title)}</span>
        ${post.description ? `<p class="card-desc">${escapeHtml(post.description)}</p>` : ''}
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
