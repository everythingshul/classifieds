// Admin -> Locations. Every post's address is routed into one of these
// location categories automatically. Anything the router could not place
// waits at the top as "Needs sorting": create a new location, or drop it
// into an existing one (the wording is saved so the next post with it routes
// itself).
async function renderLocationsPage() {
  const root = document.getElementById('adminContent');
  const data = await AdminApi.locations();
  const { locations, queue } = data;
  const byId = new Map(locations.map((l) => [l.id, l]));
  const options = (selected) => locations.filter((l) => l.active)
    .map((l) => `<option value="${l.id}" ${selected === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('');

  const queueHtml = queue.length ? queue.map((q, i) => {
    const sugg = q.aiAction === 'assign' && byId.get(q.aiLocationId)
      ? `Claude suggests: ${escapeHtml(byId.get(q.aiLocationId).name)}`
      : q.aiAction === 'new' && q.aiNewName ? `Claude suggests a new location: ${escapeHtml(q.aiNewName)}`
      : data.claudeReady ? 'Claude could not place this' : 'Claude is not set up, so this needs you';
    return `
      <div class="admin-card" data-q="${i}" style="border-left:4px solid var(--warning,#b3823a)">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <strong>${escapeHtml(q.text)}</strong>
          <span class="hint">${q.postCount} post${q.postCount === 1 ? '' : 's'} waiting</span>
        </div>
        <p class="hint" style="margin:4px 0 10px">${sugg}${q.aiNote ? ' - ' + escapeHtml(q.aiNote) : ''}</p>
        <div class="form-cols">
          <div class="form-row"><label>Put it in an existing location</label>
            <div style="display:flex;gap:8px"><select data-pick style="flex:1"><option value="">Choose...</option>${options(q.aiLocationId)}</select>
            <button class="btn btn-sm" data-assign>Assign</button></div></div>
          <div class="form-row"><label>Or make a new location</label>
            <div style="display:flex;gap:8px"><input data-newname value="${escapeHtml(q.aiNewName || q.text)}" style="flex:1">
            <button class="btn btn-sm btn-outline" data-create>Create</button></div></div>
        </div>
      </div>`;
  }).join('') : '<p class="hint">Nothing waiting. Every address has been placed.</p>';

  root.innerHTML = `
    <h1>Locations</h1>
    <p class="hint">Every post's address is sorted into one of these places automatically. Claude helps with the tricky ones. When something does not fit any place, it shows up here for you to decide.</p>

    <h2>Needs sorting ${queue.length ? `<span class="nav-badge" style="display:inline-block;position:static">${queue.length}</span>` : ''}</h2>
    ${queueHtml}

    <div class="admin-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <h3 style="margin:0">All locations (${locations.length})</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-outline" id="routeAllBtn">Re-check unsorted posts</button>
          <button class="btn btn-sm" id="addLocBtn">+ Add location</button>
        </div>
      </div>
      <input type="search" id="locFilter" placeholder="Filter..." style="margin:12px 0;width:100%">
      <table class="admin-table">
        <thead><tr><th>Location</th><th>Also known as</th><th>Live posts</th><th></th></tr></thead>
        <tbody id="locRows">${locations.map((l) => `
          <tr data-name="${escapeHtml(l.name.toLowerCase() + ' ' + l.aliases.join(' ').toLowerCase())}">
            <td>${escapeHtml(l.name)}${l.active ? '' : ' <span class="hint">(hidden)</span>'}</td>
            <td>${escapeHtml(l.aliases.join(', '))}</td>
            <td>${l.posts}</td>
            <td><button class="btn btn-sm btn-outline" data-edit="${l.id}">Edit</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;

  root.querySelectorAll('[data-q]').forEach((card) => {
    const q = queue[Number(card.dataset.q)];
    card.querySelector('[data-assign]').addEventListener('click', async () => {
      const id = Number(card.querySelector('[data-pick]').value);
      if (!id) return toast('Choose a location first');
      const r = await AdminApi.assignQueuedLocation(q.key, id);
      toast(`Sorted ${r.routed} post${r.routed === 1 ? '' : 's'}`);
      renderLocationsPage();
    });
    card.querySelector('[data-create]').addEventListener('click', async () => {
      const name = card.querySelector('[data-newname]').value.trim();
      if (!name) return;
      try {
        const r = await AdminApi.createLocation({ name, aliases: [q.text], resolveKey: q.key });
        toast(`Created. ${r.routed} post${r.routed === 1 ? '' : 's'} sorted${r.geocoded ? '' : ' (no map point found, add one by editing)'}`);
        renderLocationsPage();
      } catch (e) { toast(e.message); }
    });
  });

  document.getElementById('locFilter').addEventListener('input', (e) => {
    const f = e.target.value.trim().toLowerCase();
    root.querySelectorAll('#locRows tr').forEach((tr) => { tr.style.display = !f || tr.dataset.name.includes(f) ? '' : 'none'; });
  });
  document.getElementById('routeAllBtn').addEventListener('click', async () => {
    const r = await AdminApi.routeAllLocations();
    toast(`Checked ${r.checked} post${r.checked === 1 ? '' : 's'}`);
    renderLocationsPage();
  });

  const form = (l) => `
    <form id="locForm">
      <div class="form-row"><label>Name</label><input name="name" value="${escapeHtml(l ? l.name : '')}" required></div>
      <div class="form-row"><label>Also known as (one per line: nicknames, spellings, streets)</label>
        <textarea name="aliases" rows="4">${escapeHtml(l ? l.aliases.join('\n') : '')}</textarea></div>
      <div class="form-cols">
        <div class="form-row"><label>Latitude</label><input name="lat" value="${l && l.lat != null ? l.lat : ''}" placeholder="auto"></div>
        <div class="form-row"><label>Longitude</label><input name="lng" value="${l && l.lng != null ? l.lng : ''}" placeholder="auto"></div>
      </div>
      ${l ? `<label class="addon-row" style="border:none"><input type="checkbox" name="active" ${l.active ? 'checked' : ''}> <span style="font-weight:400">Active</span></label>` : ''}
      <button class="btn" type="submit">Save</button>
    </form>`;
  const wire = (l) => document.getElementById('locForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { name: f.name.value.trim(), aliases: f.aliases.value.split('\n').map((s) => s.trim()).filter(Boolean), lat: f.lat.value, lng: f.lng.value };
    try {
      if (l) { body.active = f.active.checked; await AdminApi.updateLocation(l.id, body); }
      else await AdminApi.createLocation(body);
      Modal.close(); toast('Saved'); renderLocationsPage();
    } catch (err) { toast(err.message); }
  });
  document.getElementById('addLocBtn').addEventListener('click', () => Modal.open('Add location', form(null), { onOpen: () => wire(null) }));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const l = byId.get(Number(b.dataset.edit));
    Modal.open('Edit location', form(l), { onOpen: () => wire(l) });
  }));
}
