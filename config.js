const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { signAdminToken, requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  const admin = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = signAdminToken(admin);
  res.cookie('admin_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000 });
  res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT id, email, name, role FROM admin_users WHERE id = ?').get(req.admin.id);
  res.json({ admin });
});

router.post('/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!admin || !bcrypt.compareSync(String(currentPassword || ''), admin.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  res.json({ ok: true });
});

module.exports = router;
