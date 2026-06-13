/**
 * Lokasi File: ./src/api/downloader/capcut.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 */

const axios = require("axios");
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const hdrs = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
  'Referer': 'https://snapvideotools.com/id/capcut-downloader',
  'Origin': 'https://snapvideotools.com',
};

module.exports = function (app) {

    // Handler universal untuk melayani request download CapCut Video
    const handleCapcut = async (req, res) => {
        const target = req.body.url || req.query.url;

        if (!target) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "url" video wajib diisi.',
                error: "URL_REQUIRED" 
            });
        }

        try {
            // Eksekusi POST request ke API SnapVideoTools menggunakan native fetch
            const resFetch = await fetch('https://snapvideotools.com/id/api/snap', {
                method: 'POST',
                headers: hdrs,
                body: JSON.stringify({ text: target })
            });

            const text = await resFetch.text();
            let result;
            
            try {
                result = JSON.parse(text);
            } catch (e) {
                return res.status(502).json({
                    status: false,
                    statusCode: 502,
                    message: "Respons dari server scraper tidak valid (Bukan JSON).",
                    error: "INVALID_SERVER_RESPONSE"
                });
            }

            if (!result || result.code !== 0) {
                return res.status(422).json({
                    status: false,
                    statusCode: 422,
                    message: "Gagal mengambil data video. Pastikan tautan CapCut valid.",
                    error: "SCRAPER_FAILED"
                });
            }

            const { title, cover, mediaUrls } = result.data;

            // Struktur respons standar sukses (status 200) sesuai sistem Andri API
            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success downloading CapCut media",
                data: {
                    title: title || null,
                    cover: cover || null,
                    mediaUrls: mediaUrls || []
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
     * Gerbang Deteksi Bypass Khusus Console Web / Session Cookie
     */
    const bypassOrCheckApiKey = (req, res, next) => {
        const hasApiKey = req.query.apikey || req.headers['x-api-key'];
        
        if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
            return next();
        }
        
        return apiKeyMiddleware(req, res, next);
    };

    // Registrasi Rute Express (Mendukung GET dan POST)
    app.get("/api/download/capcut", bypassOrCheckApiKey, handleCapcut);
    app.post("/api/download/capcut", bypassOrCheckApiKey, handleCapcut);
};
