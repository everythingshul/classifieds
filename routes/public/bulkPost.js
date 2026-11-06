const express = require('express');
const rateLimit = require('express-rate-limit');
const { upload } = require('../../middleware/upload');
const { signBulkToken, checkBulkPassword, requireBulkAccess } = require('../../middleware/bulkAuth');
const { createAdminPost, AdminPostCreateError } = require('../../services/adminPostCreate');

const router = express.Router();

// No username, just one shared password - rate-limit by IP same as the
// admin login form, since there's no per-account lockout possible here.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post('/auth', authLimiter, (req, res) => {
  if (!checkBulkPassword(req.body.password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.json({ token: signBulkToken() });
});

// Same no-payment, no-character-limit post creation as the admin "+ New
// Post" page (see services/adminPostCreate.js) - called once per listing
// from the bulk tool's page, one at a time, so a mistake on listing #7
// doesn't stop the other 20 from going through. Unlike "+ New Post",
// website links and photos are NOT pre-approved here - this tool is built
// for fast, unattended, high-volume entry, and its password is a much more
// casually-shared credential than a real admin login (middleware/
// bulkAuth.js), so every listing it creates goes through the same
// Moderation Queue review a public submission would.
router.post('/create', requireBulkAccess, upload.array('images', 6), async (req, res, next) => {
  try {
    const post = await createAdminPost(req.body, req.files, req.bulkCreatorEmail, { autoApprove: false });
    res.status(201).json(post);
  } catch (e) {
    if (e instanceof AdminPostCreateError) {
      return res.status(e.status).json(e.details ? { error: e.message, details: e.details } : { error: e.message });
    }
    next(e);
  }
});

module.exports = router;
