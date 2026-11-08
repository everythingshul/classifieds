// Auth for the hidden listing-category management tool
// (routes/public/categoryManage.js). Two ways in, same token header either
// way:
//  - a normal admin session (so the tool also works from inside the
//    already-logged-in admin portal, no separate password needed there)
//  - this tool's own password-only session, issued by POST /auth below -
//    no username, just a single shared password set in Admin -> Settings.
// This is a completely separate password/token from the bulk-posting tool's
// (middleware/bulkAuth.js) - neither credential works for the other tool.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const runtimeConfig = require('../services/runtimeConfig');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw Object.assign(new Error('JWT_SECRET is not configured'), { status: 500 });
  return secret;
}

function signCategoryToken() {
  return jwt.sign({ scope: 'category-manage' }, getSecret(), { expiresIn: '12h' });
}

function checkCategoryPassword(password) {
  const hash = runtimeConfig.get('category_manage_password_hash', 'CATEGORY_MANAGE_PASSWORD_HASH');
  if (!hash) return false; // no password configured yet - tool is standalone-inaccessible until an admin sets one
  return bcrypt.compareSync(String(password || ''), hash);
}

function requireCategoryAccess(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, getSecret());
    // This scoped token never carries id/role, so (see middleware/
    // adminAuth.js's requireAdmin) it can never be mistaken for a real admin
    // session elsewhere in the app even though it's signed with the same
    // secret - it only ever unlocks the routes in this one file.
    if (payload.scope === 'category-manage' || payload.email) return next();
    return res.status(401).json({ error: 'Invalid or expired session' });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { signCategoryToken, checkCategoryPassword, requireCategoryAccess };
