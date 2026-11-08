const Api = (() => {
  // Shared by every impression/click registration call below - same opt-out
  // as Analytics.trackPageview (the admin "don't count my visits" toggle).
  function trackingOk() { return typeof Analytics === 'undefined' || !Analytics.isDisabled(); }

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
    home: (params) => req(`/home?${qs(params)}`),
    classifieds: (params) => req(`/classifieds?${qs(params)}`),
    classifiedDetail: (id) => req(`/classifieds/${id}`),
    categoryCounts: () => req('/classifieds/category-counts'),
    listings: (params) => req(`/listings?${qs(params)}`),
    listingDetail: (id) => req(`/listings/${id}`),
    listingCategoryCounts: () => req('/listings/category-counts'),
    simchas: (params) => req(`/simchas?${qs(params)}`),
    simchaDetail: (id) => req(`/simchas/${id}`),
    postsByIds: (ids) => req(`/posts/by-ids?ids=${ids.join(',')}`),
    createPost: (formData) => req('/posts', { method: 'POST', body: formData }),
    polishPost: (body) => req('/posts/polish', { method: 'POST', body }),
    validatePromo: (code, postType) => req('/posts/promo/validate', { method: 'POST', body: { code, postType } }),
    report: (id, body) => req(`/posts/${id}/report`, { method: 'POST', body }),
    boost: (id, body) => req(`/posts/${id}/boost`, { method: 'POST', body }),
    strike: (id, body) => req(`/posts/${id}/strike`, { method: 'POST', body }),
    registerImpressions: (ids) => trackingOk() ? req('/posts/impressions', { method: 'POST', body: { ids, visitorId: typeof Analytics !== 'undefined' ? Analytics.visitorId() : undefined } }).catch(() => {}) : Promise.resolve(),
    registerClicks: (ids) => trackingOk() ? req('/posts/clicks', { method: 'POST', body: { ids, visitorId: typeof Analytics !== 'undefined' ? Analytics.visitorId() : undefined } }).catch(() => {}) : Promise.resolve(),
    contact: (body) => req('/contact', { method: 'POST', body }),
    editorials: (params) => req(`/editorials?${qs(params)}`),
    editorialDetail: (id) => req(`/editorials/${id}`),
    editorialInstructions: () => req('/editorials/instructions'),
    submitEditorial: (formData) => req('/editorials', { method: 'POST', body: formData }),
    submitEditorialComment: (id, body) => req(`/editorials/${id}/comments`, { method: 'POST', body }),
    registerEditorialImpressions: (ids) => trackingOk() ? req('/editorials/impressions', { method: 'POST', body: { ids, visitorId: typeof Analytics !== 'undefined' ? Analytics.visitorId() : undefined } }).catch(() => {}) : Promise.resolve(),
    registerEditorialClicks: (ids) => trackingOk() ? req('/editorials/clicks', { method: 'POST', body: { ids, visitorId: typeof Analytics !== 'undefined' ? Analytics.visitorId() : undefined } }).catch(() => {}) : Promise.resolve(),
    likeEditorial: (id) => req(`/editorials/${id}/like`, { method: 'POST' }),
    subscriptionManage: (token) => req(`/subscriptions/manage?token=${encodeURIComponent(token)}`),
    subscriptionDigestAll: (token, ids) => req(`/subscriptions/digest-all?${qs({ token, ids })}`),
    subscribe: (body) => req('/subscriptions', { method: 'POST', body }),
    banners: (zone) => req(`/banners?zone=${encodeURIComponent(zone)}`),
    registerBannerImpressions: (ids) => trackingOk() ? req('/banners/impressions', { method: 'POST', body: { ids, visitorId: typeof Analytics !== 'undefined' ? Analytics.visitorId() : undefined } }).catch(() => {}) : Promise.resolve(),
    registerBannerClicks: (ids) => trackingOk() ? req('/banners/clicks', { method: 'POST', body: { ids, visitorId: typeof Analytics !== 'undefined' ? Analytics.visitorId() : undefined } }).catch(() => {}) : Promise.resolve(),
    cheskyAsk: (question, transcript, image, voice) => req('/chat/ask', { method: 'POST', body: { question, transcript, page: location.pathname, image: image || undefined, voice: voice || undefined } }),
    cheskyHandoff: (body) => req('/chat/handoff', { method: 'POST', body }),
    cheskySend: (body) => req('/chat/send', { method: 'POST', body }),
    cheskyPoll: (id, after) => req(`/chat/poll?id=${encodeURIComponent(id)}&after=${after}`),
    cheskyLog: (body) => req('/chat/log', { method: 'POST', body }).catch(() => {}),
  };
})();
