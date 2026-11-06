const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw Object.assign(new Error('JWT_SECRET is not configured'), { status: 500 });
  return secret;
}

function signAdminToken(admin) {
  return jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, getSecret(), { expiresIn: '12h' });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, getSecret());
    // A valid signature alone isn't enough - the bulk-posting tool
    // (middleware/bulkAuth.js) signs its own narrowly-scoped tokens with
    // this same JWT_SECRET, since there's only one secret in this app. A
    // bulk-post token (just { scope: 'bulk-post' }, no id/role) must never
    // pass as a real admin session just because it verifies, or anyone who
    // only knows the bulk-post password - a much more casually-shared,
    // lower-trust credential - gets full admin access to everything
    // (Settings' Stripe/SMTP/API keys included).
    if (!payload || typeof payload.id !== 'number' || !payload.role) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { signAdminToken, requireAdmin };
