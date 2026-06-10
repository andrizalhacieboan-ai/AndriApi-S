const { getDb } = require('../db/turso');
const { generateSessionId } = require('../utils/apikey');
const crypto = require('crypto');

const SESSION_COOKIE = 'sid';
const SESSION_TTL_DAYS = 7;

function signValue(val, secret) {
  const hmac = crypto.createHmac('sha256', secret || 'default-secret');
  return val + '.' + hmac.update(val).digest('hex');
}

function unsignValue(signed, secret) {
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return null;
  const val = signed.slice(0, idx);
  const expected = signValue(val, secret);
  if (signed !== expected) return null;
  return val;
}

// Pastikan tabel sessions ada (fallback)
async function ensureSessionsTable() {
  const db = getDb();
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        ip TEXT,
        ua TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  } catch (err) {
    console.error('[Auth] Failed to ensure sessions table:', err.message);
    throw err;
  }
}

async function createSession(userId, req, res) {
  await ensureSessionsTable(); // fallback safety
  const db = getDb();
  const sid = generateSessionId();
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);

  await db.execute({
    sql: `INSERT INTO sessions (id, user_id, expires_at, ip, ua) VALUES (?,?,?,?,?)`,
    args: [sid, userId, expires.toISOString(), req.ip || '', req.headers['user-agent'] || '']
  });

  const signed = signValue(sid, process.env.SESSION_SECRET);
  res.cookie(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_DAYS * 86400 * 1000
  });
  return sid;
}

async function destroySession(req, res) {
  const signed = req.cookies?.[SESSION_COOKIE];
  if (signed) {
    const sid = unsignValue(signed, process.env.SESSION_SECRET);
    if (sid) {
      await getDb().execute({ sql: 'DELETE FROM sessions WHERE id=?', args: [sid] }).catch(() => {});
    }
  }
  res.clearCookie(SESSION_COOKIE);
}

async function resolveUser(req) {
  const signed = req.cookies?.[SESSION_COOKIE];
  if (!signed) return null;
  const sid = unsignValue(signed, process.env.SESSION_SECRET);
  if (!sid) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `SELECT s.id as sid, u.*
          FROM sessions s JOIN users u ON s.user_id = u.id
          WHERE s.id=? AND s.expires_at>? AND u.is_active=1`,
    args: [sid, now]
  });
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

function requireAuth(req, res, next) {
  resolveUser(req).then(user => {
    if (!user) return res.redirect('/login');
    req.user = user;
    next();
  }).catch(() => res.redirect('/login'));
}

function requireAuthJson(req, res, next) {
  resolveUser(req).then(user => {
    if (!user) return res.status(401).json({ status: false, statusCode: 401, message: 'Login required.', error: 'UNAUTHORIZED' });
    req.user = user;
    next();
  }).catch(() => res.status(500).json({ status: false, statusCode: 500, message: 'Auth error.', error: 'SERVER_ERROR' }));
}

function requireAdmin(req, res, next) {
  resolveUser(req).then(user => {
    if (!user || user.role !== 'admin') return res.status(403).json({ status: false, statusCode: 403, message: 'Admin only.', error: 'FORBIDDEN' });
    req.user = user;
    next();
  }).catch(() => res.status(403).json({ status: false, statusCode: 403, message: 'Forbidden.', error: 'FORBIDDEN' }));
}

function requireAdminPage(req, res, next) {
  resolveUser(req).then(user => {
    if (!user || user.role !== 'admin') return res.redirect('/login');
    req.user = user;
    next();
  }).catch(() => res.redirect('/login'));
}

module.exports = { createSession, destroySession, resolveUser, requireAuth, requireAuthJson, requireAdmin, requireAdminPage };
