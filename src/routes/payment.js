// src/routes/payment.js
const { getDb } = require('../db/turso');
const { requireAuthJson } = require('../middleware/auth');
const { generateTxId, generateUUID } = require('../utils/apikey');

const PLAN_PRICES  = { premium:29000, vip:59000, vvip:89000 };
const BANK_LIST    = [
  { bank:'BCA',     number:'tidak tersedia',  name:'Andri' },
  { bank:'BNI',     number:'tidak tersedia',  name:'Andri' },
  { bank:'Mandiri', number:'tidak tersedia',  name:'Andri' },
];
const EWALLET_LIST = [
  { provider:'GoPay',     number:'081934874758', name:'Andri' },
  { provider:'OVO',       number:'081934874758', name:'Andri' },
  { provider:'DANA',      number:'081934874758', name:'Andri' },
  { provider:'ShopeePay', number:'081934874758', name:'Andri' },
];

module.exports = function(app) {

  // GET /api/payment/plans
  app.get('/api/payment/plans', async (req, res) => {
    try {
      const db = getDb();
      const r  = await db.execute('SELECT * FROM plans WHERE is_active=1 ORDER BY sort_order ASC');
      return res.status(200).json({
        status:true, statusCode:200,
        data: r.rows.map(p => ({ ...p, features: JSON.parse(p.features || '[]') }))
      });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Gagal ambil data plan.', error:'SERVER_ERROR' });
    }
  });

  // POST /api/payment/create
  app.post('/api/payment/create', requireAuthJson, async (req, res) => {
    try {
      const { plan, payment_method, bank_name, ewallet_provider } = req.body;
      const userId = req.user.id;

      if (!plan || !payment_method) {
        return res.status(400).json({ status:false, statusCode:400, message:'plan dan payment_method wajib diisi.', error:'VALIDATION_ERROR' });
      }
      if (plan === 'free') {
        return res.status(400).json({ status:false, statusCode:400, message:'Free plan tidak perlu pembayaran.', error:'INVALID_PLAN' });
      }
      if (!PLAN_PRICES[plan]) {
        return res.status(400).json({ status:false, statusCode:400, message:'Plan tidak valid. Pilih: premium, vip, vvip', error:'INVALID_PLAN' });
      }

      const validMethods = ['pakasir','bank_transfer','ewallet'];
      if (!validMethods.includes(payment_method)) {
        return res.status(400).json({ status:false, statusCode:400, message:'Metode tidak valid. Pilih: pakasir, bank_transfer, ewallet', error:'INVALID_METHOD' });
      }

      const db  = getDb();
      const amount = PLAN_PRICES[plan];
      const txId   = generateUUID();
      const txCode = generateTxId();

      // Check duplicate pending
      const dup = await db.execute({ sql:`SELECT id FROM transactions WHERE user_id=? AND status='pending' AND plan=?`, args:[userId, plan] });
      if (dup.rows.length > 0) {
        return res.status(409).json({ status:false, statusCode:409, message:'Kamu sudah punya transaksi pending untuk plan ini.', error:'DUPLICATE_TRANSACTION' });
      }

      let resData = {};

      if (payment_method === 'pakasir') {
        const orderId = `ANDRI-${txCode}`;
        // Production: call Midtrans Snap API here
        const snapToken  = `snap-mock-${Date.now()}`;
        const paymentUrl = `https://app.midtrans.com/snap/v2/vtweb/${snapToken}`;

        await db.execute({ sql:`INSERT INTO transactions (id,user_id,plan,amount,payment_method,payment_type,midtrans_order_id) VALUES (?,?,?,?,'pakasir','midtrans',?)`, args:[txId,userId,plan,amount,orderId] });

        resData = {
          transaction_id: txCode, order_id: orderId, amount, plan,
          payment_method: 'pakasir',
          payment_url: paymentUrl, snap_token: snapToken,
          instructions: ['Klik link payment untuk bayar via Pakasir','Mendukung CC, GoPay, OVO, DANA, Indomaret, dll','Konfirmasi otomatis setelah pembayaran sukses']
        };

      } else if (payment_method === 'bank_transfer') {
        const bankData   = BANK_LIST.find(b => b.bank.toLowerCase() === (bank_name||'').toLowerCase()) || BANK_LIST[0];
        const uniqueAmt  = amount + (userId.charCodeAt(0) % 999 + 1);

        await db.execute({ sql:`INSERT INTO transactions (id,user_id,plan,amount,payment_method,payment_type,bank_name,account_number) VALUES (?,?,?,?,'bank_transfer',?,?,?)`, args:[txId,userId,plan,uniqueAmt,bankData.bank,bankData.bank,bankData.number] });

        resData = {
          transaction_id: txCode, amount: uniqueAmt, unique_code: uniqueAmt - amount, plan,
          payment_method: 'bank_transfer',
          bank: bankData,
          all_banks: BANK_LIST,
          instructions: [`Transfer Rp ${uniqueAmt.toLocaleString('id-ID')} (ada kode unik)`,`Tujuan: ${bankData.bank} ${bankData.number} a.n ${bankData.name}`,'Upload bukti transfer di /dashboard → Transactions','Konfirmasi manual 1-24 jam hari kerja']
        };

      } else {
        const ew = EWALLET_LIST.find(e => e.provider.toLowerCase() === (ewallet_provider||'').toLowerCase()) || EWALLET_LIST[0];
        await db.execute({ sql:`INSERT INTO transactions (id,user_id,plan,amount,payment_method,payment_type,bank_name,account_number) VALUES (?,?,?,?,'ewallet',?,?,?)`, args:[txId,userId,plan,amount,ew.provider,ew.provider,ew.number] });

        resData = {
          transaction_id: txCode, amount, plan,
          payment_method: 'ewallet',
          ewallet: ew,
          all_ewallets: EWALLET_LIST,
          instructions: [`Transfer Rp ${amount.toLocaleString('id-ID')} ke ${ew.provider} ${ew.number}`,`Nama: ${ew.name}`,`Cantumkan ID: ${txCode} di keterangan transfer`,'Upload bukti di /dashboard → Transactions','Konfirmasi 1-12 jam']
        };
      }

      return res.status(201).json({ status:true, statusCode:201, message:'Pesanan pembayaran berhasil dibuat.', data: resData });
    } catch (err) {
      console.error('[Payment]', err);
      return res.status(500).json({ status:false, statusCode:500, message:'Gagal buat pesanan.', error:'SERVER_ERROR' });
    }
  });

  // GET /api/payment/history
  app.get('/api/payment/history', requireAuthJson, async (req, res) => {
    try {
      const db = getDb();
      const r  = await db.execute({ sql:`SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 30`, args:[req.user.id] });
      return res.status(200).json({ status:true, statusCode:200, data: r.rows });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // POST /api/payment/confirm — upload proof (manual)
  app.post('/api/payment/confirm', requireAuthJson, async (req, res) => {
    try {
      const { transaction_id, proof_url, notes } = req.body;
      if (!proof_url) {
        return res.status(400).json({ status:false, statusCode:400, message:'proof_url wajib diisi.', error:'VALIDATION_ERROR' });
      }
      const db = getDb();
      let sql, args;
      if (transaction_id) {
        sql = `UPDATE transactions SET proof_url=?, admin_notes=?, status='confirming', updated_at=datetime('now') WHERE user_id=? AND id=? AND status='pending'`;
        args = [proof_url, notes||'', req.user.id, transaction_id];
      } else {
        // Fallback: update most recent pending transaction
        const pending = await db.execute({ sql:'SELECT id FROM transactions WHERE user_id=? AND status=? ORDER BY created_at DESC LIMIT 1', args:[req.user.id,'pending'] });
        if (pending.rows.length === 0) {
          return res.status(404).json({ status:false, statusCode:404, message:'Transaksi pending tidak ditemukan.', error:'NOT_FOUND' });
        }
        sql = `UPDATE transactions SET proof_url=?, admin_notes=?, status='confirming', updated_at=datetime('now') WHERE id=?`;
        args = [proof_url, notes||'', pending.rows[0].id];
      }
      await db.execute({ sql, args });
      return res.status(200).json({ status:true, statusCode:200, message:'Bukti pembayaran berhasil dikirim. Admin akan memverifikasi dalam 1-24 jam.' });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:'SERVER_ERROR' });
    }
  });

  // POST /api/payment/webhook — Pakasir/Midtrans webhook callback
  app.post('/api/payment/webhook', async (req, res) => {
    try {
      const { order_id, transaction_status, fraud_status } = req.body;
      if (!order_id) return res.status(400).json({ status:false, message:'Invalid payload' });

      const db = getDb();
      // Find transaction by midtrans_order_id
      const tx = await db.execute({ sql:'SELECT * FROM transactions WHERE midtrans_order_id=?', args:[order_id] });
      if (tx.rows.length === 0) return res.status(404).json({ status:false, message:'Transaction not found' });

      const t = tx.rows[0];
      const isSuccess = (transaction_status === 'settlement' || transaction_status === 'capture') && fraud_status !== 'deny';

      if (isSuccess && t.status !== 'paid') {
        // Mark paid
        await db.execute({ sql:`UPDATE transactions SET status='paid', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, args:[t.id] });
        // Upgrade user plan
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        await db.execute({ sql:`UPDATE users SET plan=?, plan_expires_at=?, updated_at=datetime('now') WHERE id=?`, args:[t.plan, expiresAt.toISOString(), t.user_id] });
        await db.execute({ sql:`UPDATE api_keys SET plan=?, expires_at=?, requests_today=0 WHERE user_id=? AND is_active=1`, args:[t.plan, expiresAt.toISOString(), t.user_id] });
        console.log(`[Webhook] Payment approved: ${order_id} → plan ${t.plan} for user ${t.user_id}`);
      } else if (transaction_status === 'expire' || transaction_status === 'cancel') {
        await db.execute({ sql:`UPDATE transactions SET status='rejected', updated_at=datetime('now') WHERE id=? AND status='pending'`, args:[t.id] });
      }

      return res.status(200).json({ status:true, message:'OK' });
    } catch (err) {
      console.error('[Webhook]', err);
      return res.status(500).json({ status:false, message:'Server error' });
    }
  });
};
