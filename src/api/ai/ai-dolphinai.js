const { dolphinai } = require('./dolphinai');
const { requireAuthJson } = require('../../middleware/auth');

module.exports = function(app) {
  app.post('/api/ai/dolphin', requireAuthJson, async (req, res) => {
    try {
      const { prompt, template = 'logical' } = req.body;
      
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({
          status: false,
          statusCode: 400,
          message: 'Parameter "prompt" wajib diisi (string).',
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
      console.error('[DolphinAI] Error:', err.message);
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: 'Gagal memproses permintaan AI.',
        error: 'AI_SERVICE_ERROR'
      });
    }
  });
};
