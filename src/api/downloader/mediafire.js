/**
 * Lokasi File: ./src/api/downloader/mediafire.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 * Base: https://mediafire.com
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const AUTHOR = "Andri Store"; // Sekarang bebas Anda ubah ke nama apa saja tanpa error

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function extractKey(url) {
  const m = url.match(/\/file\/([a-zA-Z0-9]+)\//);
  return m ? m[1] : null;
}

// CORE SCRAPER MENGGUNAKAN NATIVE FETCH (ZERO DEPENDENCY)
async function scrapeHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    }
  });
  
  if (!res.ok) throw new Error("Gagal mengambil halaman MediaFire");
  const html = await res.text();

  // Ekstraksi Direct Link Download via Regex
  const linkMatch = html.match(/href="(https:\/\/download[^"]+)"/i);
  const link = linkMatch ? linkMatch[1] : null;
  if (!link) throw new Error("Direct download link tidak ditemukan atau file tidak ada");

  // Ekstraksi Judul File via Regex
  let title = null;
  const titleAttrMatch = html.match(/class="dl-btn-label"\s+title="([^"]+)"/i) || html.match(/title="([^"]+)"\s+class="dl-btn-label"/i);
  if (titleAttrMatch) {
    title = titleAttrMatch[1];
  } else {
    const textMatch = html.match(/<div[^>]*class="dl-btn-label"[^>]*>([\s\S]*?)<\/div>/i);
    if (textMatch) title = textMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Ekstraksi Ukuran File via Regex
  let size = "";
  const sizeMatch = html.match(/\(([\d.]+\s*(?:GB|MB|KB|B))\)/i);
  if (sizeMatch) size = sizeMatch[1].trim();

  return { title, size, link };
}

async function getMetaFromApi(key) {
  const res = await fetch(`https://www.mediafire.com/api/1.5/file/get_info.php?quick_key=${key}&response_format=json`, {
    headers: { "User-Agent": UA }
  });
  const json = await res.json();
  const info = json?.response?.file_info;
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

    const handleMediafire = async (req, res) => {
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
            // Jalankan native fetch scraper
            const data = await scrapeHtml(target);

            // Fallback API Mediafire jika data parsial kosong
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

            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success downloading MediaFire media",
                author: AUTHOR,
                data: {
                    title: data.title || "Mediafire_File",
                    size: data.size || "Unknown",
                    url: data.link
                }
            });

        } catch (err) {
            return res.status(500).json({ 
                status: false, 
                statusCode: 500,
                message: err.message || "Internal Server Error saat memproses tautan.", 
                error: "SERVER_ERROR"
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

    app.get("/api/download/mediafire", bypassOrCheckApiKey, handleMediafire);
    app.post("/api/download/mediafire", bypassOrCheckApiKey, handleMediafire);
};
