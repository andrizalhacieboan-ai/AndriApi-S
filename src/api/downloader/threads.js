/**
 * THREADS DOWNLOADER
 * * [•] DESCRIPTION :: Download Threads media (Videos/Images) via Threadster Scraper
 * [•] BASE        :: Threadster.app Engine Proxy
 * * [!] INTEGRATED FOR ANDRI API (Category: Downloader)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const BASE_URL = "https://threadster.app";

// Helper teks dan pembersihan URL
function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function absolutize(url) {
  if (!url) return null;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE_URL + url;
  return url;
}

// Fungsi Parser HTML dari Threadster
function parseResult(html) {
  const $ = cheerio.load(html);
  const title = cleanText($("title").first().text());
  const items = [];

  $(".download_item").each((index, el) => {
    const item = $(el);
    const video = item.find("video").first().attr("src");
    const thumb = item.find(".download__item__thumb img").first().attr("src");
    const download = item.find("a.download__item__download_btn").first().attr("href");
    const author = cleanText(item.find(".download__item__profile_pic span").first().text()).replace(/^@/, "");
    const profile = item.find(".download__item__profile_pic img").first().attr("src");
    const caption = cleanText(item.find(".download__item__caption__text").first().text());
    const tab = cleanText($(`.download__items_tabs__item[data-index="${index}"]`).first().text());
    const type = video ? "video" : "image";

    if (download || video || thumb) {
      items.push({
        index: index + 1,
        type: tab.toLowerCase().includes("video") ? "video" : type,
        author: author || null,
        caption: caption || null,
        thumbnail: absolutize(thumb || video),
        profile: absolutize(profile),
        result_url: absolutize(download || video || thumb)
      });
    }
  });

  return {
    title: title || null,
    total: items.length,
    result: items
  };
}

// ==========================================
// EXPRESS ROUTING MODULE FOR ANDRI API
// ==========================================
module.exports = function (app) {

  const handleThreads = async (req, res) => {
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

    // Validasi basic link threads
    if (!target.includes('threads.net') && !target.includes('threads.com')) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'URL yang dimasukkan bukan tautan Threads yang sah.',
        error: 'INVALID_THREADS_URL'
      });
    }

    // Buat CookieJar & Axios Instance Baru per Request (Mencegah Race Condition/Session Leak)
    const jar = new CookieJar();
    const client = wrapper(axios.create({
      baseURL: BASE_URL,
      jar,
      withCredentials: true,
      timeout: 60000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        "cache-control": "max-age=0",
        "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": `"Android"`,
        "upgrade-insecure-requests": "1",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
        "sec-fetch-dest": "document",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "origin": "null",
        "priority": "u=0, i"
      }
    }));

    try {
      // 1. Ambil Sesi Token Awal dari Home Threadster
      await client.get("/");

      // 2. Kirim Request Post Unduhan
      const body = new URLSearchParams({ url: target.trim() }).toString();
      const responseHtml = await client.post("/download", body, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "referer": BASE_URL + "/"
        },
        responseType: "text"
      });

      const html = String(responseHtml.data || "");
      const parsed = parseResult(html);

      // Cek Validitas Status Kelayakan Data
      const isSuccess = responseHtml.status >= 200 && responseHtml.status < 300 && parsed.total > 0;

      if (!isSuccess) {
        const $err = cheerio.load(html);
        const errorText = cleanText($err("body").text()) || "Media atau postingan tidak ditemukan.";
        
        return res.status(422).json({
          status: false,
          statusCode: 422,
          message: "Gagal memproses pengunduhan media Threads.",
          error: errorText,
          creator: "Andri Api",
          time_ms: Date.now() - started
        });
      }

      // 3. Kembalikan Response Sukses Sesuai Standar Andri API
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading Threads media",
        creator: "Andri Api",
        input: target,
        time_ms: Date.now() - started,
        data: {
          title: parsed.title,
          total: parsed.total,
          items: parsed.result
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal Server Error pada sistem pengunduhan Threads.",
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

  // Daftarkan endpoint ke router utama Andri API
  app.get("/api/download/threads", bypassOrCheckApiKey, handleThreads);
  app.post("/api/download/threads", bypassOrCheckApiKey, handleThreads);
};
