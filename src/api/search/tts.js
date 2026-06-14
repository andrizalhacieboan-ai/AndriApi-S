/**
 * TIKTOK SEARCH & AUDIO EXTRACTOR ENGINE
 * * [•] DESCRIPTION :: Search TikTok videos by keywords & auto extract direct MP4/MP3 audio links
 * [•] BASE        :: https://www.tikwm.com
 * * [!] INTEGRATED FOR ANDRI API (Category: SEARCH)
 */

const axios = require('axios');
const crypto = require('crypto');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const BASE_URL = "https://www.tikwm.com";
const API_URL = `${BASE_URL}/api/feed/search`;

function randomUniqueId() {
  return `user_${crypto.randomBytes(6).toString("hex")}`;
}

function fullUrl(url) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return BASE_URL + url;
}

module.exports = function (app) {

  const handleTikTokSearch = async (req, res) => {
    // Akseptasi multi-parameter agar fleksibel (q, keywords, atau message)
    const keywords = req.query.q || req.body.q || req.query.keywords || req.body.keywords || req.query.message || req.body.message;
    const count = req.query.count || req.body.count || 12;
    const cursor = req.query.cursor || req.body.cursor || 0;
    const hd = req.query.hd || req.body.hd || 1;
    const started = Date.now();

    if (!keywords) {
      return res.status(400).json({ 
        status: false, 
        statusCode: 400,
        message: 'Parameter "query" atau "keywords" wajib diisi.',
        error: "KEYWORDS_REQUIRED" 
      });
    }

    try {
      const uniqueId = randomUniqueId();
      const params = new URLSearchParams({
        unique_id: uniqueId,
        count: String(count),
        cursor: String(cursor),
        web: "1",
        hd: String(hd),
        keywords: String(keywords).trim()
      });

      const headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE_URL,
        "Referer": `${BASE_URL}/`
      };

      // Menggunakan Axios POST dengan format form-urlencoded
      const response = await axios.post(API_URL, params.toString(), {
        headers,
        timeout: 20000,
        validateStatus: () => true
      });

      const json = response.data;

      if (!json || typeof json !== 'object') {
        return res.status(422).json({
          status: false,
          statusCode: 422,
          message: 'Gagal mendapatkan struktur data valid dari server feed TikWM.',
          error: "INVALID_FEED_RESPONSE",
          creator: "Andri Api"
        });
      }

      const videos = Array.isArray(json?.data?.videos) ? json.data.videos : [];

      // Mapping hasil pencarian disesuaikan ke standarisasi Andri API + Inject Direct MP3
      const mappedResults = videos.map((item) => {
        const directAudio = fullUrl(item.music || item.music_info?.play_url);
        return {
          id: item.video_id || item.id || null,
          title: item.title || null,
          author: {
            username: item.author?.unique_id || null,
            nickname: item.author?.nickname || null,
            avatar: fullUrl(item.author?.avatar)
          },
          duration: item.duration || 0,
          media: {
            video: fullUrl(item.play),
            video_hd: item.hdplay ? fullUrl(item.hdplay) : fullUrl(item.play),
            mp3: directAudio, // Direct convert/extract audio URL untuk kebutuhan playback musik
            cover: fullUrl(item.cover)
          },
          stats: {
            play: item.play_count || 0,
            like: item.digg_count || 0,
            comment: item.comment_count || 0,
            share: item.share_count || 0,
            download: item.download_count || 0
          }
        };
      });

      return res.status(200).json({
        status: response.status === 200 && json.code === 0,
        statusCode: 200,
        message: "Success fetch TikTok Search results",
        creator: "Andri Api",
        time_ms: Date.now() - started,
        data: {
          search_query: keywords,
          total_found: mappedResults.length,
          next_cursor: json?.data?.cursor ?? null,
          has_more: json?.data?.hasMore ?? false,
          results: mappedResults
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal Server Error pada core pipeline TikTok Search.",
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

  // Daftarkan routing endpoints
  app.get("/api/search/tiktok", bypassOrCheckApiKey, handleTikTokSearch);
  app.post("/api/search/tiktok", bypassOrCheckApiKey, handleTikTokSearch);
};
