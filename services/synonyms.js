// Words this community uses for the same thing, in English, Hebrew and
// Yiddish spelled in English letters. Works with no API key: every search
// also looks for the other words in a group. Claude (searchUnderstanding.js)
// adds to these when it is set up. Each line is one group; a search for any
// word in it also finds the rest.
const GROUPS = [
  'wig sheitel sheitl shaitel peruke',
  'apartment apt dira flat condo unit',
  'rent rental lease sublet sublease',
  'house home bayis townhouse',
  'job position work employment hiring opening',
  'babysitter babysitting nanny nannie childcare daycare',
  'tutor rebbi melamed teacher lessons',
  'cleaning cleaner housekeeper maid cleaner',
  'plumber plumbing plumbing',
  'electrician electrical',
  'mover movers moving',
  'car vehicle auto minivan',
  'furniture couch sofa table chairs',
  'stroller carriage pram',
  'seforim sefarim books',
  'kollel yeshiva yeshivah',
  'shidduch shadchan match',
  'tickets ticket',
  'catering caterer food',
  'bakery baker cakes',
  'photographer photography photos',
  'dentist dental orthodontist',
  'doctor physician md',
  'lawyer attorney law',
  'accountant cpa bookkeeper bookkeeping taxes',
  'seamstress tailor alterations',
  'laptop computer pc macbook',
  'phone iphone cellphone cell',
  'bike bicycle scooter',
  'lost missing',
  'found',
];

const index = new Map();
GROUPS.forEach((g) => {
  const words = [...new Set(g.split(/\s+/))];
  words.forEach((w) => { if (!index.has(w)) index.set(w, new Set()); words.forEach((o) => o !== w && index.get(w).add(o)); });
});

// Other words for the words of a search ("sheitel" -> wig, peruke...).
function expand(text, max = 8) {
  const out = new Set();
  String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).forEach((w) => {
    const s = index.get(w) || index.get(w.replace(/s$/, ''));
    if (s) s.forEach((x) => out.add(x));
  });
  return [...out].slice(0, max);
}

module.exports = { expand };
