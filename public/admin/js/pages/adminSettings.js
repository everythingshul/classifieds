async function renderSettingsPage() {
  const s = await AdminApi.settings();
  const root = document.getElementById('adminContent');
  const secretField = (key, label, isSetFlag, placeholder) => `
    <div class="form-row">
      <label>${label} ${isSetFlag ? '<span class="tag" style="background:#e3f3e9;color:var(--success)">configured</span>' : '<span class="tag" style="background:#fbe4e4;color:var(--danger)">not set</span>'}</label>
      <input type="password" name="${key}" placeholder="${isSetFlag ? '•••••••• (leave blank to keep)' : placeholder || 'Paste value here'}" autocomplete="off">
    </div>`;

  root.innerHTML = `
    <h1>Settings</h1>

    <div class="admin-card">
      <h3 style="margin-top:0">Site</h3>
      <form id="siteForm">
        <div class="form-cols">
          <div class="form-row"><label>Site name</label><input name="site_name" value="${escapeHtml(s.site_name || '')}"></div>
          <div class="form-row"><label>Site URL</label><input name="app_url" placeholder="https://your-domain.example.com" value="${escapeHtml(s.app_url || '')}"></div>
        </div>
        <div class="form-row"><label>Admin notification email</label><input name="admin_notify_email" type="email" value="${escapeHtml(s.admin_notify_email || '')}"></div>
        <button class="btn btn-sm" type="submit">Save</button>
      </form>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Payments — Stripe</h3>
      <p class="hint">From your Stripe dashboard: Developers → API keys for the secret key, and Developers → Webhooks (endpoint <code>/api/webhook</code>) for the signing secret.</p>
      <form id="stripeForm">
        <div class="form-row"><label>Publishable key <span class="hint">(safe to expose publicly - powers the embedded checkout form)</span></label><input name="stripe_publishable_key" placeholder="pk_live_..." value="${escapeHtml(s.stripe_publishable_key || '')}"></div>
        ${secretField('stripe_secret_key', 'Secret key', s.stripe_secret_key_isSet, 'sk_live_...')}
        ${secretField('stripe_webhook_secret', 'Webhook signing secret', s.stripe_webhook_secret_isSet, 'whsec_...')}
        <button class="btn btn-sm" type="submit">Save</button>
      </form>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Outbound Email</h3>
      <p class="hint">Used for invoices, approval notices, Mazel Tov surprises, and your admin alerts. Leave everything blank to log emails to the server console instead of sending them (useful for testing).</p>
      <form id="mailForm">
        <div class="form-row"><label>Provider</label>
          <select name="mail_provider" id="mailProviderSelect">
            <option value="smtp" ${(s.mail_provider || 'smtp') === 'smtp' ? 'selected' : ''}>SMTP</option>
            <option value="brevo" ${s.mail_provider === 'brevo' ? 'selected' : ''}>Brevo</option>
          </select>
        </div>
        <div id="smtpFields" style="display:${(s.mail_provider || 'smtp') === 'smtp' ? 'block' : 'none'}">
          <div class="form-cols">
            <div class="form-row"><label>Host</label><input name="smtp_host" placeholder="smtp.example.com" value="${escapeHtml(s.smtp_host || '')}"></div>
            <div class="form-row"><label>Port</label><input name="smtp_port" type="number" value="${escapeHtml(s.smtp_port || '587')}"></div>
          </div>
          <div class="form-cols">
            <div class="form-row"><label>Username</label><input name="smtp_user" value="${escapeHtml(s.smtp_user || '')}"></div>
            ${secretField('smtp_pass', 'Password', s.smtp_pass_isSet)}
          </div>
          <div class="form-row"><label>Use TLS (port 465)</label><select name="smtp_secure"><option value="0" ${!s.smtp_secure ? 'selected' : ''}>No</option><option value="1" ${s.smtp_secure ? 'selected' : ''}>Yes</option></select></div>
        </div>
        <div id="brevoFields" style="display:${s.mail_provider === 'brevo' ? 'block' : 'none'}">
          <p class="hint">From your Brevo dashboard: Settings → SMTP &amp; API → API Keys.</p>
          ${secretField('brevo_api_key', 'API Key', s.brevo_api_key_isSet, 'xkeysib-...')}
        </div>
        <div class="form-row"><label>From address</label><input name="mail_from" placeholder="JListings &lt;no-reply@example.com&gt;" value="${escapeHtml(s.mail_from || '')}"></div>
        <button class="btn btn-sm" type="submit">Save</button>
      </form>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Google Maps</h3>
      <p class="hint">Enables address autocomplete on location fields. Without it, location stays a plain text field. Restrict the key by HTTP referrer in the Google Cloud console.</p>
      <form id="mapsForm">
        <div class="form-row"><label>API key</label><input name="google_maps_api_key" value="${escapeHtml(s.google_maps_api_key || '')}"></div>
        <button class="btn btn-sm" type="submit">Save</button>
      </form>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Posting Rules</h3>
      <form id="rulesForm">
        <div class="form-cols">
          <div class="form-row"><label>Simcha retention (days)</label><input name="simcha_retention_days" type="number" value="${s.simcha_retention_days ?? 30}"></div>
          <div class="form-row"><label>Simcha max retention (days)</label><input name="simcha_retention_max_days" type="number" value="${s.simcha_retention_max_days ?? 365}"></div>
        </div>
        <h4>Classified Character Limits</h4>
        <div class="form-cols">
          <div class="form-row"><label>Title</label><input name="classified_title" type="number" value="${s.classified_char_limits?.title ?? 80}"></div>
          <div class="form-row"><label>Description</label><input name="classified_description" type="number" value="${s.classified_char_limits?.description ?? 200}"></div>
        </div>
        <h4>Simcha Character Limit</h4>
        <div class="form-row" style="max-width:200px"><label>Details</label><input name="simcha_description" type="number" value="${s.simcha_char_limits?.description ?? 200}"></div>
        <h4>Listing Character Limits</h4>
        <div class="form-cols">
          <div class="form-row"><label>Title</label><input name="listing_title" type="number" value="${s.listing_char_limits?.title ?? 80}"></div>
          <div class="form-row"><label>Description</label><input name="listing_description" type="number" value="${s.listing_char_limits?.description ?? 200}"></div>
        </div>
        <h4>Oversized Add-on Limits</h4>
        <div class="form-cols">
          <div class="form-row"><label>Title</label><input name="oversized_title" type="number" value="${s.oversized_char_limits?.title ?? 140}"></div>
          <div class="form-row"><label>Description</label><input name="oversized_description" type="number" value="${s.oversized_char_limits?.description ?? 500}"></div>
        </div>
        <button class="btn btn-sm" type="submit">Save</button>
      </form>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0">Default Location</h3>
      <p class="hint">Used for the zmanim/date widgets when a visitor doesn't share their own location.</p>
      <form id="locForm">
        <div class="form-cols">
          <div class="form-row"><label>Label</label><input name="loc_label" value="${escapeHtml(s.default_location?.label || 'Brooklyn, NY')}"></div>
          <div class="form-row"><label>Timezone</label><input name="loc_tzid" value="${escapeHtml(s.default_location?.tzid || 'America/New_York')}"></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Latitude</label><input name="loc_lat" type="number" step="0.0001" value="${s.default_location?.lat ?? 40.6782}"></div>
          <div class="form-row"><label>Longitude</label><input name="loc_lng" type="number" step="0.0001" value="${s.default_location?.lng ?? -73.9442}"></div>
        </div>
        <button class="btn btn-sm" type="submit">Save</button>
      </form>
    </div>
  `;

  bindForm('siteForm', (fd) => [
    ['site_name', fd.site_name], ['app_url', fd.app_url], ['admin_notify_email', fd.admin_notify_email],
  ]);
  bindForm('stripeForm', (fd) => {
    const out = [['stripe_publishable_key', fd.stripe_publishable_key]];
    if (fd.stripe_secret_key) out.push(['stripe_secret_key', fd.stripe_secret_key]);
    if (fd.stripe_webhook_secret) out.push(['stripe_webhook_secret', fd.stripe_webhook_secret]);
    return out;
  }, true);
  document.getElementById('mailProviderSelect').addEventListener('change', (e) => {
    document.getElementById('smtpFields').style.display = e.target.value === 'smtp' ? 'block' : 'none';
    document.getElementById('brevoFields').style.display = e.target.value === 'brevo' ? 'block' : 'none';
  });
  bindForm('mailForm', (fd) => {
    const out = [
      ['mail_provider', fd.mail_provider], ['mail_from', fd.mail_from],
      ['smtp_host', fd.smtp_host], ['smtp_port', fd.smtp_port], ['smtp_user', fd.smtp_user], ['smtp_secure', fd.smtp_secure === '1'],
    ];
    if (fd.smtp_pass) out.push(['smtp_pass', fd.smtp_pass]);
    if (fd.brevo_api_key) out.push(['brevo_api_key', fd.brevo_api_key]);
    return out;
  }, true);
  bindForm('mapsForm', (fd) => [['google_maps_api_key', fd.google_maps_api_key]]);
  bindForm('rulesForm', (fd) => [
    ['simcha_retention_days', Number(fd.simcha_retention_days)],
    ['simcha_retention_max_days', Number(fd.simcha_retention_max_days)],
    ['classified_char_limits', { title: Number(fd.classified_title), description: Number(fd.classified_description) }],
    ['simcha_char_limits', { description: Number(fd.simcha_description) }],
    ['listing_char_limits', { title: Number(fd.listing_title), description: Number(fd.listing_description) }],
    ['oversized_char_limits', { title: Number(fd.oversized_title), description: Number(fd.oversized_description) }],
  ]);
  bindForm('locForm', (fd) => [
    ['default_location', { label: fd.loc_label, tzid: fd.loc_tzid, lat: Number(fd.loc_lat), lng: Number(fd.loc_lng) }],
  ]);

  function bindForm(id, buildEntries, reload) {
    document.getElementById(id).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const entries = buildEntries(fd);
      await Promise.all(entries.map(([key, value]) => AdminApi.updateSetting(key, value)));
      toast('Saved');
      if (reload) renderSettingsPage();
    });
  }
}
