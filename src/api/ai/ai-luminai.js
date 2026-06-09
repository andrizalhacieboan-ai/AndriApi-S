// src/api/ai/ai-luminai.js
const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit');

module.exports = function(app) {
  app.get('/api/ai/luminai', apiKeyMiddleware, async (req, res) => {
    try {
      const { text } = req.query;
      if (!text) {
        return res.status(400).json({ status:false, statusCode:400, message:'Parameter "text" wajib diisi.', error:'MISSING_PARAM', example:'/api/ai/luminai?text=Halo&apikey=AND+...' });
      }
      const r = await axios.post('https://luminai.my.id/', { content: text }, { timeout: 15000 });
      return res.status(200).json({ status:true, statusCode:200, message:'OK', query:text, result: r.data?.result || r.data, plan: req.apiPlan });
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.response?.status >= 500) {
        return res.status(503).json({ status:false, statusCode:503, message:'Layanan upstream tidak tersedia.', error:'UPSTREAM_UNAVAILABLE' });
      }
      return res.status(500).json({ status:false, statusCode:500, message:'Server error.', error:err.message });
    }
  });
};
