/**
 * Lokasi File: ./src/api/downloader/spotify.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 * Base Scraper: api.spotifydown.com (Anti-Cloudflare Block Edition)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function extractTrackId(url) {
  // Mendukung link normal spotify maupun format custom redirect Anda
  const match = url.match(/track[/:]([a-zA-Z0-9]+)/);
  if (match) return match[1];
  
  // Fallback jika hanya mengirimkan ID mentah
  const clean = url.trim().split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1];
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}

function safeFilename(title, artist) {
  return `${artist} - ${title}`
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim() + " (SPOTIFY).mp3";
}

// ==========================================
// EXPRESS ROUTING MODULE FOR ANDRI API
// ==========================================
module.exports = function (app) {

  const handleSpotify = async (req, res) => {
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

    try {
      const trackId = extractTrackId(target);
      if (!trackId || trackId.length < 15) {
        return res.status(400).json({
          status: false,
          statusCode: 400,
          message: "ID Track Spotify tidak valid atau tidak ditemukan dalam URL.",
          error: "INVALID_SPOTIFY_URL"
        });
      }

      // 1. Ambil Metadata Lagu dari API SpotifyDown
      const metaResponse = await fetch(`https://api.spotifydown.com/metadata/track/${trackId}`, {
        headers: { 
          "User-Agent": UA,
          "Origin": "https://spotifydown.com",
          "Referer": "https://spotifydown.com/"
        }
      });
      
      if (!metaResponse.ok) throw new Error("Gagal mengambil metadata lagu dari provider.");
      const metaData = await metaResponse.json();

      if (!metaData.success) {
        return res.status(404).json({
          status: false,
          statusCode: 404,
          message: "Lagu tidak ditemukan atau link salah.",
          error: "TRACK_NOT_FOUND"
        });
      }

      // 2. Ambil Direct Download Link (MP3 File)
      const dlResponse = await fetch(`https://api.spotifydown.com/download/${trackId}`, {
        headers: { 
          "User-Agent": UA,
          "Origin": "https://spotifydown.com",
          "Referer": "https://spotifydown.com/"
        }
      });
      
      if (!dlResponse.ok) throw new Error("Gagal mengambil resource link download.");
      const dlData = await dlResponse.json();

      if (!dlData.success || !dlData.link) {
        return res.status(500).json({
          status: false,
          statusCode: 500,
          message: "Provider gagal mengonversi lagu ini ke berkas MP3.",
          error: "CONVERSION_FAILED"
        });
      }

      const filename = safeFilename(metaData.title, metaData.artists || "Various Artists");

      // 3. JIKA USER MEMINTA STREAM AUDIO LANGSUNG VIA BOT (&stream=true)
      if (wantStream) {
        const audioFetch = await fetch(dlData.link, { headers: { "User-Agent": UA } });
        if (!audioFetch.ok) throw new Error("Gagal melakukan streaming binary file dari hosting musik.");
        
        const arrayBuffer = await audioFetch.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.send(buffer);
      }

      // 4. JIKA USER MEMINTA RESPON DATA JSON STANDAR
      const currentApikey = req.query.apikey || req.headers['x-api-key'] || '';
      const streamUrl = `${req.protocol}://${req.get('host')}/api/download/spotify?url=${encodeURIComponent(target)}&stream=true${currentApikey ? `&apikey=${currentApikey}` : ''}`;

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading Spotify track",
        creator: "Andri Api",
        data: {
          id: trackId,
          title: metaData.title,
          artists: metaData.artists || "Unknown Artist",
          album: metaData.album || "Single",
          cover: metaData.cover || null,
          release_date: metaData.releaseDate || null,
          filename: filename,
          url: streamUrl // Link streaming MP3 direct untuk WhatsApp/Telegram Bot Anda
        }
      });

    } catch (err) {
      return res.status(500).json({ 
        status: false, 
        statusCode: 500,
        message: "Internal Server Error / Cloudflare bypass failure on target backend.", 
        error: err.message || "SERVER_ERROR"
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

  app.get("/api/download/spotify", bypassOrCheckApiKey, handleSpotify);
  app.post("/api/download/spotify", bypassOrCheckApiKey, handleSpotify);
};
