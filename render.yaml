// Daf Yomi (Bavli) tractate name translations. @hebcal/learning only gives English
// names, so we keep our own English -> Hebrew map (built from its own translation
// data, with the two tractates it doesn't translate - Shabbat, Rosh Hashana - added).
const TRACTATE_HE = {
  Berachot: 'ברכות',
  Shabbat: 'שבת',
  Eruvin: 'עירובין',
  Pesachim: 'פסחים',
  Shekalim: 'שקלים',
  Yoma: 'יומא',
  Sukkah: 'סוכה',
  Beitzah: 'ביצה',
  'Rosh Hashana': 'ראש השנה',
  Taanit: 'תענית',
  Megillah: 'מגילה',
  'Moed Katan': 'מועד קטן',
  Chagigah: 'חגיגה',
  Yevamot: 'יבמות',
  Ketubot: 'כתובות',
  Nedarim: 'נדרים',
  Nazir: 'נזיר',
  Sotah: 'סוטה',
  Gitin: 'גיטין',
  Kiddushin: 'קידושין',
  'Baba Kamma': 'בבא קמא',
  'Baba Metzia': 'בבא מציעא',
  'Baba Batra': 'בבא בתרא',
  Sanhedrin: 'סנהדרין',
  Makkot: 'מכות',
  Shevuot: 'שבועות',
  'Avodah Zarah': 'עבודה זרה',
  Horayot: 'הוריות',
  Zevachim: 'זבחים',
  Menachot: 'מנחות',
  Chullin: 'חולין',
  Bechorot: 'בכורות',
  Arachin: 'ערכין',
  Temurah: 'תמורה',
  Keritot: 'כריתות',
  Meilah: 'מעילה',
  Kinnim: 'קינים',
  Tamid: 'תמיד',
  Midot: 'מדות',
  Niddah: 'נדה',
};

// Daf Yomi is conventionally displayed by civil-calendar day (changes at midnight),
// unlike the Hebrew date shown elsewhere which changes at halachic nightfall.
async function getTodaysDaf(date = new Date()) {
  const { HDate, gematriya } = await import('@hebcal/core');
  const { DafYomi } = await import('@hebcal/learning');
  const hd = new HDate(date);
  const daf = new DafYomi(hd);
  const nameEn = daf.getName();
  const nameHe = TRACTATE_HE[nameEn] || nameEn;
  const blatt = daf.getBlatt();
  const dafHe = gematriya(blatt);
  return {
    tractateEn: nameEn,
    tractateHe: nameHe,
    daf: blatt,
    dafHe,
    display: `${nameHe} דף ${dafHe}`,
    displayEn: `${nameEn} ${blatt}`,
  };
}

module.exports = { getTodaysDaf, TRACTATE_HE };
