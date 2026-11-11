// Small text-matching helpers shared by the browse search (services/
// searchQuery.js), the lenient geocoder (services/geocode.js) and Chesky's
// taught-answer matching (services/chesky.js).

// Edit distance - how many single-character edits turn a into b, where
// swapping two adjacent letters ("chiar" -> "chair", the most common typo)
// counts as one edit, not two (optimal string alignment distance).
function lev(a, b) {
  a = String(a).toLowerCase(); b = String(b).toLowerCase();
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

// Lowercase, letters/digits only, single-spaced. Hebrew letters are kept
// (the site has Hebrew content) - only punctuation goes.
function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s) {
  return normalizeText(s).split(' ').filter((t) => t.length >= 2);
}

// How many edits a typo-tolerant match may be off by, scaled to the word:
// short words get none (too many false hits), medium one, long two.
function typoTolerance(word) {
  const n = word.length;
  if (n <= 4) return 0;
  if (n <= 6) return 1;
  if (n <= 10) return 2;
  return 3;
}

// Does `word` match `candidate` loosely - exact, a prefix either way (4+
// chars), or within the typo tolerance for its length?
function wordsMatch(word, candidate) {
  if (word === candidate) return true;
  if (word.length >= 4 && candidate.startsWith(word)) return true;
  if (candidate.length >= 4 && word.startsWith(candidate)) return true;
  const tol = typoTolerance(word);
  if (tol > 0) return Math.abs(word.length - candidate.length) <= tol && lev(word, candidate) <= tol;
  // A 4-letter word gets no general tolerance (too many near-neighbours:
  // "sofa"/"soft"), but a dropped letter - "piza" for "pizza" - is still
  // the single most common typo, so allow exactly that: one edit, against
  // a longer word starting with the same letter.
  return word.length === 4 && candidate.length === 5 && candidate[0] === word[0] && lev(word, candidate) === 1;
}

module.exports = { lev, normalizeText, tokenize, typoTolerance, wordsMatch };
