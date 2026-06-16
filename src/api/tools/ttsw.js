/**
 * Lokasi File: ./src/api/tools/ttsw.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 * Fitur: TikTok Story Viewer & Downloader Scraper
 */

const axios = require("axios");
const { load } = require("cheerio");
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const BASE = "https://snaptik.kim/tiktok-story-viewer/?sdl=1";

/**
 * Ekstraksi username secara aman dari teks mentah ataupun URL profil terformat
 */
function parseUsername(input) {
  if (!input) return "";
  input = input.trim();
  try {
    const url = new URL(input.startsWith("http") ? input : "https://" + input);
    if (url.hostname.includes("tiktok.com")) {
      const match = url.pathname.match(/\/@?([^/]+)/);
      if (match) return match[1].replace(/^@/, "");
    }
  } catch {}
  return input.replace(/^@/, "");
}

/**
 * Ekstraksi angka statistik interaksi (Likes, Views, Comments) dari elemen card
 */
function parseStats(spans) {
  const nums = [];
  spans.each((_, el) => {
    const text = load(el).text().trim().replace(/,/g, "");
    nums.push(isNaN(text) ? text : Number(text));
  });
  return { 
    likes: nums[0] ?? 0, 
    views: nums[1] ?? 0, 
    comments: nums[2] ?? 0 
  };
}

module.exports = function (app) {

  // Handler utama scraping data Story TikTok
  const handleTikTokStory = async (req, res) => {
    // Menerima parameter fleksibel melalui query string (GET) maupun body payload (POST)
    const input = req.query.username || req.body.username || req.query.url || req.body.url;

    // Validasi parameter input wajib
    if (!input) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter "username" atau "url" profil wajib disertakan.',
        error: "USERNAME_OR_URL_REQUIRED",
        creator: "Andri Api"
      });
    }

    try {
      const username = parseUsername(input);

      // Mengirimkan request POST AJAX ke Snaptik engine
      const { data: html } = await axios.post(
        BASE,
        new URLSearchParams({ page: username, ftype: "all", gres: "", ajax: "1" }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "*/*",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
            Referer: "https://snaptik.kim/tiktok-story-viewer/",
          },
          timeout: 15000 // Batasi waktu tunggu response agar server tidak terbebani jika target lambat
        }
      );

      const $ = load(html);
      const stories = [];

      // Parsing element DOM html hasil response injector
      $(".icard").each((i, card) => {
        const $card = $(card);
        const thumbnail = $card.find("img.list_media").attr("src") || null;
        const dlAnchor = $card.find("a.btn-dl");
        const downloadUrl = dlAnchor.attr("href") || null;
        const label = dlAnchor.text().trim().replace(/\s+/g, " ");
        const stats = parseStats($card.find(".meta span"));

        stories.push({
          index: i + 1,
          thumbnail,
          download_url: downloadUrl,
          size_label: label.replace("Download", "").trim(),
          ...stats,
        });
      });

      // Kembalikan response sukses terformat rapi sesuai standarisasi platform Anda
      return res.status(200).json({
        status: true,
        statusCode: 200,
        creator: "Andri Api",
        result: {
          username,
          count: stories.length,
          stories
        }
      });

    } catch (error) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: error.message || "Gagal mengambil data internal story TikTok. Target kemungkinan privat atau down.",
        error: "SCRAPER_SERVER_ERROR",
        creator: "Andri Api"
      });
    }
  };

  // Daftarkan rute ke express core app (Mendukung integrasi pengujian GET & POST via Docs)
  app.get("/api/tools/ttsw", apiKeyMiddleware, handleTikTokStory);
  app.post("/api/tools/ttsw", apiKeyMiddleware, handleTikTokStory);
};
