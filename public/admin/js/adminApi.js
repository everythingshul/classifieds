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
    analytics: (params) => req(`/analytics?${new URLSearchParams(params)}`),
    analyticsLive: () => req('/analytics/live'),
    locations: () => req('/locations'),
    createLocation: (body) => req('/locations', { method: 'POST', body }),
    updateLocation: (id, body) => req(`/locations/${id}`, { method: 'PUT', body }),
    assignQueuedLocation: (key, locationId) => req('/locations/queue/assign', { method: 'POST', body: { key, locationId } }),
    routeAllLocations: () => req('/locations/route-all', { method: 'POST' }),
    analyticsSessions: (params) => req(`/analytics/sessions?${new URLSearchParams(params)}`),
    analyticsSession: (sid) => req(`/analytics/session?sid=${encodeURIComponent(sid)}`),
    analyticsReset: () => req('/analytics/reset', { method: 'POST' }),
    // A file download, so it can't go through req() (which parses JSON).
    analyticsExport: async (params) => {
      const res = await fetch(`/api/admin/analytics/export?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    },
    posts: (params) => req(`/posts?${new URLSearchParams(params)}`),
    post: (id) => req(`/posts/${id}`),
    postStats: (id, params) => req(`/posts/${id}/stats?${new URLSearchParams(params)}`),
    updatePost: (id, body) => req(`/posts/${id}`, { method: 'PUT', body }),
    deletePost: (id, hard) => req(`/posts/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),
    approvePost: (id) => req(`/posts/${id}/approve`, { method: 'POST' }),
    rejectPost: (id, reason) => req(`/posts/${id}/reject`, { method: 'POST', body: { reason } }),
    boostPost: (id) => req(`/posts/${id}/boost`, { method: 'POST' }),
    extendPost: (id, days) => req(`/posts/${id}/extend`, { method: 'POST', body: { days } }),
    saveForever: (id) => req(`/posts/${id}/save-forever`, { method: 'POST' }),
    approveImage: (postId, imageId) => req(`/posts/${postId}/images/${imageId}/approve`, { method: 'POST' }),
    removeImage: (postId, imageId) => req(`/posts/${postId}/images/${imageId}`, { method: 'DELETE' }),
    addImages: (postId, formData) => req(`/posts/${postId}/images`, { method: 'POST', body: formData }),
    refundPayment: (postId, paymentId, amountCents) => req(`/posts/${postId}/payments/${paymentId}/refund`, { method: 'POST', body: amountCents ? { amountCents } : {} }),
    crmSearch: (q) => req(`/crm/search?q=${encodeURIComponent(q)}`),
    taxonomies: (grp) => req(`/taxonomies${grp ? `?grp=${encodeURIComponent(grp)}` : ''}`),
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
    sendTestEmail: (to) => req('/settings/test-email', { method: 'POST', body: { to } }),
    customCategories: () => req('/custom-categories'),
    createCustomCategory: (body) => req('/custom-categories', { method: 'POST', body }),
    updateCustomCategory: (id, body) => req(`/custom-categories/${id}`, { method: 'PUT', body }),
    deleteCustomCategory: (id) => req(`/custom-categories/${id}`, { method: 'DELETE' }),
    listingCategories: () => req('/listing-categories'),
    createListingCategory: (body) => req('/listing-categories', { method: 'POST', body }),
    updateListingCategory: (id, body) => req(`/listing-categories/${id}`, { method: 'PUT', body }),
    deleteListingCategory: (id) => req(`/listing-categories/${id}`, { method: 'DELETE' }),
    reports: () => req('/reports'),
    dismissReport: (id) => req(`/reports/${id}`, { method: 'DELETE' }),
    contactMessages: () => req('/contact-messages'),
    archiveContactMessage: (id, archived) => req(`/contact-messages/${id}`, { method: 'PUT', body: { archived } }),
    replyContactMessage: (id, message) => req(`/contact-messages/${id}/reply`, { method: 'POST', body: { message } }),
    deleteContactMessage: (id) => req(`/contact-messages/${id}`, { method: 'DELETE' }),
    notificationSummary: () => req('/notifications'),
    promoCodes: () => req('/promo-codes'),
    createPromoCode: (body) => req('/promo-codes', { method: 'POST', body }),
    updatePromoCode: (id, body) => req(`/promo-codes/${id}`, { method: 'PUT', body }),
    deletePromoCode: (id) => req(`/promo-codes/${id}`, { method: 'DELETE' }),
    createPost: (formData) => req('/posts/create', { method: 'POST', body: formData }),
    editorials: (params) => req(`/editorials?${new URLSearchParams(params)}`),
    editorial: (id) => req(`/editorials/${id}`),
    createEditorial: (formData) => req('/editorials', { method: 'POST', body: formData }),
    updateEditorial: (id, body) => req(`/editorials/${id}`, { method: 'PUT', body }),
    approveEditorial: (id) => req(`/editorials/${id}/approve`, { method: 'POST' }),
    rejectEditorial: (id, reason) => req(`/editorials/${id}/reject`, { method: 'POST', body: { reason } }),
    deleteEditorial: (id, hard) => req(`/editorials/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),
    addEditorialImages: (id, formData) => req(`/editorials/${id}/images`, { method: 'POST', body: formData }),
    removeEditorialImage: (id, imageId) => req(`/editorials/${id}/images/${imageId}`, { method: 'DELETE' }),
    approveEditorialComment: (commentId) => req(`/editorials/comments/${commentId}/approve`, { method: 'POST' }),
    rejectEditorialComment: (commentId) => req(`/editorials/comments/${commentId}/reject`, { method: 'POST' }),
    deleteEditorialComment: (commentId) => req(`/editorials/comments/${commentId}`, { method: 'DELETE' }),
    subscriptions: (params) => req(`/subscriptions?${new URLSearchParams(params)}`),
    unsubscribeSubscriber: (id) => req(`/subscriptions/${id}/unsubscribe`, { method: 'POST' }),
    resendSubscriptionConfirmation: (id) => req(`/subscriptions/${id}/resend-confirmation`, { method: 'POST' }),
    deleteSubscription: (id) => req(`/subscriptions/${id}`, { method: 'DELETE' }),
    banners: () => req('/banners'),
    bannerZones: () => req('/banners/zones'),
    createBanner: (formData) => req('/banners', { method: 'POST', body: formData }),
    updateBanner: (id, formData) => req(`/banners/${id}`, { method: 'PUT', body: formData }),
    setBannerActive: (id, active) => req(`/banners/${id}/active`, { method: 'PUT', body: { active } }),
    deleteBanner: (id) => req(`/banners/${id}`, { method: 'DELETE' }),
    emailStats: () => req('/subscriptions/email-stats'),
    chatConversations: () => req('/chat'),
    chatConversation: (id) => req(`/chat/${id}`),
    chatSetStatus: (id, status) => req(`/chat/${id}`, { method: 'PUT', body: { status } }),
    chatReply: (id, text, teach) => req(`/chat/${id}/reply`, { method: 'POST', body: { text, teach } }),
    deleteChatConversation: (id) => req(`/chat/${id}`, { method: 'DELETE' }),
    chatLearn: () => req('/chat/learn'),
    chatTeach: (body) => req('/chat/learn/teach', { method: 'POST', body }),
    chatForget: (id) => req('/chat/learn/forget', { method: 'POST', body: { id } }),
    chatDismissUnanswered: (key) => req(`/chat/learn/unanswered/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  };
})();
