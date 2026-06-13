/**
 * Lokasi File: ./src/api/downloader/spotify.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 * Fitur: Dual-Provider Auto Fallback (SpotifyDown + FabDL) Anti-Block Edition
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

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
// PROVIDER MODULES
// ==========================================

// Provider 1: SpotifyDown API
async function getFromSpotifyDown(trackId) {
  // Hit Metadata
  const metaRes = await fetch(`https://api.spotifydown.com/metadata/track/${trackId}`, {
    headers: { "User-Agent": UA, "Origin": "https://spotifydown.com", "Referer": "https://spotifydown.com/" }
  });
  if (!metaRes.ok) throw new Error("SpotifyDown Meta Failed");
  const meta = await metaRes.json();
  if (!meta.success) throw new Error("Track not found on SpotifyDown");

  // Hit Download Link
  const dlRes = await fetch(`https://api.spotifydown.com/download/${trackId}`, {
    headers: { "User-Agent": UA, "Origin": "https://spotifydown.com", "Referer": "https://spotifydown.com/" }
  });
  if (!dlRes.ok) throw new Error("SpotifyDown Download Link Failed");
  const dl = await dlRes.json();
  if (!dl.success || !dl.link) throw new Error("Conversion failed on SpotifyDown");

  return {
    title: meta.title,
    artists: meta.artists || "Unknown Artist",
    album: meta.album || "Single",
    cover: meta.cover || null,
    downloadUrl: dl.link
  };
}

// Provider 2: FabDL API (Bypass Cloud IP Firewalls)
async function getFromFabDL(targetUrl) {
  const getRes = await fetch(`https://api.fabdl.com/spotify/get?url=${encodeURIComponent(targetUrl)}`, {
    headers: { "User-Agent": UA, "Origin": "https://fabdl.com", "Referer": "https://fabdl.com/" }
  });
  if (!getRes.ok) throw new Error("FabDL Get Failed");
  const getJson = await getRes.json();
  const result = getJson?.result;
  if (!result || !result.id || !result.gid) throw new Error("Invalid response from FabDL");

  // Hit Convert to MP3
  const convertRes = await fetch(`https://api.fabdl.com/spotify/convert-mp3/${result.gid}/${result.id}`, {
    headers: { "User-Agent": UA, "Origin": "https://fabdl.com", "Referer": "https://fabdl.com/" }
  });
  if (!convertRes.ok) throw new Error("FabDL Conversion Failed");
  const convertJson = await convertRes.json();
  const downloadUrl = convertJson?.result?.download_url || convertJson?.result?.url;
  if (!downloadUrl) throw new Error("FabDL failed to return download URL");

  return {
    title: result.title,
    artists: result.artists || "Unknown Artist",
    album: result.album || "Single",
    cover: result.image || null,
    downloadUrl: downloadUrl.startsWith("http") ? downloadUrl : `https://api.fabdl.com${downloadUrl}`
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
    let usedProvider = "SpotifyDown";

    // CORE LOGIC: Menerapkan Sistem Deteksi Gagal Otomatis
    try {
      const trackId = extractTrackId(target);
      if (!trackId || trackId.length < 15) throw new Error("INVALID_TRACK_ID");
      
      // Coba Provider Utama (SpotifyDown)
      trackData = await getFromSpotifyDown(trackId);
    } catch (primaryError) {
      // Jika Provider Utama Gagal/Kena Blokir, Alihkan ke Provider Cadangan (FabDL)
      try {
        usedProvider = "FabDL";
        trackData = await getFromFabDL(target);
      } catch (backupError) {
        // Jika Kedua Provider Mengalami Masalah/Down
        return res.status(500).json({
          status: false,
          statusCode: 500,
          message: "Seluruh server target downloader sedang mengalami gangguan proteksi Cloudflare.",
          error: "ALL_PROVIDERS_FAILED",
          details: backupError.message,
          creator: "Andri Api"
        });
      }
    }

    try {
      const filename = safeFilename(trackData.title, trackData.artists);

      // 1. JIKA USER MEMINTA STREAM AUDIO BINARY LANGSUNG VIA BOT (&stream=true)
      if (wantStream) {
        const audioFetch = await fetch(trackData.downloadUrl, { headers: { "User-Agent": UA } });
        if (!audioFetch.ok) throw new Error("Gagal mengambil data stream dari endpoint provider.");
        
        const arrayBuffer = await audioFetch.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.send(buffer);
      }

      // 2. JIKA USER MEMINTA RESPON DATA JSON STANDAR
      const currentApikey = req.query.apikey || req.headers['x-api-key'] || '';
      const streamUrl = `${req.protocol}://${req.get('host')}/api/download/spotify?url=${encodeURIComponent(target)}&stream=true${currentApikey ? `&apikey=${currentApikey}` : ''}`;

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading Spotify track",
        creator: "Andri Api",
        provider: usedProvider, // Menunjukkan resource yang sukses dieksekusi
        data: {
          title: trackData.title,
          artists: trackData.artists,
          album: trackData.album,
          cover: trackData.cover,
          filename: filename,
          url: streamUrl // Direct Stream Link untuk Bot WhatsApp / Telegram Anda
        }
      });

    } catch (err) {
      return res.status(500).json({ 
        status: false, 
        statusCode: 500,
        message: "Internal Server Error saat menyalurkan file audio.", 
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
