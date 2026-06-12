const { getDb } = require('../db/turso');
const { requireAuthJson } = require('../middleware/auth');
const { generateTxId, generateUUID } = require('../utils/apikey');
// Import SDK Pakasir dari pakasir.ts
const { Pakasir } = require('../utils/pakasir'); 

const PLAN_PRICES = { premium: 29000, vip: 59000, vvip: 89000 };

// Inisialisasi Pakasir dengan environment variables Anda
const pakasirClient = new Pakasir({
  slug: process.env.PAKASIR_SLUG,
  apikey: process.env.PAKASIR_APIKEY
});

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

  // POST /api/payment/create -> SEKARANG LANGSUNG QRIS
  app.post('/api/payment/create', requireAuthJson, async (req, res) => {
    try {
      const { plan } = req.body;
      const userId = req.user.id;

      if (!plan || !PLAN_PRICES[plan]) {
        return res.status(400).json({ status: false, statusCode: 400, message: 'Plan tidak valid.', error: 'INVALID_PLAN' });
      }

      const db = getDb();
      const amount = PLAN_PRICES[plan];
      const txId = generateUUID();
      const txCode = generateTxId();

      // Cek transaksi pending duplikat
      const dup = await db.execute({ sql: `SELECT id FROM transactions WHERE user_id=? AND status='pending' AND plan=?`, args: [userId, plan] });
      if (dup.rows.length > 0) {
        return res.status(409).json({ status: false, statusCode: 409, message: 'Kamu sudah punya transaksi pending untuk plan ini.', error: 'DUPLICATE_TRANSACTION' });
      }

      const orderId = `ANDRI-${txCode}`;

      // Menggunakan 'qris' untuk langsung menembak QRIS Payment + hitung fee otomatis dari SDK
      const resultPakasir = await pakasirClient.createPayment('qris', orderId, amount);

      // Simpan ke database transaksi awal
      await db.execute({ 
        sql: `INSERT INTO transactions (id, user_id, plan, amount, payment_method, payment_type, midtrans_order_id, account_number, expires_at, status) VALUES (?, ?, ?, ?, 'pakasir', 'qris', ?, ?, ?, 'pending')`, 
        args: [
          txId, 
          userId, 
          plan, 
          resultPakasir.total_payment, 
          orderId, 
          resultPakasir.payment_number || 'QRIS_DIRECT', 
          resultPakasir.expired_at
        ] 
      });

      return res.status(201).json({ 
        status: true, 
        statusCode: 201, 
        message: 'QRIS Berhasil dibuat.', 
        data: {
          transaction_id: txCode,
          order_id: orderId,
          amount: resultPakasir.amount,
          fee: resultPakasir.fee,
          total_payment: resultPakasir.total_payment,
          payment_url: resultPakasir.payment_url, // URL berisi QRIS code / page QRIS
          expired_at: resultPakasir.expired_at
        } 
      });
    } catch (err) {
      console.error('[Payment Create Error]', err);
      return res.status(500).json({ status: false, statusCode: 500, message: err.message || 'Gagal buat pesanan.', error: 'SERVER_ERROR' });
    }
  });

  // POST /api/payment/cancel -> ENDPOINT UNTUK TOMBOL CANCEL
  app.post('/api/payment/cancel', requireAuthJson, async (req, res) => {
    try {
      const { order_id, amount } = req.body;

      if (!order_id || !amount) {
        return res.status(400).json({ status: false, message: 'order_id dan amount diperlukan untuk pembatalan.' });
      }

      // Panggil metode pembatalan dari SDK Pakasir
      await pakasirClient.cancelPayment(order_id, Number(amount));

      // Sinkronisasi status di database lokal Anda
      const db = getDb();
      await db.execute({
        sql: `UPDATE transactions SET status='rejected', updated_at=datetime('now') WHERE midtrans_order_id=? AND user_id=?`,
        args: [order_id, req.user.id]
      });

      return res.status(200).json({ status: true, message: 'Pembayaran berhasil dibatalkan.' });
    } catch (err) {
      console.error('[Payment Cancel Error]', err);
      return res.status(500).json({ status: false, message: 'Gagal membatalkan transaksi ke server.' });
    }
  });

  // GET /api/payment/status -> ENDPOINT UNTUK POLLING LOADING ANIMATION
  app.get('/api/payment/status', requireAuthJson, async (req, res) => {
    try {
      const { order_id, amount } = req.query;

      if (!order_id || !amount) {
        return res.status(400).json({ status: false, message: 'Parameter order_id dan amount wajib ada.' });
      }

      // Ambil detail langsung dari server Pakasir secara real-time
      const check = await pakasirClient.detailPayment(order_id, Number(amount));

      // Jika di server Pakasir terdeteksi sukses/completed, amankan database lokal
      if ((check.status === 'completed' || check.status === 'success' || check.status === 'paid')) {
        const db = getDb();
        const tx = await db.execute({ sql: 'SELECT id, status, plan, user_id FROM transactions WHERE midtrans_order_id=?', args: [order_id] });
        
        if (tx.rows.length > 0 && tx.rows[0].status !== 'paid') {
          const t = tx.rows[0];
          await db.execute({ sql: `UPDATE transactions SET status='paid', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, args: [t.id] });
          
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await db.execute({ sql: `UPDATE users SET plan=?, plan_expires_at=?, updated_at=datetime('now') WHERE id=?`, args: [t.plan, expiresAt.toISOString(), t.user_id] });
          await db.execute({ sql: `UPDATE api_keys SET plan=?, expires_at=?, requests_today=0 WHERE user_id=? AND is_active=1`, args: [t.plan, expiresAt.toISOString(), t.user_id] });
        }
      }

      return res.status(200).json({ status: true, payment_status: check.status });
    } catch (err) {
      return res.status(500).json({ status: false, message: 'Gagal memuat status.' });
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

  // POST /api/payment/webhook — Callback Otomatis Pakasir
  app.post('/api/payment/webhook', async (req, res) => {
    try {
      const { order_id, status } = req.body;
      if (!order_id) return res.status(400).json({ status: false, message: 'Invalid payload' });

      const db = getDb();
      const tx = await db.execute({ sql: 'SELECT id,user_id,plan,status FROM transactions WHERE midtrans_order_id=?', args: [order_id] });
      if (tx.rows.length === 0) return res.status(404).json({ status: false, message: 'Transaction not found' });

      const t = tx.rows[0];
      const isSuccess = (status === 'completed' || status === 'settlement' || status === 'paid');

      if (isSuccess && t.status !== 'paid') {
        await db.execute({ sql: `UPDATE transactions SET status='paid', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, args: [t.id] });
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        await db.execute({ sql: `UPDATE users SET plan=?, plan_expires_at=?, updated_at=datetime('now') WHERE id=?`, args: [t.plan, expiresAt.toISOString(), t.user_id] });
        await db.execute({ sql: `UPDATE api_keys SET plan=?, expires_at=?, requests_today=0 WHERE user_id=? AND is_active=1`, args: [t.plan, expiresAt.toISOString(), t.user_id] });
      } else if (status === 'expire' || status === 'cancel' || status === 'canceled') {
        await db.execute({ sql: `UPDATE transactions SET status='rejected', updated_at=datetime('now') WHERE id=? AND status='pending'`, args: [t.id] });
      }

      return res.status(200).json({ status: true, message: 'OK' });
    } catch (err) {
      console.error('[Webhook]', err);
      return res.status(500).json({ status: false, message: 'Server error' });
    }
  });
};
