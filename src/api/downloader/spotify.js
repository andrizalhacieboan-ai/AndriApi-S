/**
 * Lokasi File: ./src/api/downloader/spotify.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 * Fitur: Triple-Engine Ultra Fallback (SpotifyDown + SpotifyDownloaderCom + SpotifyMate)
 * Solusi Total Anti-Cloudflare Block & Anti-Fetch Failed.
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function extractTrackId(url) {
  const match = url.match(/track[/:]([a-zA-Z0-9]+)/);
  if (match) return match[1];
  const clean = url.trim().split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1];
}

function safeFilename(title, artist) {
  return `${artist} - ${title}`
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim() + " (SPOTIFY).mp3";
}

// ==========================================
// ENGINE 1: SpotifyDown API
// ==========================================
async function getFromSpotifyDown(trackId) {
  const metaRes = await fetch(`https://api.spotifydown.com/metadata/track/${trackId}`, {
    headers: { "User-Agent": UA, "Origin": "https://spotifydown.com", "Referer": "https://spotifydown.com/" }
  });
  if (!metaRes.ok) throw new Error("Engine 1 Meta Blocked");
  const meta = await metaRes.json();
  if (!meta.success) throw new Error("Track not found on Engine 1");

  const dlRes = await fetch(`https://api.spotifydown.com/download/${trackId}`, {
    headers: { "User-Agent": UA, "Origin": "https://spotifydown.com", "Referer": "https://spotifydown.com/" }
  });
  if (!dlRes.ok) throw new Error("Engine 1 Download Blocked");
  const dl = await dlRes.json();
  if (!dl.success || !dl.link) throw new Error("Conversion failed on Engine 1");

  return {
    title: meta.title,
    artists: meta.artists || "Unknown Artist",
    album: meta.album || "Single",
    cover: meta.cover || null,
    downloadUrl: dl.link
  };
}

// ==========================================
// ENGINE 2: Spotify-Downloader.com Official Cluster
// ==========================================
async function getFromSpotifyDownloaderCom(targetUrl) {
  const res = await fetch("https://api.spotify-downloader.com/api/link", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://spotify-downloader.com",
      "Referer": "https://spotify-downloader.com/"
    },
    body: new URLSearchParams({ link: targetUrl })
  });
  if (!res.ok) throw new Error("Engine 2 Link API Blocked");
  const json = await res.json();
  if (!json.success || !json.id) throw new Error("Track not found on Engine 2");

  return {
    title: json.metadata.title,
    artists: json.metadata.artists || "Unknown Artist",
    album: json.metadata.album || "Single",
    cover: json.metadata.cover || null,
    downloadUrl: `https://api.spotify-downloader.com/api/download/${json.id}`
  };
}

// ==========================================
// ENGINE 3: SpotifyMate Web Scraper Engine (High-Anonymity)
// ==========================================
async function getFromSpotifyMate(targetUrl) {
  const res = await fetch("https://spotifymate.com/action.php", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Origin": "https://spotifymate.com",
      "Referer": "https://spotifymate.com/",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ url: targetUrl })
  });
  if (!res.ok) throw new Error("Engine 3 Action Blocked");
  const html = await res.text();

  const titleMatch = html.match(/<h3[^>]*>(.*?)<\/h3>/);
  const artistMatch = html.match(/<p[^>]*>By (.*?)<\/p>/) || html.match(/<p class="text-muted"[^>]*>(.*?)<\/p>/);
  const coverMatch = html.match(/<img src=["'](https:\/\/i\.scdn\.co\/image\/.*?)["']/);
  
  // Mencari link mp3 / download terenkripsi dari komponen DOM hasil render server
  const links = [...html.matchAll(/href=["'](https:\/\/([^"'\s>]+))["']/g)].map(m => m[1]);
  const downloadUrl = links.find(l => l.includes("download") || l.includes(".mp3") || l.includes("save") || l.includes("click"));

  if (!downloadUrl) throw new Error("Engine 3 gagal mengekstrak download URL");

  return {
    title: titleMatch ? titleMatch[1].trim() : "Spotify Track",
    artists: artistMatch ? artistMatch[1].replace("By ", "").trim() : "Unknown Artist",
    album: "Single",
    cover: coverMatch ? coverMatch[1] : null,
    downloadUrl: downloadUrl
  };
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

    let trackData = null;
    let successEngine = "";

    // PROSES SELEKSI ENGINE FALLBACK OTOMATIS
    try {
      const trackId = extractTrackId(target);
      if (!trackId || trackId.length < 15) throw new Error("INVALID_TRACK_ID");
      
      // Coba Jalur 1 (SpotifyDown API)
      successEngine = "SpotifyDown API";
      trackData = await getFromSpotifyDown(trackId);
    } catch (err1) {
      try {
        // Coba Jalur 2 (Spotify-Downloader Cluster)
        successEngine = "SpotifyDownloader Cluster";
        trackData = await getFromSpotifyDownloaderCom(target);
      } catch (err2) {
        try {
          // Coba Jalur 3 (SpotifyMate Web Scraper)
          successEngine = "SpotifyMate Engine";
          trackData = await getFromSpotifyMate(target);
        } catch (err3) {
          // JIKA SEMUA ENGINE TOTAL BLOCKED / DOWN
          return res.status(500).json({
            status: false,
            statusCode: 500,
            message: "Seluruh cluster server bypass mengalami gangguan koneksi network (Fetch Failed).",
            error: "ALL_ENGINES_FAILED",
            logs: {
              engine1: err1.message,
              engine2: err2.message,
              engine3: err3.message
            },
            creator: "Andri Api"
          });
        }
      }
    }

    try {
      const filename = safeFilename(trackData.title, trackData.artists);

      // 1. JIKA BOT MEMINTA BINARY STREAM AUDIO SECARA LANGSUNG (&stream=true)
      if (wantStream) {
        const audioFetch = await fetch(trackData.downloadUrl, { headers: { "User-Agent": UA } });
        if (!audioFetch.ok) throw new Error("Gagal mengalirkan binary buffer stream dari server core.");
        
        const arrayBuffer = await audioFetch.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.send(buffer);
      }

      // 2. JIKA MEMINTA OUTPUT FORMAT JSON STANDAR
      const currentApikey = req.query.apikey || req.headers['x-api-key'] || '';
      const streamUrl = `${req.protocol}://${req.get('host')}/api/download/spotify?url=${encodeURIComponent(target)}&stream=true${currentApikey ? `&apikey=${currentApikey}` : ''}`;

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading Spotify track",
        creator: "Andri Api",
        engine: successEngine, // Pelacak engine mana yang sukses memproses data
        data: {
          title: trackData.title,
          artists: trackData.artists,
          album: trackData.album,
          cover: trackData.cover,
          filename: filename,
          url: streamUrl // Berikan link stream MP3 ini ke library bot WhatsApp Anda (Baileys/Telegram)
        }
      });

    } catch (err) {
      return res.status(500).json({ 
        status: false, 
        statusCode: 500,
        message: "Internal Server Error saat memproses transfer media stream.", 
        error: err.message || "SERVER_ERROR",
        creator: "Andri Api"
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
