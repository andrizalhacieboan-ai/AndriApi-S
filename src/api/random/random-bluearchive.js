// src/api/random/random-bluearchive.js
const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit');

module.exports = function(app) {
  async function bluearchive() {
    try {
      const { data } = await axios.get(
        'https://raw.githubusercontent.com/rynxzyy/blue-archive-r-img/refs/heads/main/links.json',
        { timeout: 10000 }
      );
      const url = data[Math.floor(data.length * Math.random())];
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      return Buffer.from(response.data);
    } catch (error) {
      throw error;
    }
  }

  app.get('/api/random/ba', apiKeyMiddleware, async (req, res) => {
    try {
      const img = await bluearchive();
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': img.length,
      });
      res.end(img);
    } catch (error) {
      res.status(500).json({ status: false, statusCode: 500, message: `Error: ${error.message}`, error: 'UPSTREAM_ERROR' });
    }
  });
};
