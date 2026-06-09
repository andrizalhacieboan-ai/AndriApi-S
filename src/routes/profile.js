const bcrypt = require('bcryptjs');
const { getDb } = require('../db/turso');
const { requireAuthJson } = require('../middleware/auth');
const { generateApiKey, generateUUID } = require('../utils/apikey');

module.exports = function(app) {

  // PUT /api/profile — update name, bio, avatar
  app.put('/api/profile', requireAuthJson, async (req, res) => {
    try {
      const { name, bio, avatar } = req.body;
      const db = getDb();
      const updates = [];
      const args   = [];

      if (name?.trim())      { updates.push('name=?');   args.push(name.trim()); }
      if (bio !== undefined) { updates.push('bio=?');    args.push(bio); }
      if (avatar !== undefined) { updates.push('avatar=?'); args.push(avatar); }

      if (updates.length === 0) {
        return res.status(400).json({ status:false, statusCode:400, message:'Tidak ada data yang diubah.', error:'NOTHING_TO_UPDATE' });
      }

      updates.push("updated_at=datetime('now')");
      args.push(req.user.id);
      await db.execute({ sql:`UPDATE users SET ${updates.join(',')} WHERE id=?`, args });

      return res.status(200).json({ status:true, statusCode:200, message:'Profil berhasil diperbarui.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Gagal update profil.', error:'SERVER_ERROR' });
    }
  });

  // PUT /api/profile/password — change password
  app.put('/api/profile/password', requireAuthJson, async (req, res) => {
    try {
      const { current_password, new_password } = req.body;
      if (!current_password || !new_password) {
        return res.status(400).json({ status:false, statusCode:400, message:'current_password dan new_password wajib diisi.', error:'VALIDATION_ERROR' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ status:false, statusCode:400, message:'Password baru minimal 6 karakter.', error:'WEAK_PASSWORD' });
      }

      const db = getDb();
      const r  = await db.execute({ sql:'SELECT password FROM users WHERE id=?', args:[req.user.id] });
      const ok = await bcrypt.compare(current_password, r.rows[0].password);
      if (!ok) return res.status(401).json({ status:false, statusCode:401, message:'Password lama salah.', error:'WRONG_PASSWORD' });

      const hashed = await bcrypt.hash(new_password, 12);
      await db.execute({ sql:`UPDATE users SET password=?, updated_at=datetime('now') WHERE id=?`, args:[hashed, req.user.id] });

      return res.status(200).json({ status:true, statusCode:200, message:'Password berhasil diubah.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Gagal ubah password.', error:'SERVER_ERROR' });
    }
  });

  // POST /api/profile/apikeys — generate API key manually
  app.post('/api/profile/apikeys', requireAuthJson, async (req, res) => {
    try {
      const { name } = req.body;
      const db = getDb();

      const count = await db.execute({ sql:'SELECT COUNT(*) as c FROM api_keys WHERE user_id=? AND is_active=1', args:[req.user.id] });
      if (count.rows[0].c >= 3) {
        return res.status(400).json({ status:false, statusCode:400, message:'Maksimal 3 API key per akun. Hapus key lama terlebih dahulu.', error:'KEY_LIMIT' });
      }

      const userRow  = await db.execute({ sql:'SELECT plan FROM users WHERE id=?', args:[req.user.id] });
      const userPlan = userRow.rows[0]?.plan || 'free';

      const newKey = generateApiKey();
      const keyId  = generateUUID();
      await db.execute({
        sql:  `INSERT INTO api_keys (id, user_id, key, plan, name) VALUES (?,?,?,?,?)`,
        args: [keyId, req.user.id, newKey, userPlan, name?.trim() || 'My Key']
      });

      return res.status(201).json({
        status:true, statusCode:201,
        message:'API key berhasil digenerate.',
        data:{ id:keyId, key:newKey, plan:userPlan, name:name?.trim() || 'My Key' }
      });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Gagal generate API key.', error:'SERVER_ERROR' });
    }
  });

  // DELETE /api/profile/apikeys/:keyId — revoke a key
  app.delete('/api/profile/apikeys/:keyId', requireAuthJson, async (req, res) => {
    try {
      const db = getDb();
      const r  = await db.execute({ sql:'SELECT id FROM api_keys WHERE id=? AND user_id=?', args:[req.params.keyId, req.user.id] });
      if (r.rows.length === 0) {
        return res.status(404).json({ status:false, statusCode:404, message:'API key tidak ditemukan.', error:'NOT_FOUND' });
      }
      await db.execute({ sql:'DELETE FROM api_keys WHERE id=?', args:[req.params.keyId] });
      return res.status(200).json({ status:true, statusCode:200, message:'API key berhasil dihapus.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Gagal hapus key.', error:'SERVER_ERROR' });
    }
  });

  // GET /api/profile/sessions — list active sessions
  app.get('/api/profile/sessions', requireAuthJson, async (req, res) => {
    try {
      const db = getDb();
      const r  = await db.execute({
        sql:  `SELECT id,ip,ua,created_at,expires_at FROM sessions WHERE user_id=? AND expires_at>datetime('now') ORDER BY created_at DESC`,
        args: [req.user.id]
      });
      return res.status(200).json({ status:true, statusCode:200, data: r.rows });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // DELETE /api/profile/sessions/:sid — revoke a session
  app.delete('/api/profile/sessions/:sid', requireAuthJson, async (req, res) => {
    try {
      const db = getDb();
      await db.execute({ sql:'DELETE FROM sessions WHERE id=? AND user_id=?', args:[req.params.sid, req.user.id] });
      return res.status(200).json({ status:true, statusCode:200, message:'Sesi berhasil dicabut.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // POST /api/profile/sessions/revoke-all — FIX: endpoint ini dipanggil frontend tapi tidak ada
  app.post('/api/profile/sessions/revoke-all', requireAuthJson, async (req, res) => {
    try {
      const db     = getDb();
      const crypto = require('crypto');
      const signed = req.cookies?.['sid'];
      let currentSid = null;

      if (signed) {
        const idx = signed.lastIndexOf('.');
        if (idx !== -1) {
          const val  = signed.slice(0, idx);
          const hmac = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'default-secret');
          const expected = val + '.' + hmac.update(val).digest('hex');
          if (signed === expected) currentSid = val;
        }
      }

      if (currentSid) {
        await db.execute({ sql:'DELETE FROM sessions WHERE user_id=? AND id!=?', args:[req.user.id, currentSid] });
      } else {
        await db.execute({ sql:'DELETE FROM sessions WHERE user_id=?', args:[req.user.id] });
      }
      return res.status(200).json({ status:true, statusCode:200, message:'Semua sesi lain berhasil dicabut.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });
};
