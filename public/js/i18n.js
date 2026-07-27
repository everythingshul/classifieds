const I18N = (() => {
  const DICT = {
    en: {
      nav_home: 'Home', nav_classifieds: 'Classifieds', nav_listings: 'Listings', nav_simchas: 'Simchas',
      nav_bookmarks: 'Bookmarks', nav_post: '+ Post',
      view_all: 'View All', view_all_classifieds: 'View All Classifieds', view_all_listings: 'View All Listings', view_all_simchas: 'View All Simchas',
      recent_classifieds: 'Recent Classifieds', recent_listings: 'Recent Listings', recent_simchas: 'Recent Simchas',
      search_everything: 'Search classifieds, listings, simchas…', search_results: 'Search Results',
      zmanim_today: "Today's Zmanim", daf_yomi: 'Daf Yomi', hebrew_date: 'Hebrew Date', english_date: 'English Date',
      sunrise: 'Sunrise', sunset: 'Sunset', shkia: 'Shkia', tzeit: 'Tzeit Hakochavim', tzeit60: 'Tzeis 60', tzeit72: 'Tzeis 72', chatzot: 'Chatzos',
      sof_zman_shma: 'Sof Zman Shma', sof_zman_tfilla: 'Sof Zman Tfilla', mincha_gedola: 'Mincha Gedola', plag_hamincha: 'Plag HaMincha',
      search: 'Search', filter: 'Filter', filters: 'Filters', category: 'Category', location: 'Location',
      price: 'Price', page: 'Page', next: 'Next', prev: 'Previous', results: 'results',
      no_results: 'No listings found.', view_details: 'View Details', contact: 'Contact',
      call: 'Call', email: 'Email', website: 'Visit Website', report: 'Report', bookmark: 'Save', bookmarked: 'Saved',
      posted: 'Posted', expires: 'Expires', views: 'views',
      terms: 'Terms & Conditions', refund_policy: 'Refund Policy',
      lang_toggle: 'עברית',
    },
    he: {
      nav_home: 'בית', nav_classifieds: 'מודעות', nav_listings: 'רשימות', nav_simchas: 'שמחות',
      nav_bookmarks: 'שמורים', nav_post: '+ פרסם',
      view_all: 'הצג הכל', view_all_classifieds: 'כל המודעות', view_all_listings: 'כל הרשימות', view_all_simchas: 'כל השמחות',
      recent_classifieds: 'מודעות אחרונות', recent_listings: 'רשימות אחרונות', recent_simchas: 'שמחות אחרונות',
      search_everything: 'חיפוש במודעות, רשימות ושמחות…', search_results: 'תוצאות חיפוש',
      zmanim_today: 'זמנים היום', daf_yomi: 'דף יומי', hebrew_date: 'תאריך עברי', english_date: 'תאריך לועזי',
      sunrise: 'הנץ החמה', sunset: 'שקיעה', shkia: 'שקיעה', tzeit: 'צאת הכוכבים', tzeit60: 'צאת 60', tzeit72: 'צאת 72', chatzot: 'חצות',
      sof_zman_shma: 'סוף זמן קריאת שמע', sof_zman_tfilla: 'סוף זמן תפילה', mincha_gedola: 'מנחה גדולה', plag_hamincha: 'פלג המנחה',
      search: 'חיפוש', filter: 'סינון', filters: 'מסננים', category: 'קטגוריה', location: 'מיקום',
      price: 'מחיר', page: 'עמוד', next: 'הבא', prev: 'הקודם', results: 'תוצאות',
      no_results: 'לא נמצאו מודעות.', view_details: 'לפרטים', contact: 'ליצירת קשר',
      call: 'התקשר', email: 'שלח אימייל', website: 'לאתר', report: 'דווח', bookmark: 'שמור', bookmarked: 'שמור',
      posted: 'פורסם', expires: 'בתוקף עד', views: 'צפיות',
      terms: 'תנאי שימוש', refund_policy: 'מדיניות החזרים',
      lang_toggle: 'English',
    },
  };

  function get() { return localStorage.getItem('esc_lang') || 'en'; }
  function set(lang) {
    localStorage.setItem('esc_lang', lang);
    apply();
  }
  function t(key) { return (DICT[get()] && DICT[get()][key]) || DICT.en[key] || key; }
  function apply() {
    const lang = get();
    document.documentElement.lang = lang;
    document.body.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }
  return { t, get, set, apply };
})();
