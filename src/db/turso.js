// src/db/turso.js
// Uses Turso HTTP API directly (no @libsql/client native binary)
// Compatible with Vercel Serverless + any standard Node.js environment

require('dotenv').config();

// ── Turso HTTP client ─────────────────────────────────────────────────────────
function makeTursoClient(url, authToken) {
  const httpUrl = url.replace(/^libsql:\/\//, 'https://');

  async function execute(sqlOrObj, args) {
    // Accept both: execute('SQL', [args]) and execute({ sql, args })
    let sql, params;
    if (typeof sqlOrObj === 'string') {
      sql    = sqlOrObj;
      params = args || [];
    } else {
      sql    = sqlOrObj.sql;
      params = sqlOrObj.args || [];
    }

    // Convert params: undefined/null → null, others stay as-is
    const safeParams = params.map(v => (v === undefined ? null : v));

    const body = {
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: safeParams.map(v => {
              if (v === null)             return { type: 'null' };
              if (typeof v === 'number')  return { type: Number.isInteger(v) ? 'integer' : 'float', value: String(v) };
              if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
              return { type: 'text', value: String(v) };
            })
          }
        },
        { type: 'close' }
      ]
    };

    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Turso HTTP ${res.status}: ${text}`);
    }

    const data   = await res.json();
    const result = data.results?.[0];

    if (result?.type === 'error') {
      throw new Error(`Turso query error: ${result.error?.message || JSON.stringify(result)}`);
    }

    const response = result?.response?.result;
    const cols     = response?.cols?.map(c => c.name) || [];
    const rows     = (response?.rows || []).map(row => {
      const obj = {};
      cols.forEach((col, i) => {
        const cell = row[i];
        if (!cell || cell.type === 'null') { obj[col] = null; return; }
        if (cell.type === 'integer') { obj[col] = parseInt(cell.value, 10); return; }
        if (cell.type === 'float')   { obj[col] = parseFloat(cell.value); return; }
        obj[col] = cell.value;
      });
      return obj;
    });

    return {
      rows,
      rowsAffected: response?.affected_row_count || 0,
      lastInsertRowid: response?.last_insert_rowid || null
    };
  }

  return { execute };
}

// ── In-memory SQLite fallback (for local dev without Turso) ──────────────────
let _betterSqlite = null;
function makeLocalClient(db) {
  return {
    execute(sqlOrObj, args) {
      const sql    = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
      const params = typeof sqlOrObj === 'string' ? (args || []) : (sqlOrObj.args || []);
      const safe   = params.map(v => (v === undefined ? null : v));
      try {
        const stmt = db.prepare(sql);
        // Is it a SELECT?
        if (/^\s*SELECT/i.test(sql)) {
          const rows = stmt.all(...safe);
          return Promise.resolve({ rows, rowsAffected: 0 });
        } else {
          const info = stmt.run(...safe);
          return Promise.resolve({ rows: [], rowsAffected: info.changes, lastInsertRowid: info.lastInsertRowid });
        }
      } catch (e) {
        return Promise.reject(e);
      }
    }
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────
let _db = null;

function getDb() {
  if (_db) return _db;

  const url   = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (url && token) {
    _db = makeTursoClient(url, token);
    console.log('[DB] Using Turso remote database');
  } else {
    // Local fallback: better-sqlite3 in-memory
    try {
      const Database = require('better-sqlite3');
      const sqliteDb = new Database(':memory:');
      _db = makeLocalClient(sqliteDb);
      console.warn('[DB] Turso credentials missing — using in-memory SQLite (better-sqlite3)');
    } catch (e) {
      throw new Error('[DB] No TURSO credentials and better-sqlite3 not available: ' + e.message);
    }
  }

  return _db;
}

// ── Schema + Seed ──────────────────────────────────────────────────────────────
async function initDb() {
  const db = getDb();

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT DEFAULT 'user', plan TEXT DEFAULT 'free',
      plan_expires_at TEXT, avatar TEXT, bio TEXT, is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL,
      ip TEXT, ua TEXT, created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, key TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'Default Key', plan TEXT NOT NULL DEFAULT 'free',
      is_active INTEGER DEFAULT 1, requests_today INTEGER DEFAULT 0,
      requests_total INTEGER DEFAULT 0, last_reset_date TEXT DEFAULT (date('now')),
      expires_at TEXT, created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS api_logs (
      id TEXT PRIMARY KEY, api_key_id TEXT, user_id TEXT,
      endpoint TEXT NOT NULL, method TEXT DEFAULT 'GET',
      status_code INTEGER, response_time INTEGER,
      ip_address TEXT, user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL,
      amount INTEGER NOT NULL, payment_method TEXT NOT NULL, payment_type TEXT,
      status TEXT DEFAULT 'pending', midtrans_order_id TEXT,
      bank_name TEXT, account_number TEXT, proof_url TEXT, admin_notes TEXT,
      expires_at TEXT, paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
      price INTEGER NOT NULL,
      request_limit_per_day INTEGER NOT NULL,
      request_limit_per_hour INTEGER NOT NULL,
      request_limit_per_minute INTEGER NOT NULL,
      features TEXT NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
    )`
  ];

  for (const sql of tables) {
    await db.execute(sql);
  }

  // ── Auto-Migration: Inject missing columns for existing production tables ──
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
  } catch (e) {}
  
  try {
    await db.execute(`ALTER TABLE api_keys ADD COLUMN is_active INTEGER DEFAULT 1`);
  } catch (e) {}

  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN ip TEXT`);
  } catch (e) {}

  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN ua TEXT`);
  } catch (e) {}
  // ───────────────────────────────────────────────────────────────────────────

  // Seed plans
  const planCount = await db.execute('SELECT COUNT(*) as c FROM plans');
  if ((planCount.rows[0]?.c || 0) === 0) {
    const plans = [
      { id:'plan_free',    name:'Free',    slug:'free',    price:0,      day:100,    hour:20,   min:5,    sort:0, feat:['100 req/hari','20 req/jam','5 req/menit','Endpoint dasar','Community support'] },
      { id:'plan_premium', name:'Premium', slug:'premium', price:29000,  day:1000,   hour:100,  min:20,   sort:1, feat:['1.000 req/hari','100 req/jam','20 req/menit','Semua endpoint','Priority support'] },
      { id:'plan_vip',     name:'VIP',     slug:'vip',     price:79000,  day:10000,  hour:500,  min:60,   sort:2, feat:['10.000 req/hari','500 req/jam','60 req/menit','Semua endpoint','24/7 support'] },
      { id:'plan_vvip',    name:'VVIP',    slug:'vvip',    price:199000, day:999999, hour:99999,min:9999, sort:3, feat:['Unlimited requests','Dedicated support','SLA guarantee','Custom integrasi'] },
    ];
    for (const p of plans) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO plans VALUES (?,?,?,?,?,?,?,?,?,1)`,
        args: [p.id, p.name, p.slug, p.price, p.day, p.hour, p.min, JSON.stringify(p.feat), p.sort]
      });
    }
  }

  // Seed admin
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass  = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPass) {
    console.warn('[DB] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed');
  } else {
    const bcrypt = require('bcryptjs');
    const { generateUUID, generateApiKey } = require('../utils/apikey');

    const adminCheck = await db.execute({ sql:'SELECT id FROM users WHERE email=?', args:[adminEmail] });
    if (adminCheck.rows.length === 0) {
      const hashed = await bcrypt.hash(adminPass, 12);
      const uid    = generateUUID();
      const akId   = generateUUID();
      await db.execute({ sql:`INSERT INTO users (id,name,email,password,role,plan) VALUES (?,?,?,?,?,?)`, args:[uid,'Admin',adminEmail,hashed,'admin','vvip'] });
      await db.execute({ sql:`INSERT INTO api_keys (id,user_id,key,plan,name) VALUES (?,?,?,?,?)`, args:[akId,uid,generateApiKey(),'vvip','Admin Key'] });
      console.log(`[DB] Admin seeded: ${adminEmail}`);
    }
  }

  console.log('[DB] ✓ Database initialized');
}

module.exports = { getDb, initDb };
