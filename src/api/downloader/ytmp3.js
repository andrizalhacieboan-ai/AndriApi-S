/**
 * Lokasi File: ./src/api/downloader/ytmp3.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const hdrs = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://yt2mp3.gs/',
  'Origin': 'https://yt2mp3.gs',
};

// Fungsi pembantu mengekstrak Video ID jika user memasukkan URL penuh YouTube
function extractVideoId(urlOrId) {
    if (!urlOrId) return null;
    if (urlOrId.length === 11) return urlOrId; 
    const match = urlOrId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^"&?\/\s]{11})/);
    return match ? match[1] : urlOrId;
}

module.exports = function (app) {

    // Handler universal untuk melayani request download YouTube MP3/MP4
    const handleYtmp3 = async (req, res) => {
        const target = req.body.url || req.query.url || req.body.id || req.query.id;
        const format = req.body.format || req.query.format || 'mp3'; // Default mp3 jika tidak diisi

        if (!target) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "url" atau "id" video wajib diisi.',
                error: "URL_REQUIRED" 
            });
        }

        const videoId = extractVideoId(target);

        try {
            const ts = () => Date.now();

            // Step 1: Ambil Key Otentikasi Epsilon
            const authRes = await fetch(`https://epsilon.epsiloncloud.org/api/v1/auth?_=${ts()}`, { headers: hdrs });
            
            if (!authRes.ok) {
                return res.status(502).json({
                    status: false,
                    statusCode: 502,
                    message: `Epsilon Auth Server merespons dengan status ${authRes.status}`,
                    error: "AUTH_SERVER_ERROR"
                });
            }

            const authText = await authRes.text();
            let key;
            try {
                key = JSON.parse(authText).key;
            } catch (e) {
                return res.status(502).json({
                    status: false,
                    statusCode: 502,
                    message: "Format respons dari Auth Server Epsilon tidak valid (Bukan JSON).",
                    error: "INVALID_AUTH_JSON"
                });
            }

            if (!key) {
                return res.status(502).json({
                    status: false,
                    statusCode: 502,
                    message: "Gagal mendapatkan token otentikasi dari Epsilon server.",
                    error: "AUTH_KEY_FAILED"
                });
            }

            // Step 2: Ambil Base Convert URL
            const initRes = await fetch(`https://epsilon.epsiloncloud.org/api/v1/init?_=${ts()}`, {
                headers: { ...hdrs, Authorization: `Bearer ${key}` }
            });

            if (!initRes.ok) {
                return res.status(502).json({
                    status: false,
                    statusCode: 502,
                    message: `Epsilon Init Server merespons dengan status ${initRes.status}`,
                    error: "INIT_SERVER_ERROR"
                });
            }

            const initText = await initRes.text();
            let convertURL;
            try {
                convertURL = JSON.parse(initText).convertURL;
            } catch (e) {
                return res.status(502).json({
                    status: false,
                    statusCode: 502,
                    message: "Format respons dari Init Server Epsilon tidak valid.",
                    error: "INVALID_INIT_JSON"
                });
            }

            if (!convertURL) {
                return res.status(502).json({
                    status: false,
                    statusCode: 502,
                    message: "Gagal menginisialisasi convert URL endpoint.",
                    error: "INIT_FAILED"
                });
            }

            // Step 3: Polling Redirect & bypass resolusi file data
            let result;
            let url = `${convertURL}&v=${videoId}&f=${format}&_=${ts()}`;
            let attempts = 0;

            while (attempts < 15) { 
                attempts++;
                const resFetch = await fetch(url, { headers: hdrs });
                
                if (!resFetch.ok) break;

                const text = await resFetch.text();
                try {
                    result = JSON.parse(text);
                } catch (e) {
                    result = null;
                    break;
                }
                
                if (!result || !result.redirect) break;
                url = result.redirectURL;
            }

            if (!result || !result.downloadURL) {
                return res.status(422).json({
                    status: false,
                    statusCode: 422,
                    message: "Gagal memproses konversi video atau video tidak ditemukan.",
                    error: "CONVERSION_FAILED"
                });
            }

            // Struktur respons standar sukses (status 200)
            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success downloading YouTube media",
                data: {
                    title: result.title || null,
                    url: result.downloadURL,
                    format: format,
                    videoId: videoId
                }
            });

        } catch (err) {
            return res.status(500).json({ 
                status: false, 
                statusCode: 500,
                message: err.message, 
                error: "SERVER_ERROR"
            });
        }
    };

    // 🔥 SEKARANG MURNI MANDIRI: Langsung lewati apiKeyMiddleware resmi Anda tanpa bypass cookie
    app.get("/api/download/ytmp3", apiKeyMiddleware, handleYtmp3);
    app.post("/api/download/ytmp3", apiKeyMiddleware, handleYtmp3);
};
