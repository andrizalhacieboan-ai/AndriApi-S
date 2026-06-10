// src/routes/admin.js
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/turso');
const { requireAdmin } = require('../middleware/auth');
const { generateApiKey, generateUUID } = require('../utils/apikey');
const { PLAN_LIMITS } = require('../middleware/ratelimit');

module.exports = function(app) {

  // GET /api/admin/stats
  app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      const [users, reqs, plans, revenue, pending, newUsers, dailyTrend] = await Promise.all([
        db.execute('SELECT COUNT(*) as c FROM users'),
        db.execute('SELECT COALESCE(SUM(requests_total),0) as t FROM api_keys'),
        db.execute('SELECT plan, COUNT(*) as c FROM users GROUP BY plan'),
        db.execute(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE status='paid'`),
        db.execute(`SELECT COUNT(*) as c FROM transactions WHERE status IN ('pending','confirming')`),
        db.execute(`SELECT COUNT(*) as c FROM users WHERE created_at>=date('now','-7 days')`),
        db.execute(`SELECT DATE(created_at) as d, COUNT(*) as c FROM api_logs WHERE created_at>=date('now','-30 days') GROUP BY DATE(created_at) ORDER BY d ASC`),
      ]);

      return res.status(200).json({
        status:true, statusCode:200,
        data:{
          overview:{
            total_users:     users.rows[0]?.c || 0,
            total_requests:  reqs.rows[0]?.t  || 0,
            total_revenue:   revenue.rows[0]?.t || 0,
            pending_payments:pending.rows[0]?.c || 0,
            new_users_week:  newUsers.rows[0]?.c || 0,
          },
          plan_distribution: plans.rows,
          daily_trend: dailyTrend.rows
        }
      });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // GET /api/admin/users?page=1&search=
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      const page  = parseInt(req.query.page) || 1;
      const limit = 20;
      const offset = (page - 1) * limit;
      const search = req.query.search ? `%${req.query.search}%` : '%';

      const rows  = await db.execute({ sql:`SELECT u.id,u.name,u.email,u.plan,u.role,u.is_active,u.plan_expires_at,u.created_at, (SELECT COUNT(*) FROM api_keys WHERE user_id=u.id) as key_count, (SELECT COALESCE(SUM(requests_total),0) FROM api_keys WHERE user_id=u.id) as total_reqs FROM users u WHERE (u.name LIKE ? OR u.email LIKE ?) ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, args:[search,search,limit,offset] });
      const total = await db.execute({ sql:`SELECT COUNT(*) as c FROM users WHERE name LIKE ? OR email LIKE ?`, args:[search,search] });

      return res.status(200).json({ status:true, statusCode:200, data:{ users:rows.rows, total:total.rows[0]?.c||0, page, per_page:limit } });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // GET /api/admin/users/:id
  app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      const [user, keys, txs, logs] = await Promise.all([
        db.execute({ sql:'SELECT id,name,email,role,plan,plan_expires_at,avatar,bio,is_active,created_at FROM users WHERE id=?', args:[req.params.id] }),
        db.execute({ sql:'SELECT id,user_id,key,name,plan,is_active,requests_today,requests_total,last_reset_date,expires_at,created_at FROM api_keys WHERE user_id=?', args:[req.params.id] }),
        db.execute({ sql:'SELECT id,user_id,plan,amount,payment_method,payment_type,status,bank_name,account_number,proof_url,admin_notes,expires_at,paid_at,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 10', args:[req.params.id] }),
        db.execute({ sql:`SELECT endpoint, COUNT(*) as c FROM api_logs WHERE user_id=? GROUP BY endpoint ORDER BY c DESC LIMIT 5`, args:[req.params.id] }),
      ]);
      if (user.rows.length === 0) return res.status(404).json({ status:false, statusCode:404, message:'User tidak ditemukan.' });
      const u = { ...user.rows[0] };
      delete u.password; // never expose
      return res.status(200).json({ status:true, statusCode:200, data:{ user:u, keys:keys.rows, transactions:txs.rows, top_endpoints:logs.rows } });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // PUT /api/admin/users/:id — edit user (plan, role, active)
  app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const { plan, role, is_active, name } = req.body;
      const db = getDb();
      const updates = ["updated_at=datetime('now')"];
      const args    = [];

      if (plan    !== undefined) { updates.push('plan=?');      args.push(plan); }
      if (role    !== undefined) { updates.push('role=?');      args.push(role); }
      if (is_active !== undefined) { updates.push('is_active=?'); args.push(is_active ? 1 : 0); }
      if (name    !== undefined) { updates.push('name=?');      args.push(name); }

      args.push(req.params.id);
      await db.execute({ sql:`UPDATE users SET ${updates.join(',')} WHERE id=?`, args });

      // If plan changed, sync all active API keys for this user
      if (plan !== undefined) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        await db.execute({ sql:`UPDATE api_keys SET plan=?, expires_at=? WHERE user_id=? AND is_active=1`, args:[plan, expiresAt.toISOString(), req.params.id] });
      }

      return res.status(200).json({ status:true, statusCode:200, message:'User berhasil diperbarui.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // DELETE /api/admin/users/:id
  app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ status:false, statusCode:400, message:'Tidak bisa menghapus akun sendiri.', error:'SELF_DELETE' });
    }
    try {
      const db = getDb();
      await db.execute({ sql:'DELETE FROM api_logs  WHERE user_id=?', args:[req.params.id] });
      await db.execute({ sql:'DELETE FROM api_keys  WHERE user_id=?', args:[req.params.id] });
      await db.execute({ sql:'DELETE FROM sessions  WHERE user_id=?', args:[req.params.id] });
      await db.execute({ sql:'DELETE FROM transactions WHERE user_id=?', args:[req.params.id] });
      await db.execute({ sql:'DELETE FROM users     WHERE id=?',      args:[req.params.id] });
      return res.status(200).json({ status:true, statusCode:200, message:'User berhasil dihapus.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // GET /api/admin/transactions?status=
  app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
    try {
      const db  = getDb();
      const st  = req.query.status;
      const sql = st
        ? `SELECT t.*,u.name as uname,u.email as uemail FROM transactions t JOIN users u ON t.user_id=u.id WHERE t.status=? ORDER BY t.created_at DESC LIMIT 50`
        : `SELECT t.*,u.name as uname,u.email as uemail FROM transactions t JOIN users u ON t.user_id=u.id ORDER BY t.created_at DESC LIMIT 50`;
      const args = st ? [st] : [];
      const r = await db.execute({ sql, args });
      return res.status(200).json({ status:true, statusCode:200, data: r.rows });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // POST /api/admin/transactions/:id/approve — APPROVE payment → upgrade plan & limits
  app.post('/api/admin/transactions/:id/approve', requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      const tx = await db.execute({ sql:'SELECT id,user_id,plan,amount,payment_method,payment_type,status,bank_name,account_number,proof_url,admin_notes,expires_at,paid_at,created_at,updated_at FROM transactions WHERE id=?', args:[req.params.id] });
      if (tx.rows.length === 0) return res.status(404).json({ status:false, statusCode:404, message:'Transaksi tidak ditemukan.' });

      const t = tx.rows[0];
      if (t.status === 'paid') return res.status(400).json({ status:false, statusCode:400, message:'Transaksi sudah disetujui.', error:'ALREADY_PAID' });

      // 1. Mark transaction paid
      await db.execute({ sql:`UPDATE transactions SET status='paid', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, args:[t.id] });

      // 2. Upgrade user plan
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      await db.execute({
        sql:`UPDATE users SET plan=?, plan_expires_at=?, updated_at=datetime('now') WHERE id=?`,
        args:[t.plan, expiresAt.toISOString(), t.user_id]
      });

      // 3. Upgrade ALL active API keys for this user → new limits take effect immediately
      await db.execute({
        sql:`UPDATE api_keys SET plan=?, expires_at=?, requests_today=0 WHERE user_id=? AND is_active=1`,
        args:[t.plan, expiresAt.toISOString(), t.user_id]
      });

      return res.status(200).json({
        status:true, statusCode:200,
        message:`User berhasil diupgrade ke plan ${t.plan}. Limit request langsung bertambah!`,
        data:{ plan: t.plan, expires_at: expiresAt.toISOString(), limits: PLAN_LIMITS[t.plan] }
      });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // POST /api/admin/transactions/:id/reject
  app.post('/api/admin/transactions/:id/reject', requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      const { reason } = req.body;
      await db.execute({ sql:`UPDATE transactions SET status='rejected', admin_notes=?, updated_at=datetime('now') WHERE id=?`, args:[reason||'', req.params.id] });
      return res.status(200).json({ status:true, statusCode:200, message:'Transaksi ditolak.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // GET /api/admin/apikeys
  app.get('/api/admin/apikeys', requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      const r  = await db.execute(`SELECT ak.*,u.name as uname,u.email as uemail FROM api_keys ak JOIN users u ON ak.user_id=u.id ORDER BY ak.created_at DESC LIMIT 100`);
      return res.status(200).json({ status:true, statusCode:200, data: r.rows });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // POST /api/admin/apikeys/:id/revoke
  app.post('/api/admin/apikeys/:id/revoke', requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      await db.execute({ sql:'UPDATE api_keys SET is_active=0 WHERE id=?', args:[req.params.id] });
      return res.status(200).json({ status:true, statusCode:200, message:'API key dinonaktifkan.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });
};
