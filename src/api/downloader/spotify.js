/**
 * Lokasi File: ./src/api/downloader/spotify.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 
const axios = require("axios");
const cheerio = require("cheerio");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

const BASE = "https://spowload.cc";

// Fungsi pengekstraksi data pembantu
function pickCsrf(html) {
    const $ = cheerio.load(html);
    return $('meta[name=\"csrf-token\"]').first().attr("content") || null;
}

function pickTrackData(html) {
    const match = html.match(/let\s+urldata\s*=\s*"((?:\\.|[^"\\])*)"/);
    if (!match) return null;
    try {
        const decoded = JSON.parse(`"${match[1]}"`);
        return JSON.parse(decoded);
    } catch (e) {
        return null;
    }
}

function pickImage(data) {
    return data?.album?.images?.[0]?.url || data?.images?.[0]?.url || data?.tracks?.items?.[0]?.track?.album?.images?.[0]?.url || data?.tracks?.[0]?.album?.images?.[0]?.url || null;
}

function pickSpotifyUrl(data, fallback) {
    return data?.external_urls?.spotify || fallback;
}

function cleanArtists(data) {
    const artists = data?.artists || data?.track?.artists || [];
    return artists.map(v => v.name).filter(Boolean).join(", ") || null;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Polling Task Handler
async function pollTask(apiInstance, taskId) {
    for (let i = 0; i < 10; i++) {
        const res = await apiInstance.get(`${BASE}/tasks/${encodeURIComponent(taskId)}`, {
            headers: {
                Accept: "application/json, text/plain, */*",
                Referer: `${BASE}/en2`
            }
        });

        const data = res.data;
        const status = data?.data?.status;
        const result = data?.data?.result?.download_url || data?.data?.download_url || data?.data?.url || null;

        if (result) return result;
        if (status === "completed" || status === "success" || status === "finished") return result;
        if (status === "failed") throw new Error("Conversion failed on spowload server");

        await sleep(2000);
    }
    throw new Error("Task timeout, silakan coba beberapa saat lagi.");
}

module.exports = function (app) {

    // Handler universal untuk melayani request download Spotify
    const handleSpotify = async (req, res) => {
        const url = req.body.url || req.query.url;

        if (!url) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "url" wajib diisi.',
                error: "URL_REQUIRED" 
            });
        }

        try {
            // Menginisialisasi CookieJar & Axios Instance per-request untuk isolasi session scraping
            const jar = new CookieJar();
            const api = wrapper(axios.create({
                jar,
                withCredentials: true,
                maxRedirects: 5,
                validateStatus: () => true,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
                    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                    "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
                    "sec-ch-ua-mobile": "?1",
                    "sec-ch-ua-platform": '"Android"'
                }
            }));

            // Step 1: Ambil halaman utama untuk mendapatkan token CSRF awal
            const home = await api.get(`${BASE}/en2`, {
                headers: {
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    Referer: BASE
                }
            });

            const token = pickCsrf(home.data);
            if (!token) {
                return res.status(403).json({
                    status: false,
                    statusCode: 403,
                    message: "CSRF token tidak ditemukan. Kemungkinan proteksi Cloudflare aktif.",
                    error: "ANTI_BOT_BLOCK"
                });
            }

            // Step 2: Kirim URL untuk dianalisis
            const form = new URLSearchParams();
            form.set("_token", token);
            form.set("trackUrl", url);

            const analyzed = await api.post(`${BASE}/analyze`, form.toString(), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    Origin: BASE,
                    Referer: `${BASE}/en2`
                }
            });

            const html = typeof analyzed.data === "string" ? analyzed.data : "";
            const csrf = pickCsrf(html) || token;
            const trackData = pickTrackData(html);

            if (!trackData) {
                return res.status(404).json({
                    status: false,
                    statusCode: 404,
                    message: "Data lagu tidak ditemukan. Pastikan URL Spotify Anda benar.",
                    error: "TRACK_NOT_FOUND"
                });
            }

            const spotifyUrl = pickSpotifyUrl(trackData, url);
            const cover = pickImage(trackData);

            // Step 3: Trigger Konversi Link Musik
            const converted = await api.post(`${BASE}/convert`, {
                urls: spotifyUrl,
                cover
            }, {
                headers: {
                    Accept: "application/json, text/plain, */*",
                    "Content-Type": "application/json",
                    "X-CSRF-TOKEN": csrf,
                    Origin: BASE,
                    Referer: `${BASE}/spotify/${trackData.type || "track"}-${trackData.id}`
                }
            });

            const body = converted.data;
            let downloadUrl = null;

            if (body?.url) {
                downloadUrl = body.url;
            } else if (body?.task_id || body?.taskId) {
                downloadUrl = await pollTask(api, body.task_id || body.taskId);
            } else if (body?.data?.url) {
                downloadUrl = body.data.url;
            } else if (body?.data?.download_url) {
                downloadUrl = body.data.download_url;
            }

            if (!downloadUrl) {
                return res.status(422).json({
                    status: false,
                    statusCode: 422,
                    message: "Gagal memproses link download lagu dari penyedia source.",
                    metadata: {
                        id: trackData.id || null,
                        type: trackData.type || null,
                        title: trackData.name || null,
                        artist: cleanArtists(trackData),
                        duration_ms: trackData.duration_ms || null,
                        cover: cover
                    },
                    error: "CONVERSION_FAILED"
                });
            }

            // Struktur respons standar sukses (status 200) sesuai sistem Andri API
            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success downloading Spotify track",
                data: {
                    url: downloadUrl,
                    metadata: {
                        id: trackData.id || null,
                        type: trackData.type || null,
                        title: trackData.name || null,
                        artist: cleanArtists(trackData),
                        duration_ms: trackData.duration_ms || null,
                        cover: cover,
                        spotify_url: spotifyUrl
                    }
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

    /**
     * Gerbang Deteksi Bypass Khusus Console Web
     */
    const bypassOrCheckApiKey = (req, res, next) => {
        const hasApiKey = req.query.apikey || req.headers['x-api-key'];
        
        if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
            return next();
        }
        
        return apiKeyMiddleware(req, res, next);
    };

    // Registrasi Rute Express
    app.get("/api/download/spotify", bypassOrCheckApiKey, handleSpotify);
    app.post("/api/download/spotify", bypassOrCheckApiKey, handleSpotify);
};
