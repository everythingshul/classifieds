// Admin shortcuts on the public site. When this browser is signed in to the
// admin portal (same sign-in, same tab storage), every post card and post page
// gets Edit / Extend / Boost / Save forever / Delete buttons. Visitors never
// see them: the buttons only appear after /api/admin/auth/me accepts the
// stored token, and every action is checked again by the server.
const AdminTools = (() => {
  let ok = false;
  const token = () => { try { return localStorage.getItem('esc_admin_token'); } catch (e) { return null; } };

  async function api(path, opts = {}) {
    const res = await fetch(`/api/admin${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  const BTNS = [['edit', 'Edit'], ['extend', 'Extend'], ['boost', 'Boost'], ['forever', 'Keep'], ['delete', 'Delete']];
  const barHtml = (pid, cls) => `<span class="admin-bar ${cls}" data-pid="${pid}"><span class="ab-tag">Admin</span>${BTNS.map(([a, l]) => `<${cls === 'on-page' ? 'button type="button"' : 'span role="button" tabindex="0"'} class="ab-btn ${a === 'delete' ? 'ab-danger' : ''}" data-act="${a}"${a === 'forever' ? ' title="Save forever: never expires"' : ''}>${l}</${cls === 'on-page' ? 'button' : 'span'}>`).join('')}</span>`;

  function decorate() {
    if (!ok) return;
    const app = document.getElementById('app');
    if (!app) return;
    app.querySelectorAll('a.card[href]').forEach((card) => {
      if (card.querySelector(':scope > .admin-bar')) return;
      const m = /^\/(classifieds|listings|simchas)\/([^/?#]+)$/.exec(card.getAttribute('href') || '');
      if (m) card.insertAdjacentHTML('beforeend', barHtml(m[2], 'on-card'));
    });
    const title = app.querySelector('.detail-title');
    if (title && !app.querySelector('.admin-bar.on-page')) {
      const m = /^\/(classifieds|listings|simchas)\/([^/?#]+)$/.exec(location.pathname);
      if (m) title.insertAdjacentHTML('beforebegin', barHtml(m[2], 'on-page'));
    }
  }

  async function run(act, pid, bar) {
    if (act === 'edit') { window.open(`/admin/#/posts?q=${encodeURIComponent(pid)}`, '_blank', 'noopener'); return; }
    const post = await api(`/posts/lookup/${encodeURIComponent(pid)}`);
    if (act === 'extend') {
      const raw = prompt(`Extend "${pid}" by how many days?`, '14');
      if (raw === null) return;
      const days = Number(raw);
      if (!Number.isFinite(days) || days <= 0) return toast('Enter a valid number of days');
      await api(`/posts/${post.id}/extend`, { method: 'POST', body: { days } });
      toast(`Extended ${days} day${days === 1 ? '' : 's'}`);
    } else if (act === 'boost') {
      await api(`/posts/${post.id}/boost`, { method: 'POST' });
      toast('Boosted to the top');
    } else if (act === 'forever') {
      await api(`/posts/${post.id}/save-forever`, { method: 'POST' });
      toast('Saved forever');
    } else if (act === 'delete') {
      if (!confirm('Remove this post from the site? You can restore it from the admin portal.')) return;
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      toast('Post removed');
      if (bar.classList.contains('on-page')) { Router.navigate('/'); return; }
    }
    Router.resolve();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('.ab-btn');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const bar = b.closest('.admin-bar');
    run(b.dataset.act, bar.dataset.pid, bar).catch((err) => toast(err.message));
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('ab-btn') && e.target.tagName === 'SPAN') { e.preventDefault(); e.target.click(); }
  });

  async function init() {
    if (!token()) return;
    try {
      const r = await fetch('/api/admin/auth/me', { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return;
    } catch (e) { return; }
    ok = true;
    document.body.classList.add('is-admin');
    decorate();
    const app = document.getElementById('app');
    if (app) new MutationObserver(() => decorate()).observe(app, { childList: true, subtree: true });
  }
  return { init };
})();
