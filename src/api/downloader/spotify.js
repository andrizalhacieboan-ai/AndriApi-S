/**
 * Lokasi File: ./src/api/downloader/spotify.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 * Base Engine: Spotmate Online (Axios Cookie-Jar Support Edition)
 */

const axios = require("axios");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const BASE = "https://spotmate.online";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Helper penamaan berkas musik
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
      // Mengisolasi jar & client per-request agar tidak terjadi balapan cookie antar user
      const jar = new CookieJar();
      const client = wrapper(
        axios.create({
          jar,
          withCredentials: true,
          headers: {
            "user-agent": UA,
            "accept": "*/*"
          }
        })
      );

      // 1. Jalankan Handshake Awal untuk Mendapatkan XSRF-TOKEN
      await client.get(`${BASE}/en1`);
      const cookies = await jar.getCookies(BASE);
      const xsrfCookie = cookies.find(c => c.key === "XSRF-TOKEN");
      
      if (!xsrfCookie) {
        throw new Error("Gagal menggenerasi handshake session token.");
      }
      const xsrf = decodeURIComponent(xsrfCookie.value);

      // 2. Ambil Metadata Lagu via POST Request
      const trackRes = await client.post(
        `${BASE}/getTrackData`,
        { spotify_url: target },
        {
          headers: {
            "content-type": "application/json",
            "x-xsrf-token": xsrf,
            origin: BASE,
            referer: `${BASE}/en1`
          }
        }
      );

      const t = trackRes.data;
      if (!t || !t.id) {
        return res.status(404).json({
          status: false,
          statusCode: 404,
          message: "Lagu tidak ditemukan atau format URL Spotify keliru.",
          error: "TRACK_NOT_FOUND"
        });
      }

      // 3. Eksekusi Konversi untuk Mendapatkan Link Download MP3
      const convertRes = await client.post(
        `${BASE}/convert`,
        { urls: target },
        {
          headers: {
            "content-type": "application/json",
            "x-xsrf-token": xsrf,
            origin: BASE,
            referer: `${BASE}/en1`
          }
        }
      );

      const d = convertRes.data;
      if (!d || !d.url) {
        return res.status(500).json({
          status: false,
          statusCode: 500,
          message: "Spotmate gagal melakukan render konversi berkas MP3.",
          error: "CONVERSION_FAILED"
        });
      }

      const title = t.name;
      const artist = t.artists.map(a => a.name).join(", ");
      const filename = safeFilename(title, artist);

      // 4. JIKA USER/BOT MEMINTA DIRECT BINARY STREAM AUDIO MURNI (&stream=true)
      if (wantStream) {
        const audioFetch = await axios.get(d.url, {
          headers: { "User-Agent": UA },
          responseType: "arraybuffer"
        });
        
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.send(Buffer.from(audioFetch.data));
      }

      // 5. JIKA MEMINTA RESPON DATA JSON STANDAR UNTUK PANAL API
      const currentApikey = req.query.apikey || req.headers['x-api-key'] || '';
      const streamUrl = `${req.protocol}://${req.get('host')}/api/download/spotify?url=${encodeURIComponent(target)}&stream=true${currentApikey ? `&apikey=${currentApikey}` : ''}`;

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading Spotify track",
        creator: "Andri Api",
        engine: "Spotmate Cookie Jar Engine",
        data: {
          id: t.id,
          title: title,
          artists: artist,
          duration: `${Math.floor(t.duration_ms / 60000)}:${String(Math.floor((t.duration_ms % 60000) / 1000)).padStart(2, "0")}`,
          explicit: t.explicit || false,
          cover: t.album.images?.[0]?.url || null,
          filename: filename,
          url: streamUrl // Berikan URL ini ke Bot WhatsApp Anda (Baileys/Message Media)
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal Server Error pada sistem jabat tangan enkripsi Spotmate.",
        error: err.response?.data || err.message,
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
