/**
 * Lokasi File: ./src/api/downloader/tiktok.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 
const axios = require("axios");

// Fungsi inti scraping data dari API TikWM
async function tiktokTikWM(url) {
  try {
    const params = new URLSearchParams();
    params.set("url", url);
    params.set("hd", "1");

    const response = await axios.post("https://tikwm.com/api/", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
        Cookie: "current_language=en",
      },
    });

    if (!response.data) throw new Error("No data found from TikWM");

    return response.data;
  } catch (error) {
    throw new Error(error.message || "Gagal mengambil data TikTok");
  }
}

module.exports = function (app) {

  // Handler universal untuk melayani request download TikTok
  const handleTiktok = async (req, res) => {
    // Fleksibel membaca dari body (POST dari Console) atau query string (GET)
    const url = req.body.url || req.query.url;

    if (!url) {
      return res.status(400).json({ 
        status: false, 
        statusCode: 400,
        message: 'Parameter "url" wajib diisi.',
        error: "URL_REQUIRED" 
      });
    }

    try {
      const result = await tiktokTikWM(url);

      // Struktur respons standar sukses (status 200)
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading TikTok video",
        data: result
      });
    } catch (err) {
      return res.status(500).json({ 
        status: false, 
        statusCode: 500,
        message: err.message, 
        error: "SERVER_ERROR"
      });
    }
  };

  /**
   * Gerbang Deteksi Bypass Khusus:
   * Jika user mengeksekusi dari Console Web bawaan (membawa cookie valid),
   * rute akan diloloskan tanpa mengecek apikey parameter.
   */
  const bypassOrCheckApiKey = (req, res, next) => {
    const hasApiKey = req.query.apikey || req.headers['x-api-key'];
    
    if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
      return next(); // Lolos langsung ke handler
    }
    
    return apiKeyMiddleware(req, res, next); // Validasi API Key via Turso DB
  };

  // Daftarkan rute ke Express (Gunakan prefix /api/ agar sinkron dengan sistem 404 & routing)
  app.get("/api/download/tiktok", bypassOrCheckApiKey, handleTiktok);
  app.post("/api/download/tiktok", bypassOrCheckApiKey, handleTiktok);
};
