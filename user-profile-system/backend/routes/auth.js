const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('../db/init');
const { signToken, requireAuth } = require('../middleware/auth');

router.post('/register', (req, res) => {
  const { email, username, password, full_name } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email.toLowerCase(), username);
  if (exists) {
    return res.status(409).json({ error: 'Email or username already taken' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(
    'INSERT INTO users (email, username, password, full_name) VALUES (?, ?, ?, ?)'
  ).run(email.toLowerCase(), username, hash, full_name || username);

  const jti = crypto.randomUUID();
  db.prepare('INSERT INTO sessions (user_id, token_jti) VALUES (?, ?)').run(result.lastInsertRowid, jti);

  const token = signToken(result.lastInsertRowid, jti);
  const user = db.prepare('SELECT id, email, username, full_name, bio, phone, location, website, avatar_url, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const jti = crypto.randomUUID();
  db.prepare('INSERT INTO sessions (user_id, token_jti) VALUES (?, ?)').run(user.id, jti);

  const token = signToken(user.id, jti);
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

router.post('/logout', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token_jti = ?').run(req.tokenJti);
  res.json({ message: 'Logged out successfully' });
});

router.post('/logout-all', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.userId);
  res.json({ message: 'Logged out from all devices' });
});

module.exports = router;
