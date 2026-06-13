/**
 * Lokasi File: ./src/api/tools/welcome.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 * Menghasilkan output berupa gambar murni (Buffer Image)
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
    const title = text || (isWelcome ? 'Selamat Datang' : 'Selamat Tinggal');
    
    const width = 700;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Load Background
    const bg = await loadImage(backgroundURL);
    ctx.drawImage(bg, 0, 0, width, height);

    // Overlay gelap
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(10, 10, width - 20, height - 20);

    // Border
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Load Avatar
    let avatar;
    try {
        avatar = await loadImage(avatarUrl || DEFAULT_AVATAR);
    } catch {
        avatar = await loadImage(DEFAULT_AVATAR);
    }

    const avatarSize = 140;
    const avatarX = width / 2 - avatarSize / 2;
    const avatarY = 60;

    // Lingkaran Avatar Clip
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
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Teks Utama (Title / Nama)
    ctx.font = 'bold 42px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, avatarY + avatarSize + 60);

    // Nama Grup
    ctx.font = '28px Arial';
    ctx.fillStyle = '#E0FFFF';
    ctx.fillText(groupName || 'Grup Chat', width / 2, avatarY + avatarSize + 100);

    // Deskripsi
    ctx.font = '20px Arial';
    ctx.fillStyle = '#FFFFFF';
    const descLines = (groupDesc || 'Selamat datang di komunitas kami!').split('\n').slice(0, 3);
    descLines.forEach((line, i) => {
        ctx.fillText(line.substring(0, 60) + (line.length > 60 ? '...' : ''),
                     width / 2, avatarY + avatarSize + 140 + i * 28);
    });

    // Waktu / Footer
    ctx.font = '18px Arial';
    ctx.fillStyle = '#B0E0E6';
    ctx.fillText(formatWaktuIndonesia(), width / 2, height - 30);

    return canvas.toBuffer();
}

async function drawIntroCard(avatarUrl, userData, customBg) {
    const pushName = userData.nama || 'Member Baru';
    const usia     = userData.usia   || '-';
    const lokasi   = userData.lokasi || '-';
    const funfact  = userData.funfact|| '-';
    const motto    = userData.motto  || '-';
    const group    = userData.group  || 'Grup Kita';

    const maxLength = 28;
    const short = (str) => str.length > maxLength ? str.substring(0, maxLength-3) + '...' : str;

    const width = 700;
    const height = 520;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const bg = await loadImage(customBg || DEFAULT_BG_INTRO);
    ctx.drawImage(bg, 0, 0, width, height);

    // Overlay gelap
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(20, 20, width - 40, height - 40);

    // Border
    ctx.strokeStyle = '#00D4FF';
    ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Load Avatar
    let avatar;
    try {
        avatar = await loadImage(avatarUrl || DEFAULT_AVATAR);
    } catch {
        avatar = await loadImage(DEFAULT_AVATAR);
    }

    const avatarSize = 120;
    const avatarX = width / 2 - avatarSize / 2;
    const avatarY = 45;

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
    ctx.lineWidth = 6;
    ctx.stroke();

    // Judul
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('Kartu Intro', width / 2, avatarY + avatarSize + 60);

    // Teks Biodata Data Intro
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#E0FFFF';
    ctx.textAlign = 'left';

    const startY = avatarY + avatarSize + 110;
    const lineHeight = 35;
    const leftMargin = 70;

    ctx.fillText(`Nama     : ${short(pushName)}`, leftMargin, startY);
    ctx.fillText(`Usia     : ${short(usia)}`,     leftMargin, startY + lineHeight);
    ctx.fillText(`Lokasi   : ${short(lokasi)}`,   leftMargin, startY + lineHeight * 2);
    ctx.fillText(`Fun Fact : ${short(funfact)}`,  leftMargin, startY + lineHeight * 3);
    ctx.fillText(`Motto    : ${short(motto)}`,    leftMargin, startY + lineHeight * 4);

    // Footer Welcoming
    ctx.font = 'italic 20px Arial';
    ctx.fillStyle = '#B0E0E6';
    ctx.textAlign = 'center';
    ctx.fillText(`Selamat bergabung di ${short(group)}! 🍃✨`, width / 2, height - 70);

    ctx.font = '16px Arial';
    ctx.fillText(formatWaktuIndonesia(), width / 2, height - 35);

    return canvas.toBuffer();
}

// ─── EXPRESS ROUTE ROUTING ──────────────────────────────────────────────
module.exports = function (app) {

    const handleGenerateCard = async (req, res) => {
        // Ambil input utama dari body atau query string
        const type = req.body.type || req.query.type || 'welcome'; // welcome, leave, intro
        const url = req.body.url || req.query.url; // Gambar Avatar Utama
        const text = req.body.text || req.query.text; // Text Kustom / Judul / Nama Utama
        const bg = req.body.bg || req.query.bg; // Background Kustom opsional
        
        // Parameter opsional pelengkap untuk tipe welcome/leave
        const group = req.body.group || req.query.group || 'Grup Chat';
        const desc = req.body.desc || req.query.desc || 'Selamat datang di komunitas kami!';

        // Parameter opsional pelengkap khusus tipe intro
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

            // Set Header agar browser membaca response langsung sebagai Gambar murni PNG
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

    /**
     * Gerbang Deteksi Bypass Khusus Console Web / Session Cookie
     */
    const bypassOrCheckApiKey = (req, res, next) => {
        const hasApiKey = req.query.apikey || req.headers['x-api-key'];
        if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
            return next();
        }
        return apiKeyMiddleware(req, res, next);
    };

    // Registrasi Rute Express untuk Welcome Card Tools (GET & POST)
    app.get("/api/tools/welcome", bypassOrCheckApiKey, handleGenerateCard);
    app.post("/api/tools/welcome", bypassOrCheckApiKey, handleGenerateCard);
};
