/**
 * Lokasi File: ./src/api/ai/ai-dolphinai.js
 * Ditulis khusus untuk backend Andri API
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 
const axios = require('axios');

// Fungsi inti scraping data dari Dolphin AI upstream
async function dolphinai({ messages, template = 'logical' } = {}) {
    const templates = ['logical', 'creative', 'summarize', 'code-beginner', 'code-advanced'];
    if (!Array.isArray(messages)) throw new Error('Messages must be an array.');
    if (!templates.includes(template)) throw new Error(`Available templates: ${templates.join(', ')}.`);

    const { data } = await axios.post('https://chat.dphn.ai/api/chat', {
        messages: messages,
        model: 'dolphinserver:24B',
        template: template
    }, {
        headers: {
            origin: 'https://chat.dphn.ai',
            referer: 'https://chat.dphn.ai/',
            'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
        },
        responseType: 'text',
        timeout: 60000
    });

    const lines = String(data).split('\n');
    const parts = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let jsonStr = null;
        if (trimmed.startsWith('data: ')) {
            jsonStr = trimmed.slice(6);
        } else if (trimmed.startsWith('{')) {
            jsonStr = trimmed;
        }

        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed?.choices?.[0]?.delta?.content
                ?? parsed?.message?.content
                ?? parsed?.choices?.[0]?.message?.content
                ?? parsed?.content
                ?? null;
            if (content) parts.push(content);
        } catch {
            // lewati baris jika gagal di-parse
        }
    }

    const result = parts.join('');
    if (!result) throw new Error('Tidak ada respon yang diterima dari layanan Dolphin AI.');
    return result;
}

module.exports = function(app) {

    // Handler universal untuk melayani request
    const handleDolphin = async (req, res) => {
        try {
            // Fleksibel mengambil data dari body (POST dari Console) atau query (GET)
            const prompt = req.body.prompt || req.query.prompt || req.body.query || req.query.query;
            const template = req.body.template || req.query.template || 'logical';

            if (!prompt) {
                return res.status(400).json({
                    status: false,
                    statusCode: 400,
                    message: 'Parameter "prompt" wajib diisi.',
                    error: 'MISSING_PROMPT'
                });
            }

            const messages = [{ role: 'user', content: prompt }];
            const response = await dolphinai({ messages, template });

            // Format data disesuaikan agar dibaca sempurna oleh script.js frontend kamu
            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success generating response",
                data: {
                    result: response
                }
            });

        } catch (err) {
            return res.status(500).json({
                status: false,
                statusCode: 500,
                message: err.message,
                error: 'SERVER_ERROR'
            });
        }
    };

    /**
     * Gerbang Deteksi Bypass Khusus: 
     * Jika request datang dari website utama kamu (Try Console) dan membawa cookie,
     * request akan langsung diteruskan ke handler tanpa dicegat oleh apiKeyMiddleware.
     */
    const bypassOrCheckApiKey = (req, res, next) => {
        const hasApiKey = req.query.apikey || req.headers['x-api-key'];
        
        // Jika user mengakses lewat Try Console dashboard (cookie ada) dan tidak bawa apikey
        if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
            return next(); // Lolos langsung tanpa memicu error 401/404 dari ratelimit.js
        }
        
        // Jika diakses dari bot atau luar, jalankan validasi API Key Turso DB bawaan kamu
        return apiKeyMiddleware(req, res, next);
    };

    // Daftarkan ke Express untuk menangani method GET dan POST dari terminal page kamu
    app.get('/api/ai/dolphin', bypassOrCheckApiKey, handleDolphin);
    app.post('/api/ai/dolphin', bypassOrCheckApiKey, handleDolphin);
};
