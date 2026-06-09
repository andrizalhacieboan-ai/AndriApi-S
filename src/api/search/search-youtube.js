// src/api/search/search-youtube.js
const ytSearch = require('yt-search');
const { apiKeyMiddleware } = require('../../middleware/ratelimit');

module.exports = function(app) {
  app.get('/api/search/youtube', apiKeyMiddleware, async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({ status:false, statusCode:400, message:'Parameter "q" wajib diisi.', error:'MISSING_PARAM', example:'/api/search/youtube?q=lofi+music&apikey=AND+...' });
      }
      const results = await ytSearch(q);
      return res.status(200).json({
        status:true, statusCode:200, message:'OK', query:q,
        count: results.videos.length,
        results: results.videos.slice(0, 10).map(v => ({ title:v.title, url:v.url, thumbnail:v.thumbnail, duration:v.timestamp, views:v.views, author:v.author?.name })),
        plan: req.apiPlan
      });
    } catch (err) {
      return res.status(500).json({ status:false, statusCode:500, message:'Gagal pencarian YouTube.', error:err.message });
    }
  });
};
