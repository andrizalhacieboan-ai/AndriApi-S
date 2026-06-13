/**
 * Lokasi File: ./src/api/tools/welcome.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 * Pembaruan: Hanya menggunakan parameter url, type, dan text. 
 * Perbaikan font anti kotak-kotak dengan sistem fallback sans-serif universal.
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 
const { createCanvas, loadImage } = require('canvas');

// ─── SETTING DEFAULT BACKGROUND ─────────────────────────────────────────
const DEFAULT_BG_WELCOME = 'https://c.termai.cc/i168/tp4.jpeg';
const DEFAULT_BG_LEAVE   = 'https://c.termai.cc/i131/4tEDA.jpeg';
const DEFAULT_BG_INTRO   = 'https://files.catbox.moe/cp29pc.jpg';
const DEFAULT_AVATAR     = 'https://files.catbox.moe/cp29pc.jpg';

function formatWaktuIndonesia() {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    return now.toLocaleString('id-ID', options) + ' WIB';
}

// Fungsi pembantu untuk membersihkan teks dari karakter aneh yang memicu kotak-kotak
function sanitizeText(str) {
    if (!str) return '';
    // Mengizinkan Alphanumeric, spasi, dan tanda baca standar agar canvas tidak render kotak
    return str.replace(/[^\x20-\x7E]/g, '').trim();
}

// ─── CANVAS GENERATOR ENGINE ────────────────────────────────────────────

async function drawCard(type, avatarUrl, customText, customBg) {
    // Penentuan Tema Berdasarkan Type
    let backgroundURL = customBg;
    let titleHeader = '';
    
    if (type === 'leave') {
        backgroundURL = customBg || DEFAULT_BG_LEAVE;
        titleHeader = 'Selamat Tinggal';
    } else if (type === 'intro') {
        backgroundURL = customBg || DEFAULT_BG_INTRO;
        titleHeader = 'Profil Introduksi';
    } else {
        backgroundURL = customBg || DEFAULT_BG_WELCOME;
        titleHeader = 'Selamat Datang';
    }
    
    // Nama target / isi teks utama bersih dari karakter perusak font
    const mainTargetText = sanitizeText(customText) || (type === 'intro' ? 'New Member' : 'Member Baru');
    
    const width = 700;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Draw Background
    const bg = await loadImage(backgroundURL);
    ctx.drawImage(bg, 0, 0, width, height);

    // 2. Overlay Gelap untuk Kontras Tinggi (Teks jadi super jelas)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(15, 15, width - 30, height - 30);

    // 3. Border Frame Card
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 6;
    ctx.strokeRect(15, 15, width - 30, height - 30);

    // 4. Load & Render Avatar Bulat
    let avatar;
    try {
        avatar = await loadImage(avatarUrl || DEFAULT_AVATAR);
    } catch {
        avatar = await loadImage(DEFAULT_AVATAR);
    }

    const avatarSize = 140;
    const avatarX = width / 2 - avatarSize / 2;
    const avatarY = 50;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Border Ring Avatar
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 5;
    ctx.stroke();

    // ─── SETTING ANTI-BOX / SHADOW TEKS ───
    // Memberikan bayangan tegas di belakang teks agar terbaca di background mana pun
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.textAlign = 'center';

    // 5. Render Teks Status / Header Atas (Menggunakan sans-serif universal agar tidak kotak-kotak)
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#00D4FF'; 
    ctx.fillText(titleHeader, width / 2, avatarY + avatarSize + 55);

    // 6. Render Teks Nama / Custom Text Utama (Ukuran disesuaikan agar proporsional)
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    
    // Potong teks jika terlalu panjang agar tidak keluar dari frame gambar
    const displayText = mainTargetText.length > 35 ? mainTargetText.substring(0, 32) + '...' : mainTargetText;
    ctx.fillText(displayText, width / 2, avatarY + avatarSize + 105);

    // 7. Render Waktu Realtime Jakarta di Bagian Footer bawah
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#B0E0E6';
    ctx.fillText(formatWaktuIndonesia(), width / 2, height - 35);

    return canvas.toBuffer();
}

// ─── EXPRESS ROUTE ROUTING ──────────────────────────────────────────────
module.exports = function (app) {

    const handleGenerateCard = async (req, res) => {
        // Hanya menangkap parameter utama: type, url, text, dan bg (opsional)
        const type = req.body.type || req.query.type || 'welcome'; 
        const url = req.body.url || req.query.url; 
        const text = req.body.text || req.query.text; 
        const bg = req.body.bg || req.query.bg; 

        if (!url) {
            return res.status(400).json({
                status: false,
                statusCode: 400,
                message: 'Parameter "url" (tautan gambar profil/avatar) wajib diisi.',
                error: "AVATAR_URL_REQUIRED"
            });
        }

        try {
            // Memproses gambar kartu dengan komposisi data baru
            const buffer = await drawCard(type.toLowerCase(), url, text, bg);

            if (!buffer) throw new Error("Gagal merender struktur gambar kartu.");

            // Mengirimkan response murni berupa file gambar PNG yang tajam
            res.set({
                'Content-Type': 'image/png',
                'Content-Length': buffer.length,
                'Cache-Control': 'public, max-age=86400'
            });

            return res.send(buffer);

        } catch (err) {
            return res.status(500).json({
                status: false,
                statusCode: 500,
                message: err.message || "Terjadi kegagalan pada Canvas Rendering Engine.",
                error: "CANVAS_GENERATE_ERROR"
            });
        }
    };

    const bypassOrCheckApiKey = (req, res, next) => {
        const hasApiKey = req.query.apikey || req.headers['x-api-key'];
        if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
            return next();
        }
        return apiKeyMiddleware(req, res, next);
    };

    // Routing Endpoint GET & POST
    app.get("/api/tools/welcome", bypassOrCheckApiKey, handleGenerateCard);
    app.post("/api/tools/welcome", bypassOrCheckApiKey, handleGenerateCard);
};
