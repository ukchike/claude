const router = require('express').Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${req.userId}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// GET own profile
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, email, username, full_name, bio, phone, location, website, avatar_url, created_at, updated_at FROM users WHERE id = ?'
  ).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// GET public profile by username
router.get('/:username', (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, full_name, bio, location, website, avatar_url, created_at FROM users WHERE username = ?'
  ).get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// PATCH update profile fields
router.patch('/me', requireAuth, (req, res) => {
  const allowed = ['full_name', 'bio', 'phone', 'location', 'website'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const db = getDb();
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(updates), req.userId);

  const user = db.prepare(
    'SELECT id, email, username, full_name, bio, phone, location, website, avatar_url, created_at, updated_at FROM users WHERE id = ?'
  ).get(req.userId);
  res.json(user);
});

// POST upload avatar
router.post('/me/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  const db = getDb();
  db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?")
    .run(avatarUrl, req.userId);
  res.json({ avatar_url: avatarUrl });
});

// DELETE avatar
router.delete('/me/avatar', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE users SET avatar_url = '', updated_at = datetime('now') WHERE id = ?").run(req.userId);
  res.json({ message: 'Avatar removed' });
});

// PUT change password
router.put('/me/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.userId);
  if (!bcrypt.compareSync(current_password, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?").run(hash, req.userId);
  // revoke all other sessions after password change
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_jti != ?').run(req.userId, req.tokenJti);
  res.json({ message: 'Password updated successfully' });
});

// DELETE account
router.delete('/me', requireAuth, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required to delete account' });

  const db = getDb();
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.userId);
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  res.json({ message: 'Account deleted successfully' });
});

module.exports = router;
