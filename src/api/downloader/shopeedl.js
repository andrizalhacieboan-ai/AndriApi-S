/**
 * SHOPEE VIDEO DOWNLOADER
 * * [•] DESCRIPTION :: Download Shopee videos without watermark
 * [•] BASE        :: ShopeeNoWatermark Engine Proxy
 * * [!] INTEGRATED FOR ANDRI API (Category: Downloader)
 * [•] CREDIT      :: ShanMolvyr (Jangan hapus, hargai rakyat kecil)
 * [•] FIX         :: Support new shortlink domain (id.shp.ee) + Auto Resolver
 */

const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const BASE_URL = 'https://shopeenowatermark.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Helper untuk menyaring kualitas video terbaik
function bestStream(streams) {
  const order = ['V1080P', 'V720P', 'V540P', 'V360P', 'V1080P_H265', 'V720P_H265', 'V540P_H265', 'V360P_H265'];
  for (const q of order) {
    const s = streams.find(s => s.quality === q);
    if (s) return s;
  }
  return streams[0];
}

module.exports = function (app) {

  const handleShopeeDL = async (req, res) => {
    const target = req.body.url || req.query.url || req.body.link || req.query.link;
    const started = Date.now();

    if (!target) {
      return res.status(400).json({ 
        status: false, 
        statusCode: 400,
        message: 'Parameter "url" atau "link" wajib diisi.',
        error: "URL_REQUIRED" 
      });
    }

    let cleanUrl = target.trim();

    try {
      // FIX 1: Deteksi & Auto-Expand jika user mengirimkan shortlink mobile (shope.ee / id.shp.ee)
      if (cleanUrl.includes('shope.ee') || cleanUrl.includes('shp.ee')) {
        const expandRes = await axios.get(cleanUrl, {
          maxRedirects: 5,
          headers: { 'User-Agent': UA },
          validateStatus: () => true // Mencegah crash jika ada redirect handling khusus dari Shopee
        });
        
        if (expandRes.request?.res?.responseUrl) {
          cleanUrl = expandRes.request.res.responseUrl;
        }
      }

      // FIX 2: Perluasan pola validasi domain Shopee agar mencakup sub-domain shp.ee
      if (!cleanUrl.includes('shopee') && !cleanUrl.includes('shope.ee') && !cleanUrl.includes('shp.ee')) {
        return res.status(400).json({
          status: false,
          statusCode: 400,
          message: 'URL yang dimasukkan bukan tautan Shopee yang sah.',
          error: 'INVALID_SHOPEE_URL'
        });
      }

      // Menggunakan URLSearchParams agar terkirim sebagai form-urlencoded ke API target
      const payload = new URLSearchParams({ url: cleanUrl });

      const response = await axios.post(`${BASE_URL}/api/extract`, payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      const data = response.data;

      if (!data || !data.success) {
        return res.status(422).json({
          status: false,
          statusCode: 422,
          message: data.error || "Gagal mengekstrak video Shopee. Pastikan link video valid dan publik.",
          error: "EXTRACTION_FAILED",
          creator: "Andri Api"
        });
      }

      const streamsArray = data.streams_array || [];
      const best = bestStream(streamsArray);

      if (!best) {
        return res.status(404).json({
          status: false,
          statusCode: 404,
          message: "Tidak ada resolusi video yang ditemukan untuk tautan ini.",
          error: "STREAM_NOT_FOUND",
          creator: "Andri Api"
        });
      }

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading Shopee video",
        creator: "Andri Api",
        credit: "ShanMolvyr (snippet.vyr.my.id)",
        time_ms: Date.now() - started,
        data: {
          username: data.username || "Unknown",
          preview: data.preview || null,
          best: {
            quality: best.quality,
            codec: best.codec,
            url: best.stream_url
          },
          streams: streamsArray.map(s => ({
            quality: s.quality,
            codec: s.codec,
            url: s.stream_url
          }))
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal Server Error pada sistem downloader Shopee.",
        error: err.message,
        creator: "Andri Api",
        time_ms: Date.now() - started
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

  app.get("/api/download/shopee", bypassOrCheckApiKey, handleShopeeDL);
  app.post("/api/download/shopee", bypassOrCheckApiKey, handleShopeeDL);
};
