/**
 * Lokasi File: ./src/api/ai/ai-dolphinai.js
 * Deskripsi: Handler Dolphin AI 24B terintegrasi dengan Turso API Key Rate Limit
 */

// PASTIKAN PATH IMPOR INI BENAR! 
// Karena file ini berada di ./src/api/ai/ai-dolphinai.js,
// maka untuk menuju ke ./src/middleware/ratelimit.js harus naik 2 tingkat (../../middleware/ratelimit)
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 
const axios = require('axios');

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
            // skip unparseable lines
        }
    }

    const result = parts.join('');
    if (!result) throw new Error('No result found from upstream AI service.');
    return result;
}

module.exports = function(app) {
  
  // Daftarkan endpoint POST agar cocok dengan method di settings.json
  app.post('/api/ai/dolphin', apiKeyMiddleware, async (req, res) => { 
    try {
      // Konsisten membaca payload dari req.body karena dikirim via POST oleh API Console
      const prompt = req.body.prompt || req.query.prompt || req.body.query;
      const template = req.body.template || req.query.template || 'logical';

      if (!prompt) {
        return res.status(400).json({
          status: false,
          statusCode: 400,
          message: 'Parameter "prompt" wajib diisi di dalam body request.',
          error: 'MISSING_PROMPT'
        });
      }

      // Bungkus ke format array messages sesuai kebutuhan fungsi hulu dolphinai
      const messages = [{ role: 'user', content: prompt }];
      
      // Eksekusi scraping AI
      const response = await dolphinai({ messages, template });

      // Return response JSON yang bersih dan rapi
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
        message: err.message || 'Terjadi kesalahan pada server internal.',
        error: 'SERVER_ERROR'
      });
    }
  });
};
