// Auth for the hidden bulk-posting tool (routes/public/bulkPost.js). Two
// ways in, same token header either way:
//  - a normal admin session (so the tool also works from inside the
//    already-logged-in admin portal, no separate password needed there)
//  - this tool's own password-only session, issued by POST /auth below -
//    no username, just a single shared password set in Admin -> Settings.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const runtimeConfig = require('../services/runtimeConfig');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw Object.assign(new Error('JWT_SECRET is not configured'), { status: 500 });
  return secret;
}

function signBulkToken() {
  return jwt.sign({ scope: 'bulk-post' }, getSecret(), { expiresIn: '12h' });
}

function checkBulkPassword(password) {
  const hash = runtimeConfig.get('bulk_post_password_hash', 'BULK_POST_PASSWORD_HASH');
  if (!hash) return false; // no password configured yet - tool is standalone-inaccessible until an admin sets one
  return bcrypt.compareSync(String(password || ''), hash);
}

function requireBulkAccess(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, getSecret());
    if (payload.scope === 'bulk-post' || payload.email) {
      // A real admin token carries an email to use as the post's creator;
      // the password-only bulk session doesn't, so downstream code falls
      // back to requiring posterEmail be filled in on each listing instead.
      req.bulkCreatorEmail = payload.email || null;
      return next();
    }
    return res.status(401).json({ error: 'Invalid or expired session' });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { signBulkToken, checkBulkPassword, requireBulkAccess };
