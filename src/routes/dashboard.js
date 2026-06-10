// src/routes/dashboard.js
const { getDb } = require('../db/turso');
const { requireAuthJson } = require('../middleware/auth');
const { PLAN_LIMITS } = require('../middleware/ratelimit');

module.exports = function(app) {

  // GET /api/dashboard/stats
  app.get('/api/dashboard/stats', requireAuthJson, async (req, res) => {
    try {
      const db = getDb();
      const uid = req.user.id;

      const [user, keys, daily, topEp, statusDist, monthly, txs] = await Promise.all([
        db.execute({ sql:'SELECT id,name,email,plan,role,avatar,bio,plan_expires_at,created_at FROM users WHERE id=?', args:[uid] }),
        db.execute({ sql:'SELECT id,user_id,key,name,plan,is_active,requests_today,requests_total,last_reset_date,expires_at,created_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC', args:[uid] }),
        db.execute({ sql:`SELECT DATE(created_at) as date, COUNT(*) as count FROM api_logs WHERE user_id=? AND created_at>=date('now','-7 days') GROUP BY DATE(created_at) ORDER BY date ASC`, args:[uid] }),
        db.execute({ sql:`SELECT endpoint, COUNT(*) as count FROM api_logs WHERE user_id=? GROUP BY endpoint ORDER BY count DESC LIMIT 5`, args:[uid] }),
        db.execute({ sql:`SELECT status_code, COUNT(*) as count FROM api_logs WHERE user_id=? AND status_code IS NOT NULL GROUP BY status_code`, args:[uid] }),
        db.execute({ sql:`SELECT COUNT(*) as total FROM api_logs WHERE user_id=? AND created_at>=date('now','-30 days')`, args:[uid] }),
        db.execute({ sql:`SELECT plan,amount,payment_method,status,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 5`, args:[uid] }),
      ]);

      if (user.rows.length === 0) return res.status(404).json({ status:false, statusCode:404, message:'User tidak ditemukan.' });

      const u      = user.rows[0];
      const limits = PLAN_LIMITS[u.plan] || PLAN_LIMITS.free;
      const todayUsage = keys.rows.reduce((a, k) => a + (k.requests_today || 0), 0);
      const totalReqs  = keys.rows.reduce((a, k) => a + (k.requests_total || 0), 0);

      return res.status(200).json({
        status:true, statusCode:200,
        data:{
          user: { ...u, plan_display: u.plan.toUpperCase() },
          limits,
          keys: keys.rows,
          stats:{
            total_requests: totalReqs,
            today_requests: todayUsage,
            monthly_requests: monthly.rows[0]?.total || 0,
            remaining_today: Math.max(0, (limits.per_day >= 999999 ? 999999 : limits.per_day) - todayUsage)
          },
          charts:{
            daily_usage:       daily.rows,
            top_endpoints:     topEp.rows,
            status_distribution: statusDist.rows
          },
          recent_transactions: txs.rows
        }
      });
    } catch (err) {
      console.error('[Dashboard]', err);
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });
};
