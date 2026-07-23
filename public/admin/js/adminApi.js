const AdminApi = (() => {
  function token() { return localStorage.getItem('esc_admin_token'); }
  function setToken(t) { if (t) localStorage.setItem('esc_admin_token', t); else localStorage.removeItem('esc_admin_token'); }

  async function req(path, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const res = await fetch(`/api/admin${path}`, {
      ...opts,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      },
      body: isForm ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      setToken(null);
      window.location.hash = '#/login';
      throw new Error('Session expired, please log in again');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error((data && (data.error || data.details?.join(', '))) || `Request failed (${res.status})`);
    return data;
  }

  return {
    token, setToken,
    login: (email, password) => req('/auth/login', { method: 'POST', body: { email, password } }),
    me: () => req('/auth/me'),
    stats: () => req('/stats'),
    posts: (params) => req(`/posts?${new URLSearchParams(params)}`),
    post: (id) => req(`/posts/${id}`),
    updatePost: (id, body) => req(`/posts/${id}`, { method: 'PUT', body }),
    deletePost: (id, hard) => req(`/posts/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),
    approvePost: (id) => req(`/posts/${id}/approve`, { method: 'POST' }),
    rejectPost: (id, reason) => req(`/posts/${id}/reject`, { method: 'POST', body: { reason } }),
    boostPost: (id) => req(`/posts/${id}/boost`, { method: 'POST' }),
    extendPost: (id, days) => req(`/posts/${id}/extend`, { method: 'POST', body: { days } }),
    saveForever: (id) => req(`/posts/${id}/save-forever`, { method: 'POST' }),
    approveImage: (postId, imageId) => req(`/posts/${postId}/images/${imageId}/approve`, { method: 'POST' }),
    removeImage: (postId, imageId) => req(`/posts/${postId}/images/${imageId}`, { method: 'DELETE' }),
    crmSearch: (q) => req(`/crm/search?q=${encodeURIComponent(q)}`),
    taxonomies: (grp) => req(`/taxonomies${grp ? `?grp=${grp}` : ''}`),
    createTaxonomy: (body) => req('/taxonomies', { method: 'POST', body }),
    updateTaxonomy: (id, body) => req(`/taxonomies/${id}`, { method: 'PUT', body }),
    deleteTaxonomy: (id) => req(`/taxonomies/${id}`, { method: 'DELETE' }),
    tiers: () => req('/pricing/tiers'),
    createTier: (body) => req('/pricing/tiers', { method: 'POST', body }),
    updateTier: (id, body) => req(`/pricing/tiers/${id}`, { method: 'PUT', body }),
    deleteTier: (id) => req(`/pricing/tiers/${id}`, { method: 'DELETE' }),
    addons: () => req('/pricing/addons'),
    updateAddon: (key, body) => req(`/pricing/addons/${key}`, { method: 'PUT', body }),
    settings: () => req('/settings'),
    updateSetting: (key, value) => req(`/settings/${key}`, { method: 'PUT', body: { value } }),
  };
})();
