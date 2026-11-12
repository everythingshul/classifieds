// Mirrors the server's availableTopics() (services/emailDigest.js) using the
// same category config already loaded into window.SITE_CONFIG at boot -
// avoids a second network round trip just to list the same categories
// every other page on the site already has in hand.
function subscriptionTopicGroups() {
  const cfg = window.SITE_CONFIG;
  const heb = I18N.get() === 'he';
  return [
    { key: 'classifieds', label: 'Classifieds', topics: (cfg.categories || []).map((c) => ({ value: `classified:${c.key}`, label: heb && c.labelHe ? c.labelHe : c.label })) },
    ...(cfg.simchasEnabled ? [{ key: 'simchas', label: 'Simchas', topics: [{ value: 'simcha', label: heb ? 'שמחות' : 'Simchas' }] }] : []),
    { key: 'editorials', label: 'Editorials', topics: [{ value: 'editorial', label: heb ? 'מאמרים' : 'Editorials' }] },
  ].filter((g) => g.topics.length);
}

function hourOptionsHtml(selected) {
  return Array.from({ length: 24 }, (_, h) => {
    const label = new Date(2000, 0, 1, h).toLocaleTimeString(I18N.get() === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' });
    return `<option value="${h}" ${h === selected ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

async function renderSubscribePage(params) {
  const manageToken = params.query.manage || null;
  let existing = null;
  if (manageToken) {
    try {
      existing = await Api.subscriptionManage(manageToken);
    } catch (e) {
      document.getElementById('app').innerHTML = `<div class="container" style="padding-top:40px;padding-bottom:40px;max-width:560px"><p class="error-list">This preferences link is invalid or has expired. <a href="/subscribe">Start a new subscription</a> instead.</p></div>`;
      setPageTitle('Email Updates');
      return;
    }
  }

  const groups = subscriptionTopicGroups();
  const selected = new Set(existing ? existing.categories : []);
  const sendHour = existing ? existing.sendHour : 8;

  document.getElementById('app').innerHTML = `
    <div class="container" style="padding-top:30px;padding-bottom:60px;max-width:640px">
      <div class="page-header">
        <h1 data-i18n="subscribe_title">Daily Email Updates</h1>
        <p class="hint" data-i18n="subscribe_tagline">Pick what you want to hear about and when - one short email a day, only when there's something new.</p>
      </div>
      <form id="subscribeForm" class="form-card">
        ${existing ? `
          <div class="form-row"><label data-i18n="field_email">Email</label><input type="email" value="${escapeHtml(existing.email)}" disabled></div>
        ` : `
          <div class="form-row"><label data-i18n="field_email">Email</label><input type="email" id="subEmail" required></div>
        `}
        <div class="form-row">
          <label data-i18n="subscribe_time_label">What time should it arrive?</label>
          <select id="subHour">${hourOptionsHtml(sendHour)}</select>
        </div>
        <div class="form-row">
          <label data-i18n="subscribe_topics_label">What do you want to follow?</label>
          ${groups.map((g) => `
            <h4 style="margin:10px 0 4px">${escapeHtml(g.label)}</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:4px 10px">
              ${g.topics.map((t) => `
                <label class="addon-row" style="margin:0;padding:4px 0;border:none">
                  <input type="checkbox" name="topic" value="${t.value}" ${selected.has(t.value) ? 'checked' : ''}>
                  <span style="font-weight:400">${escapeHtml(t.label)}</span>
                </label>`).join('')}
            </div>`).join('')}
        </div>
        <div id="subError" class="error-list" style="display:none"></div>
        <div id="subSuccess" style="display:none"><p class="hint" style="color:var(--success)" id="subSuccessMsg"></p></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn" type="submit" id="subSubmitBtn" data-i18n="${existing ? 'subscribe_save_btn' : 'subscribe_submit_btn'}">${existing ? 'Save Preferences' : 'Subscribe'}</button>
          ${existing ? `<a href="/api/subscriptions/unsubscribe?token=${encodeURIComponent(manageToken)}" class="btn btn-outline" data-i18n="unsubscribe">Unsubscribe</a>` : ''}
        </div>
      </form>
    </div>`;
  I18N.apply();
  setPageTitle('Daily Email Updates', 'Sign up for a daily email digest of new classifieds and editorials - by category, at the time you choose.');

  wireSubscribeForm(existing, manageToken);
}

// The "View All" link a digest email shows once there's more than fits in
// its own preview (see services/emailDigest.js's EMAIL_PREVIEW_MAX) lands
// here - same token plus the exact ids that email listed, read straight off
// the link, so this reproduces precisely what it was built from rather than
// whatever happens to be "new" by the time it's clicked.
async function renderDigestAllPage(params) {
  const token = params.query.token || '';
  const ids = params.query.ids || '';
  let sections = [];
  try {
    const result = await Api.subscriptionDigestAll(token, ids);
    sections = result.sections || [];
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="container" style="padding-top:40px;padding-bottom:40px;max-width:560px"><p class="error-list">This link is invalid or has expired. <a href="/subscribe">Manage your email updates</a> instead.</p></div>`;
    setPageTitle('Email Updates');
    return;
  }

  document.getElementById('app').innerHTML = `
    <div class="container" style="padding-top:30px;padding-bottom:60px;max-width:700px">
      <div class="page-header">
        <h1>All Your Updates</h1>
        <p class="hint">Everything new in the topics you follow.</p>
      </div>
      ${sections.length ? sections.map((sec) => `
        <h3 style="margin:24px 0 8px">${escapeHtml(sec.title)}</h3>
        <div class="digest-all-list">
          ${sec.items.map((it) => `
            <a class="digest-all-item" href="${it.url}">
              <div class="digest-all-item-title">${escapeHtml(it.title)}</div>
              ${it.categoryLabel || it.location ? `<div class="digest-all-item-meta">${[it.categoryLabel, it.location].filter(Boolean).map(escapeHtml).join(' • ')}</div>` : ''}
              ${it.price ? `<div class="digest-all-item-price">${escapeHtml(it.price)}</div>` : ''}
              ${it.excerpt ? `<div class="digest-all-item-excerpt">${escapeHtml(it.excerpt)}</div>` : ''}
            </a>`).join('')}
        </div>`).join('') : `<p class="empty-state">Nothing new right now - check back later.</p>`}
    </div>
  `;
  setPageTitle('All Your Updates');
}

function wireSubscribeForm(existing, manageToken) {
  document.getElementById('subscribeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('subSubmitBtn');
    const errBox = document.getElementById('subError');
    const successBox = document.getElementById('subSuccess');
    errBox.style.display = 'none';
    successBox.style.display = 'none';
    const topics = Array.from(document.querySelectorAll('input[name="topic"]:checked')).map((el) => el.value);
    const sendHourVal = Number(document.getElementById('subHour').value);
    const body = { categories: topics, sendHour: sendHourVal };
    if (existing) body.token = manageToken;
    else body.email = document.getElementById('subEmail').value.trim();

    btn.disabled = true;
    btn.textContent = '…';
    try {
      const result = await Api.subscribe(body);
      Analytics.track('sb', existing ? 'update' : 'signup', { v: topics.length });
      successBox.style.display = 'block';
      document.getElementById('subSuccessMsg').textContent = result.status === 'pending'
        ? "Almost done - check your email and click the confirmation link to start receiving updates."
        : 'Your preferences have been saved.';
    } catch (e2) {
      errBox.style.display = 'block';
      errBox.innerHTML = `<ul>${(e2.data?.details || [e2.message]).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
    } finally {
      btn.disabled = false;
      btn.textContent = existing ? 'Save Preferences' : 'Subscribe';
    }
  });
}
