/**
 * Lokasi File: ./src/api/tools/am.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const hdrs = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://amprem.mxrk.tech',
  'Referer': 'https://amprem.mxrk.tech/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
};

module.exports = function (app) {

    // Handler universal untuk request AM Premium (Request & Verify)
    const handleAmPremium = async (req, res) => {
        const action = req.body.action || req.query.action;
        const email = req.body.email || req.query.email;
        const link = req.body.link || req.query.link;

        // Step 1: Validasi Parameter Action
        if (!action || (action !== 'request' && action !== 'verify')) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "action" wajib diisi dengan nilai "request" atau "verify".',
                error: "INVALID_ACTION" 
            });
        }

        // Step 2: Validasi Parameter Email Target
        if (!email) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "email" target wajib diisi.',
                error: "EMAIL_REQUIRED" 
            });
        }

        try {
            let resultData;

            if (action === 'request') {
                // Eksekusi Request Token ke Email
                const response = await fetch('https://amprem.mxrk.tech/api/request-link', {
                    method: 'POST',
                    headers: hdrs,
                    body: JSON.stringify({ email })
                });

                if (!response.ok) {
                    return res.status(502).json({
                        status: false,
                        statusCode: 502,
                        message: `Server AM Prem merespons dengan status ${response.status}`,
                        error: "TARGET_SERVER_ERROR"
                    });
                }

                const text = await response.text();
                try {
                    resultData = JSON.parse(text);
                } catch (e) {
                    return res.status(502).json({
                        status: false,
                        statusCode: 502,
                        message: "Format respons dari server tidak valid (Bukan JSON).",
                        error: "INVALID_JSON_RESPONSE"
                    });
                }

            } else if (action === 'verify') {
                // Validasi khusus Link untuk proses verifikasi
                if (!link) {
                    return res.status(400).json({ 
                        status: false, 
                        statusCode: 400,
                        message: 'Parameter "link" (verification link) wajib diisi untuk verifikasi akun.',
                        error: "LINK_REQUIRED" 
                    });
                }

                // Eksekusi Verifikasi Token / Link Alight Motion
                const response = await fetch('https://amprem.mxrk.tech/api/verify-link', {
                    method: 'POST',
                    headers: hdrs,
                    body: JSON.stringify({ email, link })
                });

                if (!response.ok) {
                    return res.status(502).json({
                        status: false,
                        statusCode: 502,
                        message: `Server AM Prem merespons dengan status ${response.status}`,
                        error: "TARGET_SERVER_ERROR"
                    });
                }

                const text = await response.text();
                try {
                    resultData = JSON.parse(text);
                } catch (e) {
                    return res.status(502).json({
                        status: false,
                        statusCode: 502,
                        message: "Format respons dari server tidak valid (Bukan JSON).",
                        error: "INVALID_JSON_RESPONSE"
                    });
                }
            }

            // Struktur respons sukses (status 200) standar Andri API
            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: `Success processing ${action} request`,
                creator: "ANDRI STORE",
                data: resultData
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

    // Routing Endpoint dengan proteksi apiKeyMiddleware
    app.get("/api/tools/am", apiKeyMiddleware, handleAmPremium);
    app.post("/api/tools/am", apiKeyMiddleware, handleAmPremium);
};
