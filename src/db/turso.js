// src/db/turso.js
const { createClient } = require('@libsql/client');
require('dotenv/config'); // <-- WAJIB paling atas biar .env kebaca

let _db = null;

function getDb() {
  if (_db) return _db;
  const url  = process.env.TURSO_DATABASE_URL;
  const auth = process.env.TURSO_AUTH_TOKEN;
  
  if (!url || !auth) {
    console.warn('[DB] Turso credentials missing — using local SQLite file');
    _db = createClient({ url: 'file:./dev.db' }); // <-- ganti ini
  } else {
    _db = createClient({ url, authToken: auth });
  }
  return _db;
}

async function initDb() {
  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT DEFAULT 'user',
      plan        TEXT DEFAULT 'free',
      plan_expires_at TEXT,
      avatar      TEXT,
      bio         TEXT,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  // Sessions table — replaces JWT
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip         TEXT,
      ua         TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      key               TEXT UNIQUE NOT NULL,
      name              TEXT DEFAULT 'Default Key',
      plan              TEXT NOT NULL DEFAULT 'free',
      is_active         INTEGER DEFAULT 1,
      requests_today    INTEGER DEFAULT 0,
      requests_total    INTEGER DEFAULT 0,
      last_reset_date   TEXT DEFAULT (date('now')),
      expires_at        TEXT,
      created_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id           TEXT PRIMARY KEY,
      api_key_id   TEXT,
      user_id      TEXT,
      endpoint     TEXT NOT NULL,
      method       TEXT DEFAULT 'GET',
      status_code  INTEGER,
      response_time INTEGER,
      ip_address   TEXT,
      user_agent   TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                    TEXT PRIMARY KEY,
      user_id               TEXT NOT NULL,
      plan                  TEXT NOT NULL,
      amount                INTEGER NOT NULL,
      payment_method        TEXT NOT NULL,
      payment_type          TEXT,
      status                TEXT DEFAULT 'pending',
      midtrans_order_id     TEXT,
      bank_name             TEXT,
      account_number        TEXT,
      proof_url             TEXT,
      admin_notes           TEXT,
      expires_at            TEXT,
      paid_at               TEXT,
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS plans (
      id                       TEXT PRIMARY KEY,
      name                     TEXT NOT NULL,
      slug                     TEXT UNIQUE NOT NULL,
      price                    INTEGER NOT NULL,
      request_limit_per_day    INTEGER NOT NULL,
      request_limit_per_hour   INTEGER NOT NULL,
      request_limit_per_minute INTEGER NOT NULL,
      features                 TEXT NOT NULL,
      sort_order               INTEGER DEFAULT 0,
      is_active                INTEGER DEFAULT 1
    )
  `);

  // Seed plans
  const planCount = await db.execute('SELECT COUNT(*) as c FROM plans');
  if (planCount.rows[0].c === 0) {
    const plans = [
      { id:'plan_free',    name:'Free',    slug:'free',    price:0,      day:100,    hour:20,   min:5,    sort:0, feat:['100 req/hari','20 req/jam','5 req/menit','Endpoint dasar','Community support'] },
      { id:'plan_premium', name:'Premium', slug:'premium', price:29000,  day:1000,   hour:100,  min:20,   sort:1, feat:['1.000 req/hari','100 req/jam','20 req/menit','Semua endpoint','100 requests / bulan dengan Standard Plan'] },
      { id:'plan_vip',     name:'VIP',     slug:'vip',     price:59000,  day:10000,  hour:500,  min:60,   sort:2, feat:['10.000 req/hari','500 req/jam','60 req/menit','Semua endpoint','24/7 support','Custom rate limit'] },
      { id:'plan_vvip',    name:'VVIP',    slug:'vvip',    price:89000, day:999999, hour:99999,min:9999, sort:3, feat:['Unlimited requests','Dedicated support','SLA guarantee','Custom integrasi','API consulting'] },
    ];
    for (const p of plans) {
      await db.execute({ sql:`INSERT OR IGNORE INTO plans VALUES (?,?,?,?,?,?,?,?,?,1)`, args:[p.id,p.name,p.slug,p.price,p.day,p.hour,p.min,JSON.stringify(p.feat),p.sort] });
    }
  }

  // Seed admin
  const bcrypt = require('bcryptjs');
  const { generateUUID } = require('../utils/apikey');
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass  = process.env.ADMIN_PASSWORD;
  const adminCheck = await db.execute({ sql:'SELECT id FROM users WHERE email=?', args:[adminEmail] });
  if (adminCheck.rows.length === 0) {
    const hashed = await bcrypt.hash(adminPass, 12);
    const uid = generateUUID();
    await db.execute({ sql:`INSERT INTO users (id,name,email,password,role,plan) VALUES (?,?,?,?,'admin','vvip')`, args:[uid,'Admin',adminEmail,hashed] });
    console.log(`[DB] Admin seeded: ${adminEmail}`);
  }

  console.log('[DB] ✓ Database initialized');
}

module.exports = { getDb, initDb };
