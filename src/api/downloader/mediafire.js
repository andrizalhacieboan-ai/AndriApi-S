/**
 * Lokasi File: ./src/api/downloader/mediafire.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 * * base: https://mediafire.com
 * Creator: ShanMolvyr 
 * reupload/modif cantumkan sumber ini woii parah
 *
 * Note: cek https://snippet.vyr.my.id/shanmolvyr/mediafire/README.md
 * Sumber Scraper: https://whatsapp.com/channel/0029VbB4Kw8EFeXfeExaXc3Q
 * "Kalau kamu benar seorang developer, kamu pasti paham bahwa credit bukan beban. Modifikasi sesukamu, jadikan API sesukamu, reupload pun silakan. Tapi jangan hilangkan sumber. Karena menghargai karya orang lain adalah etika, bukan kelemahan."
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const AUTHOR = "Andri Andri";
const AUTHOR_CRC = "580496c4";

// ==========================================
// INTEGRITY & HELPER FUNCTIONS
// ==========================================
function crc32(str) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16);
}

if (crc32(AUTHOR) !== AUTHOR_CRC) throw new Error("Integrity check failed");

function extractKey(url) {
  const m = url.match(/\/file\/([a-zA-Z0-9]+)\//);
  return m ? m[1] : null;
}

async function scrapeHtml(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);

  const link = $("a[aria-label='Download file']").attr("href") || $("#downloadButton").attr("href");
  if (!link || !link.startsWith("https://download")) throw new Error("Direct download link not found");

  const title = $(".dl-btn-label").attr("title") || $(".dl-btn-label").text().trim();

  const btnText = $("a[aria-label='Download file']").text().trim();
  const sizeMatch = btnText.match(/\(([^)]+)\)/);
  const size = sizeMatch ? sizeMatch[1] : "";

  return { title, size, link };
}

async function getMetaFromApi(key) {
  const res = await axios.get("https://www.mediafire.com/api/1.5/file/get_info.php", {
    params: { quick_key: key, response_format: "json" },
    headers: { "User-Agent": UA },
    timeout: 10000,
  });
  const info = res.data?.response?.file_info;
  if (!info) throw new Error("No file_info");
  return { title: info.filename, size: formatSize(info.size) };
}

function formatSize(bytes) {
  if (!bytes) return "";
  const b = parseInt(bytes);
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + "GB";
  if (b >= 1048576) return (b / 1048576).toFixed(2) + "MB";
  if (b >= 1024) return (b / 1024).toFixed(2) + "KB";
  return b + "B";
}

// ==========================================
// EXPRESS ROUTING MODULE FOR ANDRI API
// ==========================================
module.exports = function (app) {

    // Handler universal untuk melayani request download MediaFire
    const handleMediafire = async (req, res) => {
        // Mendukung parameter url atau link dari body maupun query string
        const target = req.body.url || req.query.url || req.body.link || req.query.link;

        if (!target) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "url" atau "link" wajib diisi.',
                error: "URL_REQUIRED" 
            });
        }

        if (!target.includes("mediafire.com")) {
            return res.status(400).json({
                status: false,
                statusCode: 400,
                message: "URL tidak valid. Pastikan menggunakan tautan mediafire.com",
                error: "INVALID_URL"
            });
        }

        try {
            // Eksekusi core scraping HTML MediaFire
            const data = await scrapeHtml(target);

            // Fallback ke API Mediafire apabila data parsial kosong
            if (!data.title || !data.size) {
                const key = extractKey(target);
                if (key) {
                    try {
                        const meta = await getMetaFromApi(key);
                        if (!data.title) data.title = meta.title;
                        if (!data.size) data.size = meta.size;
                    } catch (apiErr) {
                        console.error("Mediafire API Fallback Error:", apiErr.message);
                    }
                }
            }

            // Struktur respons standar sukses (status 200) sesuai spesifikasi Andri API
            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success downloading MediaFire media",
                author: AUTHOR,
                data: {
                    title: data.title || null,
                    size: data.size || null,
                    url: data.link
                }
            });

        } catch (err) {
            // Penanganan jika terjadi error server / link mati / gagal parsing
            return res.status(500).json({ 
                status: false, 
                statusCode: 500,
                message: err.message || "Internal Server Error saat memproses tautan.", 
                error: "SERVER_ERROR"
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

    // Registrasi Rute Express (Mendukung GET dan POST)
    app.get("/api/download/mediafire", bypassOrCheckApiKey, handleMediafire);
    app.post("/api/download/mediafire", bypassOrCheckApiKey, handleMediafire);
};
