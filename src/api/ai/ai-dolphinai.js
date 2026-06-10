const { dolphinai } = require('./dolphinai');
const { requireAuthJson } = require('../../middleware/auth');

module.exports = function(app) {
  app.post('/api/ai/dolphin', requireAuthJson, async (req, res) => {
    try {
      const { prompt, template = 'logical' } = req.body;

      // Validasi input
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({
          status: false,
          statusCode: 400,
          message: 'Parameter "prompt" wajib diisi (string).',
          error: 'MISSING_PROMPT'
        });
      }

      if (prompt.length > 2000) {
        return res.status(400).json({
          status: false,
          statusCode: 400,
          message: 'Prompt terlalu panjang (maksimal 2000 karakter).',
          error: 'PROMPT_TOO_LONG'
        });
      }

      // Siapkan messages untuk dolphinai
      const messages = [{ role: 'user', content: prompt }];
      
      // Panggil fungsi dolphinai
      const response = await dolphinai({ messages, template });

      // Kirim respons sukses
      return res.status(200).json({
        status: true,
        statusCode: 200,
        data: response,
        creator: process.env.APP_NAME || 'Andri API'
      });
    } catch (err) {
      console.error('[DolphinAI] Error:', err.message);
      
      // Tangani error spesifik dari dolphinai
      let errorMessage = 'Gagal memproses permintaan AI. Silakan coba lagi nanti.';
      if (err.message.includes('template')) {
        errorMessage = err.message;
      } else if (err.message.includes('No result')) {
        errorMessage = 'AI tidak mengembalikan respons. Coba lagi.';
      }
      
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: errorMessage,
        error: 'AI_SERVICE_ERROR'
      });
    }
  });
};
