// src/middleware/ratelimit.js
const { getDb } = require('../db/turso');

// ── Plan limits — MATCHES plans table ──────────────────────────────────────
const PLAN_LIMITS = {
  free:    { per_day: 100,    per_hour: 20,    per_minute: 5    },
  premium: { per_day: 1000,  per_hour: 100,   per_minute: 20   },
  vip:     { per_day: 10000, per_hour: 500,   per_minute: 60   },
  vvip:    { per_day: 999999, per_hour: 99999, per_minute: 9999 },
};

// In-memory sliding counters (reset on server restart; DB is source of truth for daily)
const minCounters  = new Map();
const hourCounters = new Map();

function getInMem(map, key, windowMs) {
  const now = Date.now();
  const e   = map.get(key);
  if (!e || now > e.resetAt) { map.set(key, { count:0, resetAt: now + windowMs }); return 0; }
  return e.count;
}
function incInMem(map, key, windowMs) {
  const now = Date.now();
  const e   = map.get(key) || { count:0, resetAt: now + windowMs };
  e.count++;
  map.set(key, e);
}

// ── API Key middleware ─────────────────────────────────────────────────────────
async function apiKeyMiddleware(req, res, next) {
  const raw = req.query.apikey || req.headers['x-api-key'];

  if (!raw) {
    return res.status(401).json({
      status:false, statusCode:401,
      message:'API key wajib disertakan. Gunakan ?apikey=? atau header x-api-key.',
      error:'MISSING_API_KEY', docs:'/docs'
    });
  }

  if (!raw.startsWith('AND+')) {
    return res.status(401).json({
      status:false, statusCode:401,
      message:'Format API key tidak valid.',
      error:'INVALID_KEY_FORMAT'
    });
  }

  const db = getDb();
  try {
    const r = await db.execute({
      sql: `SELECT ak.id, ak.user_id, ak.key, ak.name, ak.plan, ak.is_active,
                   ak.requests_today, ak.requests_total, ak.last_reset_date, ak.expires_at,
                   u.name as uname, u.email as uemail, u.is_active as uactive, u.plan as uplan
            FROM api_keys ak JOIN users u ON ak.user_id=u.id
            WHERE ak.key=? AND ak.is_active=1`,
      args: [raw]
    });

    if (r.rows.length === 0) {
      return res.status(401).json({ status:false, statusCode:401, message:'API key tidak valid atau sudah dinonaktifkan.', error:'INVALID_API_KEY' });
    }

    const k = r.rows[0];

    if (!k.uactive) {
      return res.status(403).json({ status:false, statusCode:403, message:'Akun kamu telah dinonaktifkan.', error:'ACCOUNT_SUSPENDED' });
    }

    // ── KEY ALWAYS uses the current user plan (auto-upgrade after payment) ──
    // If user plan is higher than key plan, sync it.
    const effectivePlan = k.uplan || k.plan || 'free';
    if (effectivePlan !== k.plan) {
      await db.execute({ sql:'UPDATE api_keys SET plan=? WHERE id=?', args:[effectivePlan, k.id] }).catch(()=>{});
      k.plan = effectivePlan;
    }

    // Check plan expiry (if plan_expires_at is set for user)
    if (k.expires_at && new Date(k.expires_at) < new Date() && k.plan !== 'free') {
      // Downgrade to free automatically
      await db.execute({ sql:`UPDATE api_keys SET plan='free' WHERE id=?`, args:[k.id] }).catch(()=>{});
      await db.execute({ sql:`UPDATE users SET plan='free', plan_expires_at=NULL WHERE id=?`, args:[k.user_id] }).catch(()=>{});
      k.plan = 'free';
    }

    const plan   = k.plan;
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Daily reset
    const today = new Date().toISOString().split('T')[0];
    if (k.last_reset_date !== today) {
      await db.execute({ sql:`UPDATE api_keys SET requests_today=0, last_reset_date=? WHERE id=?`, args:[today, k.id] });
      k.requests_today = 0;
    }

    // Per-minute check
    const minCount = getInMem(minCounters, raw, 60000);
    if (minCount >= limits.per_minute) {
      return res.status(429).json({
        status:false, statusCode:429,
        message:`Rate limit: ${limits.per_minute} request/menit untuk plan ${plan}.`,
        error:'RATE_LIMIT_MINUTE', limit:limits.per_minute, plan, upgrade_url:'/pricing'
      });
    }

    // Per-hour check
    const hourCount = getInMem(hourCounters, raw, 3600000);
    if (hourCount >= limits.per_hour) {
      return res.status(429).json({
        status:false, statusCode:429,
        message:`Rate limit: ${limits.per_hour} request/jam untuk plan ${plan}.`,
        error:'RATE_LIMIT_HOUR', limit:limits.per_hour, plan, upgrade_url:'/pricing'
      });
    }

    // Per-day check
    if (k.requests_today >= limits.per_day) {
      return res.status(429).json({
        status:false, statusCode:429,
        message:`Limit harian tercapai: ${limits.per_day} request/hari untuk plan ${plan}. Reset tengah malam.`,
        error:'RATE_LIMIT_DAY', limit:limits.per_day, used:k.requests_today, plan, upgrade_url:'/pricing'
      });
    }

    // Increment
    incInMem(minCounters,  raw, 60000);
    incInMem(hourCounters, raw, 3600000);
    await db.execute({ sql:`UPDATE api_keys SET requests_today=requests_today+1, requests_total=requests_total+1 WHERE id=?`, args:[k.id] });

    // Log (fire-and-forget)
    const logId = require('crypto').randomUUID();
    const start = Date.now();
    res.on('finish', () => {
      db.execute({
        sql:`INSERT INTO api_logs (id,api_key_id,user_id,endpoint,method,status_code,response_time,ip_address,user_agent) VALUES (?,?,?,?,?,?,?,?,?)`,
        args:[logId, k.id, k.user_id, req.path, req.method, res.statusCode, Date.now()-start, req.ip||'', req.headers['user-agent']||'']
      }).catch(()=>{});
    });

    req.apiKey   = k;
    req.apiPlan  = plan;
    req.apiLimits = limits;

    res.set({
      'X-RateLimit-Plan':            plan,
      'X-RateLimit-Limit-Day':       limits.per_day,
      'X-RateLimit-Remaining-Day':   Math.max(0, limits.per_day - k.requests_today - 1),
      'X-RateLimit-Limit-Minute':    limits.per_minute,
      'X-RateLimit-Remaining-Minute':Math.max(0, limits.per_minute - minCount - 1),
    });

    next();
  } catch (err) {
    console.error('[RateLimit]', err.message);
    return res.status(500).json({ status:false, statusCode:500, message:'Server error validasi API key.', error:'SERVER_ERROR' });
  }
}

module.exports = { apiKeyMiddleware, PLAN_LIMITS };
