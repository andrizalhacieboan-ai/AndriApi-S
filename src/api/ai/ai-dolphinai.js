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
  
  // Handler universal untuk menangani request GET dan POST
  const handleDolphinRequest = async (req, res) => { 
    try {
      // Mengambil input parameter secara fleksibel (bisa prompt, query, ataupun text)
      const prompt = req.query.prompt || req.body.prompt || req.query.query || req.body.query || req.query.text || req.body.text;
      const template = req.query.template || req.body.template || 'logical';

      if (!prompt) {
        return res.status(400).json({
          status: false,
          statusCode: 400,
          message: 'Parameter "prompt" atau "text" wajib diisi.',
          error: 'MISSING_PROMPT'
        });
      }

      const messages = [{ role: 'user', content: prompt }];
      const response = await dolphinai({ messages, template });

      // Struktur JSON disesuaikan agar cocok dengan visual terminal di landing page
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

  // Daftarkan middleware rate limit dan handler ke method GET & POST
  app.get('/api/ai/dolphin', apiKeyMiddleware, handleDolphinRequest);
  app.post('/api/ai/dolphin', apiKeyMiddleware, handleDolphinRequest);
};
