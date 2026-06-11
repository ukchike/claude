const jwt = require('jsonwebtoken');
const { getDb } = require('../db/init');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function signToken(userId, jti) {
  return jwt.sign({ sub: userId, jti }, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'No token provided' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const db = getDb();
  const session = db.prepare('SELECT id FROM sessions WHERE token_jti = ?').get(payload.jti);
  if (!session) return res.status(401).json({ error: 'Session revoked' });

  req.userId = payload.sub;
  req.tokenJti = payload.jti;
  next();
}

module.exports = { signToken, requireAuth, JWT_SECRET };
