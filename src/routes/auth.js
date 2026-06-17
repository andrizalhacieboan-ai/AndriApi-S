/**
 * Lokasi File: ./src/routes/auth.js
 * Ditulis khusus untuk backend Andri API
 * Update: Integrasi Hybrid Captcha (Google reCAPTCHA v3 + hCaptcha) - Production Security Level
 */

const bcrypt = require('bcryptjs');
const axios = require('axios');
const { getDb } = require('../db/turso');
const { createSession, destroySession, requireAuthJson } = require('../middleware/auth');
const { generateApiKey, generateUUID } = require('../utils/apikey');

module.exports = function(app) {

  // ==========================================
  // ENDPOINT: REGISTER
  // ==========================================
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name?.trim() || !email?.trim() || !password) {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Nama, email, dan password wajib diisi.', error: 'VALIDATION_ERROR' });
      }
      if (password.length < 6) {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Password minimal 6 karakter.', error: 'WEAK_PASSWORD' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Format email tidak valid.', error: 'INVALID_EMAIL' });
      }

      const db = getDb();
      const exists = await db.execute({ sql: 'SELECT id FROM users WHERE email=?', args: [email.toLowerCase()] });
      if (exists.rows.length > 0) {
        return res.status(409).json({ status: false, statusCode: 409, message: 'Email sudah terdaftar.', error: 'EMAIL_EXISTS' });
      }

      const hashed = await bcrypt.hash(password, 12);
      const uid = generateUUID();
      const akId = generateUUID();

      await db.execute({
        sql: `INSERT INTO users (id, name, email, password, plan) VALUES (?,?,?,?,'free')`,
        args: [uid, name.trim(), email.toLowerCase(), hashed]
      });
      await db.execute({
        sql: `INSERT INTO api_keys (id, user_id, key, plan, name) VALUES (?,?,?,'free','Default Key')`,
        args: [akId, uid, generateApiKey()]
      });

      await createSession(uid, req, res);

      return res.status(201).json({
        status: true, statusCode: 201,
        message: 'Akun berhasil dibuat! Selamat datang di Andri API.',
        data: { id: uid, name: name.trim(), email: email.toLowerCase(), plan: 'free' }
      });
    } catch (err) {
      console.error('[Auth] register:', err);
      return res.status(500).json({ status: false, statusCode: 500, message: 'Registrasi gagal.', error: 'SERVER_ERROR' });
    }
  });

  // ==========================================
  // ENDPOINT: LOGIN (WITH HYBRID CAPTCHA PROTECTION)
  // ==========================================
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password, recaptchaToken, hcaptchaToken } = req.body;
      
      // 1. Validasi Kredensial Dasar
      if (!email || !password) {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Email dan password wajib diisi.', error: 'VALIDATION_ERROR' });
      }

      // 2. Wajibkan Token Google reCAPTCHA v3 dari Frontend
      if (!recaptchaToken) {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Sistem mendeteksi anomali. Token reCAPTCHA wajib disertakan.', error: 'RECAPTCHA_REQUIRED' });
      }

      // 3. Eksekusi Verifikasi Google reCAPTCHA v3 ke Server Google
      const googleRes = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify`,
        new URLSearchParams({
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: recaptchaToken
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      // Keamanan Dasar Google: Sesi harus valid & sukses
      if (!googleRes.data.success) {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Sesi reCAPTCHA kedaluwarsa atau tidak valid.', error: 'INVALID_RECAPTCHA' });
      }

      // Keamanan Ketat Google (Best Practice): Validasi tipe action agar token tidak bisa di-reuse
      if (googleRes.data.action !== 'login') {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Keamanan mendeteksi manipulasi aksi token.', error: 'BAD_CAPTCHA_ACTION' });
      }

      // 4. Evaluasi Skor Bot vs Manusia (Batas aman default: 0.5)
      // Jika skor < 0.5 dan user belum mencoba melewati tebak gambar (hCaptcha), lemparkan trigger hCaptcha
      if (googleRes.data.score < 0.5 && !hcaptchaToken) {
        return res.status(403).json({
          status: false,
          statusCode: 403,
          message: 'Aktivitas mencurigakan terdeteksi. Silakan selesaikan tantangan penyesuaian gambar di bawah.',
          error: 'TRIGGER_HCAPTCHA'
        });
      }

      // 5. Jika Skor Rendah tapi User Berhasil Mengisi hCaptcha Gambar, Verifikasi Token hCaptcha-nya
      if (googleRes.data.score < 0.5 && hcaptchaToken) {
        const hcaptchaRes = await axios.post(
          `https://hcaptcha.com/siteverify`,
          new URLSearchParams({
            secret: process.env.HCAPTCHA_SECRET_KEY,
            response: hcaptchaToken
          }).toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        if (!hcaptchaRes.data.success) {
          return res.status(400).json({ 
            status: false, 
            statusCode: 400, 
            message: 'Gagal memverifikasi kecocokan gambar hCaptcha. Silakan coba lagi.', 
            error: 'INVALID_HCAPTCHA' 
          });
        }
      }

      // 6. Jalankan Autentikasi User ke Database Turso (Lolos Semua Filter Keamanan)
      const db = getDb();
      const r = await db.execute({
        sql: 'SELECT id, name, email, password, role, plan, plan_expires_at, avatar, bio, is_active, created_at FROM users WHERE email=? AND is_active=1',
        args: [email.toLowerCase()]
      });
      if (r.rows.length === 0) {
        return res.status(401).json({ status: false, statusCode: 401, message: 'Email atau password salah.', error: 'INVALID_CREDENTIALS' });
      }

      const user = r.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ status: false, statusCode: 401, message: 'Email atau password salah.', error: 'INVALID_CREDENTIALS' });
      }

      // Buat sesi login aktif
      await createSession(user.id, req, res);

      return res.status(200).json({
        status: true, statusCode: 200,
        message: 'Login berhasil.',
        data: { id: user.id, name: user.name, email: user.email, plan: user.plan, role: user.role }
      });
    } catch (err) {
      console.error('[Auth] login:', err);
      return res.status(500).json({ status: false, statusCode: 500, message: 'Login gagal akibat gangguan internal server.', error: 'SERVER_ERROR' });
    }
  });

  // ==========================================
  // ENDPOINT: LOGOUT
  // ==========================================
  app.post('/api/auth/logout', async (req, res) => {
    await destroySession(req, res);
    return res.status(200).json({ status: true, statusCode: 200, message: 'Logout berhasil.' });
  });

  // ==========================================
  // ENDPOINT: GET PROFILE DATA (ME)
  // ==========================================
  app.get('/api/auth/me', requireAuthJson, async (req, res) => {
    try {
      const db = getDb();
      const keys = await db.execute({
        sql: `SELECT id, key, name, plan, is_active, requests_today, requests_total, expires_at, created_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC`,
        args: [req.user.id]
      });
      const stats = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM api_logs WHERE user_id=? AND created_at>=date('now','-30 days')`,
        args: [req.user.id]
      });

      return res.status(200).json({
        status: true, statusCode: 200,
        data: {
          id: req.user.id, name: req.user.name, email: req.user.email,
          plan: req.user.plan, role: req.user.role, avatar: req.user.avatar,
          bio: req.user.bio, created_at: req.user.created_at,
          plan_expires_at: req.user.plan_expires_at,
          api_keys: keys.rows,
          stats: { monthly_requests: stats.rows[0]?.cnt || 0 }
        }
      });
    } catch (err) {
      return res.status(500).json({ status: false, statusCode: 500, message: 'Server error.', error: 'SERVER_ERROR' });
    }
  });
};
