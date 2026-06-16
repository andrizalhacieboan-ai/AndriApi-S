/**
 * Lokasi File: ./src/api/downloader/ig.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const targetUrl = "https://instadown.web.id/download";

const defaultHeaders = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Content-Type": "application/x-www-form-urlencoded",
  "Origin": "https://instadown.web.id",
  "Referer": "https://instadown.web.id/",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1",
};

// Fungsi pembantu mendekode HTML entity
function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

// Deteksi tipe media berdasarkan ekstensi URL akhir
function detectType(url) {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.includes(".mp4")) return "video";
  if (clean.includes(".jpg") || clean.includes(".jpeg") || clean.includes(".png") || clean.includes(".webp")) return "image";
  return "media";
}

// Ekstraksi elemen media dari markup HTML hasil scraping
function extractMedia(html) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  function push(type, src) {
    const url = decodeHtml(src || "");
    if (!url || seen.has(url)) return;
    seen.add(url);
    results.push({ type, url }); // Format diubah sedikit agar lebih modular ({ type: 'video', url: '...' })
  }

  $("video source").each((_, el) => push("video", $(el).attr("src")));
  $(".media-container video").each((_, el) => push("video", $(el).attr("src")));
  $(".media-container img").each((_, el) => push("image", $(el).attr("src")));

  for (const match of html.matchAll(/forceDownload\('([^']+)'/g)) {
    push(detectType(match[1]), match[1]);
  }

  return results;
}

module.exports = function (app) {

  // Handler utama untuk melayani request download Instagram
  const handleInstagram = async (req, res) => {
    const igUrl = req.body.url || req.query.url;

    if (!igUrl) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter "url" Instagram wajib diisi.',
        error: "URL_REQUIRED"
      });
    }

    // Validasi regex sederhana untuk memastikan itu tautan Instagram
    if (!/instagram\.com/i.test(igUrl)) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'URL yang dimasukkan bukan tautan Instagram yang valid.',
        error: "INVALID_INSTAGRAM_URL"
      });
    }

    const body = new URLSearchParams({ url: igUrl }).toString();

    try {
      const response = await axios.post(targetUrl, body, {
        headers: defaultHeaders,
        timeout: 25000, // Timeout aman untuk proses scraping backend
        maxRedirects: 5,
        responseType: "text",
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        return res.status(502).json({
          status: false,
          statusCode: 502,
          message: `Scraper provider merespons dengan status error: ${response.status}`,
          error: "SCRAPER_PROVIDER_ERROR"
        });
      }

      const html = String(response.data || "");
      const results = extractMedia(html);

      if (results.length === 0) {
        return res.status(422).json({
          status: false,
          statusCode: 422,
          message: "Gagal mengekstrak media. Tautan mungkin privat, kadaluwarsa, atau tidak valid.",
          error: "MEDIA_NOT_FOUND"
        });
      }

      // Struktur respons sukses standar Andri API (status 200)
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading Instagram media",
        data: {
          url: igUrl,
          total: results.length,
          results: results
        }
      });

    } catch (error) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: error.message || "Terjadi kesalahan internal pada server api.",
        error: "SERVER_ERROR"
      });
    }
  };

  // Registrasi Rute Eksekusi Murni dijaga oleh apiKeyMiddleware (Mendukung GET & POST)
  app.get("/api/download/ig", apiKeyMiddleware, handleInstagram);
  app.post("/api/download/ig", apiKeyMiddleware, handleInstagram);
};
