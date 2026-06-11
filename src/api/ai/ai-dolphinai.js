const { apiKeyMiddleware } = require('../../middleware/ratelimit'); // ← ganti
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

    // Parse SSE / NDJSON streaming response
    const lines = String(data).split('\n');
    const parts = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Format: "data: {...}"
        let jsonStr = null;
        if (trimmed.startsWith('data: ')) {
            jsonStr = trimmed.slice(6);
        } else if (trimmed.startsWith('{')) {
            // raw NDJSON (no "data: " prefix)
            jsonStr = trimmed;
        }

        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
            const parsed = JSON.parse(jsonStr);
            // OpenAI-compatible streaming: choices[0].delta.content
            const content = parsed?.choices?.[0]?.delta?.content
                // Ollama-style streaming: message.content
                ?? parsed?.message?.content
                // Non-streaming: choices[0].message.content
                ?? parsed?.choices?.[0]?.message?.content
                // Direct content field
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
  app.post('/api/ai/dolphin', apiKeyMiddleware, async (req, res) => { // ← ganti
    try {
      const { prompt, template = 'logical' } = req.body;
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
      return res.status(200).json({
        status: true,
        statusCode: 200,
        data: response,
        creator: process.env.APP_NAME || 'Andri API'
      });
    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  });
};
