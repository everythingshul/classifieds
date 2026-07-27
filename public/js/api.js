const Api = (() => {
  async function req(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && (data.error || data.details?.join(', '))) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    config: () => req('/config'),
    home: (params) => req(`/home?${new URLSearchParams(params)}`),
    classifieds: (params) => req(`/classifieds?${new URLSearchParams(params)}`),
    classifiedDetail: (id) => req(`/classifieds/${id}`),
    categoryCounts: () => req('/classifieds/category-counts'),
    listings: (params) => req(`/listings?${new URLSearchParams(params)}`),
    listingDetail: (id) => req(`/listings/${id}`),
    listingCategoryCounts: () => req('/listings/category-counts'),
    simchas: (params) => req(`/simchas?${new URLSearchParams(params)}`),
    simchaDetail: (id) => req(`/simchas/${id}`),
    postsByIds: (ids) => req(`/posts/by-ids?ids=${ids.join(',')}`),
    createPost: (formData) => req('/posts', { method: 'POST', body: formData }),
    report: (id, body) => req(`/posts/${id}/report`, { method: 'POST', body }),
    boost: (id, body) => req(`/posts/${id}/boost`, { method: 'POST', body }),
    strike: (id, body) => req(`/posts/${id}/strike`, { method: 'POST', body }),
    registerImpressions: (ids) => req('/posts/impressions', { method: 'POST', body: { ids } }).catch(() => {}),
    registerClicks: (ids) => req('/posts/clicks', { method: 'POST', body: { ids } }).catch(() => {}),
  };
})();
