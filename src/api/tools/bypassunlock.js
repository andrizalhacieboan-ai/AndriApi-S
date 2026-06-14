/**
 * BYPASSUNLOCK LINK BYPASSER
 * * [•] DESCRIPTION :: Bypass shortlink/link restriction filters (e.g. Linkvertise)
 * [•] BASE        :: https://trw.lat/api/bypass (BypassUnlock Proxy)
 * * [!] INTEGRATED FOR ANDRI API (Category: Tools)
 */

const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const API = "https://trw.lat/api/bypass";
const API_KEY = "TRW_FREE-GAY-15a92945-9b04-4c75-8337-f2a6007281e9";

// Helper untuk membersihkan hasil string tuple/quote bawaan dari API target
function parseResult(result) {
  if (typeof result !== "string") return result;

  const tupleMatch = result.match(/^\(['"](.+?)['"],\s*(True|False)\)$/);
  if (tupleMatch) return tupleMatch[1];

  const quoteMatch = result.match(/^["'](.+?)["']$/);
  if (quoteMatch) return quoteMatch[1];

  return result;
}

module.exports = function (app) {

  const handleBypass = async (req, res) => {
    const targetUrl = req.body.url || req.query.url || req.body.link || req.query.link;
    const started = Date.now();

    if (!targetUrl) {
      return res.status(400).json({ 
        status: false, 
        statusCode: 400,
        message: 'Parameter "url" atau "link" wajib diisi.',
        error: "URL_REQUIRED" 
      });
    }

    try {
      // Melakukan request ke API TRW menggunakan Axios
      const response = await axios.get(API, {
        params: {
          apikey: API_KEY,
          url: targetUrl.trim()
        },
        headers: {
          "accept": "*/*",
          "origin": "https://bypassunlock.com",
          "referer": "https://bypassunlock.com/",
          "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36"
        },
        timeout: 30000
      });

      const data = response.data;

      // Proteksi jika data respons tidak valid atau sukses false
      if (!data || !data.success || !data.result) {
        return res.status(422).json({
          status: false,
          statusCode: 422,
          message: data.message || data.error || "Proses bypass tautan link gagal.",
          error: "BYPASS_FAILED",
          creator: "Andri Api"
        });
      }

      // Response sukses standar Andri API
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success bypass restriction link URL",
        creator: "Andri Api",
        time_ms: Date.now() - started,
        data: {
          input: targetUrl,
          result_url: parseResult(data.result)
        }
      });

    } catch (err) {
      // Menangkap pesan error mentah dari response jika ada
      const errMsg = err.response && err.response.data ? 
        (err.response.data.message || err.response.data.error || err.message) : err.message;

      return res.status(err.response?.status || 500).json({
        status: false,
        statusCode: err.response?.status || 500,
        message: "Internal Server Error pada sistem bypasser link.",
        error: errMsg,
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

  // Daftarkan routing endpoint ke Express
  app.get("/api/tools/bypassunlock", bypassOrCheckApiKey, handleBypass);
  app.post("/api/tools/bypassunlock", bypassOrCheckApiKey, handleBypass);
};
