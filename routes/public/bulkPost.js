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

// Same no-payment, no-character-limit, pre-approved-images post creation as
// the admin "+ New Post" page (see services/adminPostCreate.js) - called
// once per listing from the bulk tool's page, one at a time, so a mistake
// on listing #7 doesn't stop the other 20 from going through.
router.post('/create', requireBulkAccess, upload.array('images', 6), async (req, res, next) => {
  try {
    const post = await createAdminPost(req.body, req.files, req.bulkCreatorEmail);
    res.status(201).json(post);
  } catch (e) {
    if (e instanceof AdminPostCreateError) {
      return res.status(e.status).json(e.details ? { error: e.message, details: e.details } : { error: e.message });
    }
    next(e);
  }
});

module.exports = router;
