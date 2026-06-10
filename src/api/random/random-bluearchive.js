const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit');

module.exports = function(app) {
  async function getBlueArchiveImage() {
    try {
      const { data } = await axios.get(
        'https://raw.githubusercontent.com/rynxzyy/blue-archive-r-img/refs/heads/main/links.json',
        { timeout: 10000 }
      );
      const url = data[Math.floor(Math.random() * data.length)];
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Gagal mengambil gambar: ${error.message}`);
    }
  }

  // Endpoint: GET /api/random/ba
  app.get('/api/random/ba', apiKeyMiddleware, async (req, res) => {
    try {
      const imgBuffer = await getBlueArchiveImage();
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': imgBuffer.length,
      });
      res.end(imgBuffer);
    } catch (error) {
      console.error('[BlueArchive]', error.message);
      res.status(500).json({
        status: false,
        statusCode: 500,
        message: error.message,
        error: 'UPSTREAM_ERROR'
      });
    }
  });
};
