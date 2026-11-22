// Shared per-IP throttles for public endpoints that cost money, send mail or
// write rows. server.js already has a broad 240/minute ceiling on all of /api;
// these are the tighter ones for specific abuse paths.
const rateLimit = require('express-rate-limit');

const make = (windowMs, max, message) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { error: message || 'Too many requests. Please slow down and try again shortly.' },
});

module.exports = {
  // Each of these emails the admin or posts content, so flooding them is spam.
  contactLimiter: make(15 * 60 * 1000, 8),
  reportLimiter: make(15 * 60 * 1000, 10),
  submitLimiter: make(15 * 60 * 1000, 15),
  // Boost and Feature are authorised only by the poster's email address.
  addonLimiter: make(15 * 60 * 1000, 10),
  // Counters anyone can bump: generous for real browsing, not for scripts.
  counterLimiter: make(60 * 1000, 90),
  // Claude-backed search calls cost money per distinct query.
  aiSearchLimiter: make(60 * 1000, 20),
};

// Same idea as aiSearchLimiter but as a yes/no, so a search that is over budget
// still runs the normal (free) search instead of failing. 20 AI reads/minute/IP.
const aiHits = new Map();
module.exports.aiAllowed = (req) => {
  const now = Date.now();
  const key = req.ip || 'x';
  let e = aiHits.get(key);
  if (!e || now > e.reset) { e = { n: 0, reset: now + 60 * 1000 }; aiHits.set(key, e); }
  if (aiHits.size > 5000) for (const [k, v] of aiHits) if (now > v.reset) aiHits.delete(k);
  e.n += 1;
  return e.n <= 20;
};
