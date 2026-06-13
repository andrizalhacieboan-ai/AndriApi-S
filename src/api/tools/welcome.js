/**
 * Lokasi File: ./src/api/tools/welcome.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 * Pembaruan: Optimasi ketajaman teks, Drop Shadow, dan Kolom Presisi.
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 
const { createCanvas, loadImage } = require('canvas');

// ─── SETTING DEFAULT ────────────────────────────────────────────────────
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

// ─── CANVAS GENERATOR HELPERS ───────────────────────────────────────────

async function drawWelcomeOrLeaveCard(type, avatarUrl, text, groupName, groupDesc, customBg) {
    const isWelcome = type === 'welcome';
    const backgroundURL = customBg || (isWelcome ? DEFAULT_BG_WELCOME : DEFAULT_BG_LEAVE);
    
    // Header utama statis
    const titleHeader = isWelcome ? 'Selamat Datang' : 'Selamat Tinggal';
    // Nama member penarget (Jika kosong, default ke 'Member Baru')
    const memberName = text || 'Member Baru';
    
    const width = 700;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Load Background
    const bg = await loadImage(backgroundURL);
    ctx.drawImage(bg, 0, 0, width, height);

    // Overlay gelap (menaikkan kontras latar belakang)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.60)';
    ctx.fillRect(10, 10, width - 20, height - 20);

    // Border Frame Luar
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Load Avatar
    let avatar;
    try {
        avatar = await loadImage(avatarUrl || DEFAULT_AVATAR);
    } catch {
        avatar = await loadImage(DEFAULT_AVATAR);
    }

    const avatarSize = 130;
    const avatarX = width / 2 - avatarSize / 2;
    const avatarY = 45;

    // Lingkaran Avatar Clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Border Lingkaran Avatar
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 5;
    ctx.stroke();

    // ─── KONFIGURASI BAYANGAN TEKS (DROP SHADOW) AGAR JELAS ───
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    // 1. Teks Status (Selamat Datang / Tinggal)
    ctx.font = 'bold 34px "Arial, sans-serif"';
    ctx.fillStyle = '#00D4FF'; // Warna cyan neon cerah
    ctx.textAlign = 'center';
    ctx.fillText(titleHeader, width / 2, avatarY + avatarSize + 45);

    // 2. Teks Nama Member (Sekarang Muncul & Jelas!)
    ctx.font = 'bold 28px "Arial, sans-serif"';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(memberName, width / 2, avatarY + avatarSize + 85);

    // 3. Nama Grup
    ctx.font = 'italic 22px "Arial, sans-serif"';
    ctx.fillStyle = '#E0FFFF';
    ctx.fillText(`@ ${groupName || 'Grup Chat'}`, width / 2, avatarY + avatarSize + 120);

    // 4. Deskripsi Grup (Batas 2 baris agar tidak tabrakan ke footer)
    ctx.font = '16px "Arial, sans-serif"';
    ctx.fillStyle = '#DCDCDC';
    const cleanDesc = (groupDesc || 'Selamat bergabung di komunitas kami!').replace(/\r/g, '');
    const descLines = cleanDesc.split('\n').filter(l => l.trim() !== '').slice(0, 2);
    
    descLines.forEach((line, i) => {
        const truncatedLine = line.substring(0, 65) + (line.length > 65 ? '...' : '');
        ctx.fillText(truncatedLine, width / 2, avatarY + avatarSize + 155 + i * 24);
    });

    // 5. Waktu / Footer regional
    ctx.font = '14px "Arial, sans-serif"';
    ctx.fillStyle = '#B0E0E6';
    ctx.fillText(formatWaktuIndonesia(), width / 2, height - 25);

    return canvas.toBuffer();
}

async function drawIntroCard(avatarUrl, userData, customBg) {
    const pushName = userData.nama || 'Member Baru';
    const usia     = userData.usia   || '-';
    const lokasi   = userData.lokasi || '-';
    const funfact  = userData.funfact|| '-';
    const motto    = userData.motto  || '-';
    const group    = userData.group  || 'Grup Kita';

    const maxLength = 35;
    const short = (str) => str.length > maxLength ? str.substring(0, maxLength-3) + '...' : str;

    const width = 700;
    const height = 520;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const bg = await loadImage(customBg || DEFAULT_BG_INTRO);
    ctx.drawImage(bg, 0, 0, width, height);

    // Overlay gelap kontras tinggi
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(20, 20, width - 40, height - 40);

    // Border Frame
    ctx.strokeStyle = '#00D4FF';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Load Avatar
    let avatar;
    try {
        avatar = await loadImage(avatarUrl || DEFAULT_AVATAR);
    } catch {
        avatar = await loadImage(DEFAULT_AVATAR);
    }

    const avatarSize = 110;
    const avatarX = width / 2 - avatarSize / 2;
    const avatarY = 40;

    // Crop Avatar Bulat
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Border Avatar
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = '#00D4FF';
    ctx.lineWidth = 5;
    ctx.stroke();

    // ─── KONFIGURASI SHADOW ───
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Judul Besar Kartu
    ctx.font = 'bold 30px "Arial, sans-serif"';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('KARTU INTRODUKSI', width / 2, avatarY + avatarSize + 45);

    // Pembagian Kolom Teks (Akurasi Sejajar Titik Dua Tanpa Rusak oleh Spasi Font Propropional)
    const labels = ['Nama', 'Usia', 'Lokasi', 'Fun Fact', 'Motto'];
    const values = [pushName, usia, lokasi, funfact, motto];
    
    const startY = avatarY + avatarSize + 95;
    const lineHeight = 34;
    const labelX = 80;       // Koordinat kiri awal teks Label
    const valueX = 210;      // Koordinat kiri awal teks Value (Sejajar Sempurna!)

    labels.forEach((label, i) => {
        // Menggambar Label Kiri (Cyan Neon)
        ctx.font = 'bold 19px "Arial, sans-serif"';
        ctx.fillStyle = '#00D4FF';
        ctx.textAlign = 'left';
        ctx.fillText(label, labelX, startY + i * lineHeight);

        // Menggambar Isi / Nilai Kanan (Putih)
        ctx.font = '19px "Arial, sans-serif"';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`:  ${short(values[i])}`, valueX, startY + i * lineHeight);
    });

    // Footer Welcoming kalimat penutup
    ctx.font = 'italic 18px "Arial, sans-serif"';
    ctx.fillStyle = '#B0E0E6';
    ctx.textAlign = 'center';
    ctx.fillText(`Selamat bergabung di ${short(group)}! 🍃✨`, width / 2, height - 65);

    // Waktu Realtime Indonesia
    ctx.font = '14px "Arial, sans-serif"';
    ctx.fillText(formatWaktuIndonesia(), width / 2, height - 35);

    return canvas.toBuffer();
}

// ─── EXPRESS ROUTE ROUTING ──────────────────────────────────────────────
module.exports = function (app) {

    const handleGenerateCard = async (req, res) => {
        const type = req.body.type || req.query.type || 'welcome'; 
        const url = req.body.url || req.query.url; 
        const text = req.body.text || req.query.text; 
        const bg = req.body.bg || req.query.bg; 
        
        const group = req.body.group || req.query.group || 'Grup Chat';
        const desc = req.body.desc || req.query.desc || 'Selamat datang di komunitas kami!';

        const userData = {
            nama: text || req.body.nama || req.query.nama || 'Member Baru',
            usia: req.body.usia || req.query.usia || '-',
            lokasi: req.body.lokasi || req.query.lokasi || '-',
            funfact: req.body.funfact || req.query.funfact || '-',
            motto: req.body.motto || req.query.motto || '-',
            group: group
        };

        if (!url) {
            return res.status(400).json({
                status: false,
                statusCode: 400,
                message: 'Parameter "url" (untuk tautan gambar avatar/profil) wajib diisi.',
                error: "AVATAR_URL_REQUIRED"
            });
        }

        try {
            let buffer;

            if (type === 'intro') {
                buffer = await drawIntroCard(url, userData, bg);
            } else if (type === 'leave') {
                buffer = await drawWelcomeOrLeaveCard('leave', url, text, group, desc, bg);
            } else {
                buffer = await drawWelcomeOrLeaveCard('welcome', url, text, group, desc, bg);
            }

            if (!buffer) throw new Error("Gagal memproses data gambar kartu.");

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
                message: err.message || "Terjadi kesalahan internal pada Canvas Engine.",
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

    app.get("/api/tools/welcome", bypassOrCheckApiKey, handleGenerateCard);
    app.post("/api/tools/welcome", bypassOrCheckApiKey, handleGenerateCard);
};
