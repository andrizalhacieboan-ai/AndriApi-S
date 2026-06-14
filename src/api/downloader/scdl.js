/**
 * SOUNDCLOUD DOWNLOADER
 * * [•] DESCRIPTION :: Download SoundCloud tracks with high quality audio
 * [•] BASE        :: Convertico Engine Proxy
 * * [!] INTEGRATED FOR ANDRI API (Category: Downloader)
 */

const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const BASE = 'https://convertico.com/';
const ENDPOINT = BASE + 'soundcloud-downloader/soundcloud-downloader.php';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Helper penamaan berkas musik agar bersih dari karakter ilegal
function safeFilename(title, uploader) {
  return `${uploader} - ${title}`
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim() + " (SOUNDCLOUD).mp3";
}

// ==========================================
// EXPRESS ROUTING MODULE FOR ANDRI API
// ==========================================
module.exports = function (app) {

  const handleScdl = async (req, res) => {
    // Mendukung pembacaan via query string ataupun body json
    const target = req.body.url || req.query.url || req.body.link || req.query.link;
    const wantStream = req.query.stream === 'true' || req.body.stream === true;

    if (!target) {
      return res.status(400).json({ 
        status: false, 
        statusCode: 400,
        message: 'Parameter "url" atau "link" wajib diisi.',
        error: "URL_REQUIRED" 
      });
    }

    // Validasi dasar link SoundCloud
    if (!target.includes('soundcloud.com')) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'URL yang dimasukkan bukan tautan SoundCloud yang sah.',
        error: 'INVALID_SOUNDCLOUD_URL'
      });
    }

    const headers = {
      'accept': '*/*',
      'origin': BASE,
      'referer': BASE + 'soundcloud-downloader/',
      'user-agent': UA
    };

    try {
      // 1. Ambil Metadata & Info Lagu SoundCloud
      const responseInfo = await axios.post(ENDPOINT, new URLSearchParams({
        action: 'fetch',
        url: target
      }), { headers });

      const info = responseInfo.data;
      if (!info || !info.status) {
        return res.status(404).json({
          status: false,
          statusCode: 404,
          message: "Gagal mengambil data informasi lagu SoundCloud. Pastikan tautan publik.",
          error: "FETCH_INFO_FAILED"
        });
      }

      // 2. Ambil Link Download & Kalkulasi Ukuran File
      const responseDl = await axios.post(ENDPOINT, new URLSearchParams({
        action: 'download',
        url: target,
        quality: '192',
        is_playlist: '0'
      }), { headers });

      const dl = responseDl.data;
      if (!dl || !dl.file_url) {
        return res.status(500).json({
          status: false,
          statusCode: 500,
          message: "Server convertico gagal merender tautan unduhan MP3.",
          error: "GENERATE_LINK_FAILED"
        });
      }

      // Format Encode URL Download Sesuai Standar Convertico
      const downloadUrl = BASE + 'soundcloud-downloader/' + dl.file_url.split('/').map(encodeURIComponent).join('/');
      const filename = safeFilename(info.title, info.author);

      // 3. JIKA USER/BOT MEMINTA DIRECT BINARY STREAM AUDIO MURNI (&stream=true)
      if (wantStream) {
        const audioFetch = await axios.get(downloadUrl, {
          headers: { "User-Agent": UA },
          responseType: "arraybuffer"
        });
        
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.send(Buffer.from(audioFetch.data));
      }

      // 4. JIKA USER MEMINTA RESPON DATA JSON STANDAR UNTUK WEB DOCUMENTATION
      const currentApikey = req.query.apikey || req.headers['x-api-key'] || '';
      const streamUrl = `${req.protocol}://${req.get('host')}/api/download/scdl?url=${encodeURIComponent(target)}&stream=true${currentApikey ? `&apikey=${currentApikey}` : ''}`;

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading SoundCloud track",
        creator: "Andri Api",
        data: {
          title: info.title,
          uploader: info.author || "Unknown Artist",
          duration: `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}`,
          views: info.view_count ? info.view_count.toLocaleString() : "0",
          likes: info.like_count ? info.like_count.toLocaleString() : "0",
          thumbnail: info.thumbnail || null,
          size: `${(dl.size / 1024 / 1024).toFixed(2)} MB`,
          format: dl.format || "mp3",
          filename: filename,
          url: streamUrl // Mengarahkan ke stream audio internal bot
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal Server Error pada sistem pengunduhan SoundCloud.",
        error: err.response?.data || err.message,
        creator: "Andri Api"
      });
    }
  };

  // Sistem bypass API Key jika user terdeteksi login melalui session cookie dashboard web
  const bypassOrCheckApiKey = (req, res, next) => {
    const hasApiKey = req.query.apikey || req.headers['x-api-key'];
    if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
      return next();
    }
    return apiKeyMiddleware(req, res, next);
  };

  // Daftarkan endpoint ke router utama (Mendukung GET dan POST di path /api/download/scdl)
  app.get("/api/download/scdl", bypassOrCheckApiKey, handleScdl);
  app.post("/api/download/scdl", bypassOrCheckApiKey, handleScdl);
};
