require('dotenv').config();
const axios = require('axios');
const QRCode = require('qrcode');
const { getDb } = require('../db/turso');
const { requireAuthJson } = require('../middleware/auth');
const { generateUUID } = require('../utils/apikey');

const PLAN_PRICES = { premium: 29000, vip: 59000, vvip: 89000 };

// Inisialisasi variabel global kamu
const slug = process.env.PAKASIR_SLUG;
const apiKey = process.env.PAKASIR_API_KEY;

// Helper internal untuk memproses aktivasi plan di database jika sukses
async function activateUserPlan(db, orderId) {
  const tx = await db.execute({ 
    sql: 'SELECT id, user_id, plan, status FROM transactions WHERE midtrans_order_id=?', 
    args: [orderId] 
  });
  
  if (tx.rows.length > 0 && tx.rows[0].status !== 'paid') {
    const t = tx.rows[0];
    
    // 1. Update status transaksi lokal
    await db.execute({ 
      sql: `UPDATE transactions SET status='paid', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, 
      args: [t.id] 
    });
    
    // 2. Set masa aktif user +30 hari
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    await db.execute({ 
      sql: `UPDATE users SET plan=?, plan_expires_at=?, updated_at=datetime('now') WHERE id=?`, 
      args: [t.plan, expiresAt.toISOString(), t.user_id] 
    });
    
    // 3. Update API Key & reset limit harian
    await db.execute({ 
      sql: `UPDATE api_keys SET plan=?, expires_at=?, requests_today=0 WHERE user_id=? AND is_active=1`, 
      args: [t.plan, expiresAt.toISOString(), t.user_id] 
    });
    
    return true;
  }
  return false;
}

module.exports = function(app) {

  // GET /api/payment/plans
  app.get('/api/payment/plans', async (req, res) => {
    try {
      const db = getDb();
      const r = await db.execute('SELECT id,name,slug,price,request_limit_per_day,request_limit_per_hour,request_limit_per_minute,features,sort_order,is_active FROM plans WHERE is_active=1 ORDER BY sort_order ASC');
      return res.status(200).json({
        status: true, statusCode: 200,
        data: r.rows.map(p => ({ ...p, features: JSON.parse(p.features || '[]') }))
      });
    } catch (err) {
      return res.status(500).json({ status: false, statusCode: 500, message: 'Gagal ambil data plan.', error: 'SERVER_ERROR' });
    }
  });

  // POST /api/payment/create
  app.post('/api/payment/create', requireAuthJson, async (req, res) => {
    try {
      const { plan } = req.body;
      const userId = req.user.id;

      // DEFENSE: Cek apakah API Key dari .env benar-benar terbaca atau tidak sebelum menembak Pakasir
      if (!apiKey || !slug) {
        console.error("[CRITICAL ERROR] File .env untuk Pakasir belum terbaca di server!");
        return res.status(500).json({ 
          status: false, 
          statusCode: 500, 
          message: 'Konfigurasi pembayaran server bermasalah (API Key kosong). Coba restart server kamu.', 
          error: 'ENV_NOT_LOADED' 
        });
      }

      if (!plan || !PLAN_PRICES[plan]) {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Plan tidak valid.', error: 'INVALID_PLAN' });
      }

      const db = getDb();
      const amount = PLAN_PRICES[plan];

      // Cek transaksi pending duplikat
      const dup = await db.execute({ sql: `SELECT id FROM transactions WHERE user_id=? AND status='pending' AND plan=?`, args: [userId, plan] });
      if (dup.rows.length > 0) {
        return res.status(409).json({ status: false, statusCode: 409, message: 'Kamu sudah punya transaksi pending untuk plan ini.', error: 'DUPLICATE_TRANSACTION' });
      }

      // Format Order ID acak
      const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      // Hitung ke API Pakasir QRIS
      const response = await axios.post('https://app.pakasir.com/api/transactioncreate/qris', {
          project: slug, 
          order_id: orderId,
          amount: amount,
          api_Key: apiKey 
      });

      const payment = response.data?.payment; 
      if (!payment?.payment_number) {
        return res.status(502).json({ status: false, message: "QR Pakasir tidak ditemukan dari server luar." });
      }

      // Generate QR Code menjadi dataURL Base64 string
      const qrBase64 = await QRCode.toDataURL(payment.payment_number, { width: 300 });

      // Hitung batas waktu kadaluarsa
      const txId = generateUUID();
      const expiredAt = payment.expired_at || new Date(Date.now() + 30 * 60 * 1000).toISOString();

      // Simpan rincian data transaksi ke Turso SQL DB
      await db.execute({ 
        sql: `INSERT INTO transactions (id, user_id, plan, amount, payment_method, payment_type, midtrans_order_id, account_number, expires_at, status) VALUES (?, ?, ?, ?, 'pakasir', 'qris', ?, ?, ?, 'pending')`, 
        args: [
          txId, 
          userId, 
          plan, 
          payment.total_payment || amount, 
          orderId, 
          payment.payment_number, 
          expiredAt
        ] 
      });

      return res.status(201).json({ 
        status: true, 
        statusCode: 201, 
        message: 'QRIS Berhasil dibuat.', 
        data: {
          order_id: orderId,
          amount: amount,
          fee: payment.fee || 0,
          total_payment: payment.total_payment || amount,
          payment_url: qrBase64, 
          expired_at: expiredAt
        } 
      });
    } catch (err) {
      console.error('[Payment Create Error]', err.response?.data || err);
      return res.status(500).json({ status: false, statusCode: 500, message: err.response?.data?.message || err.message || 'Gagal buat pesanan.', error: 'SERVER_ERROR' });
    }
  });

  // POST /api/payment/cancel
  app.post('/api/payment/cancel', requireAuthJson, async (req, res) => {
    try {
      const { order_id } = req.body;
      if (!order_id) return res.status(400).json({ status: false, message: 'order_id diperlukan untuk pembatalan.' });

      const db = getDb();
      await db.execute({
        sql: `UPDATE transactions SET status='rejected', updated_at=datetime('now') WHERE midtrans_order_id=? AND user_id=? AND status='pending'`,
        args: [order_id, req.user.id]
      });

      return res.status(200).json({ status: true, message: 'Pembayaran berhasil dibatalkan.' });
    } catch (err) {
      return res.status(500).json({ status: false, message: 'Gagal memproses pembatalan.' });
    }
  });

  // GET /api/payment/status
  app.get('/api/payment/status', requireAuthJson, async (req, res) => {
    try {
      const { order_id, amount } = req.query;
      if (!order_id || !amount) {
        return res.status(400).json({ status: false, message: 'Parameter order_id dan amount wajib ada.' });
      }

      const responseCheck = await axios.get("https://app.pakasir.com/api/transactiondetail", {
        params: {
          project: slug,
          order_id: order_id,
          amount: Number(amount),
          api_Key: apiKey
        }
      });

      const rawStatus = responseCheck.data?.transaction?.status || responseCheck.data?.payment?.status || responseCheck.data?.status || "";
      const isPaid = ["paid", "success", "completed"].includes(String(rawStatus).toLowerCase());

      if (isPaid) {
        const db = getDb();
        await activateUserPlan(db, order_id);
      }

      return res.status(200).json({ status: true, payment_status: isPaid ? 'completed' : 'pending' });
    } catch (err) {
      return res.status(500).json({ status: false, message: 'Gagal memuat status verifikasi pembayaran.' });
    }
  });

  // GET /api/payment/history
  app.get('/api/payment/history', requireAuthJson, async (req, res) => {
    try {
      const db = getDb();
      const r = await db.execute({ sql: `SELECT id,user_id,plan,amount,payment_method,payment_type,status,bank_name,account_number,proof_url,admin_notes,expires_at,paid_at,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 30`, args: [req.user.id] });
      return res.status(200).json({ status: true, statusCode: 200, data: r.rows });
    } catch (err) {
      return res.status(500).json({ status: false, statusCode: 500, message: 'Server error.', error: 'SERVER_ERROR' });
    }
  });

  // POST /api/payment/webhook
  app.post('/api/payment/webhook', async (req, res) => {
    try {
      const { order_id, status } = req.body;
      if (!order_id) return res.status(400).json({ status: false, message: 'Invalid payload' });

      const db = getDb();
      const isSuccess = ['completed', 'settlement', 'paid', 'success'].includes(String(status).toLowerCase());

      if (isSuccess) {
        await activateUserPlan(db, order_id);
      } else if (['expire', 'cancel', 'canceled', 'rejected'].includes(String(status).toLowerCase())) {
        await db.execute({ 
          sql: `UPDATE transactions SET status='rejected', updated_at=datetime('now') WHERE midtrans_order_id=? AND status='pending'`, 
          args: [order_id] 
        });
      }

      return res.status(200).json({ status: true, message: 'OK' });
    } catch (err) {
      console.error('[Webhook Error]', err);
      return res.status(500).json({ status: false, message: 'Server error' });
    }
  });
};
