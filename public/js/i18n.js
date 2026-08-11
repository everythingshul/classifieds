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
      terms: 'Terms & Conditions', refund_policy: 'Refund Policy', contact_us: 'Contact Us',
      lang_toggle: 'עברית',
      nav_editorials: 'Editorials', badge_new: 'NEW',
      editorials_title: 'Editorials', write_editorial: 'Write an Editorial',
      editorials_tagline: 'Community voices, perspectives, and stories - written by you.',
      featured: 'Featured', latest: 'Latest', by_author: 'By',
      comments: 'Comments', no_comments_yet: 'No comments yet. Be the first to share your thoughts.',
      post_comment: 'Post Comment', comment_pending_notice: 'Your comment has been submitted and will appear once approved.',
      field_pen_name: 'Pen Name', field_pen_name_hint: '(shown publicly instead of your name)',
      field_first_name: 'First Name', field_last_name: 'Last Name', field_email: 'Email',
      field_phone: 'Phone', field_phone_optional: '(optional)',
      field_title: 'Title', field_body: 'Your Editorial', field_notes_admin: 'Notes to the Editor',
      field_notes_admin_hint: '(optional, not published)', field_images: 'Photos', field_videos: 'Video Links',
      field_video_hint: 'YouTube or Vimeo link (optional, up to 3)',
      submit_editorial: 'Submit for Review', editorial_submitted_title: 'Thank you!',
      editorial_submitted_body: 'Your editorial has been submitted and will be reviewed before publishing. We will email you once it is live.',
      never_public_notice: 'Your name and contact info are never shown publicly - only your pen name is.',
      editorial_read_more: 'Read More',
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
      terms: 'תנאי שימוש', refund_policy: 'מדיניות החזרים', contact_us: 'צור קשר',
      lang_toggle: 'English',
      nav_editorials: 'מאמרים', badge_new: 'חדש',
      editorials_title: 'מאמרים', write_editorial: 'כתבו מאמר',
      editorials_tagline: 'קולות, דעות וסיפורים מהקהילה - בכתיבתכם.',
      featured: 'מומלץ', latest: 'אחרונים', by_author: 'מאת',
      comments: 'תגובות', no_comments_yet: 'אין עדיין תגובות. היו הראשונים לשתף את דעתכם.',
      post_comment: 'פרסם תגובה', comment_pending_notice: 'התגובה שלך נשלחה ותוצג לאחר אישור.',
      field_pen_name: 'שם עט', field_pen_name_hint: '(יוצג בפומבי במקום שמך)',
      field_first_name: 'שם פרטי', field_last_name: 'שם משפחה', field_email: 'אימייל',
      field_phone: 'טלפון', field_phone_optional: '(אופציונלי)',
      field_title: 'כותרת', field_body: 'המאמר שלך', field_notes_admin: 'הערות לעורך',
      field_notes_admin_hint: '(אופציונלי, לא יפורסם)', field_images: 'תמונות', field_videos: 'קישורי וידאו',
      field_video_hint: 'קישור ליוטיוב או וימאו (אופציונלי, עד 3)',
      submit_editorial: 'שלח לבדיקה', editorial_submitted_title: 'תודה!',
      editorial_submitted_body: 'המאמר שלך נשלח ויבדק לפני פרסום. נשלח לך אימייל כשהוא יעלה לאתר.',
      never_public_notice: 'שמך ופרטי הקשר שלך לעולם לא יוצגו בפומבי - רק שם העט שלך יוצג.',
      editorial_read_more: 'קרא עוד',
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
