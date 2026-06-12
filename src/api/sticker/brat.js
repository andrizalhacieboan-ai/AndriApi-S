/**
 * Lokasi File: ./src/api/sticker/brat.js
 * Ditulis khusus untuk backend Andri API (Sticker Category)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit');
const { chromium } = require('playwright');

class BratGenerator {
    constructor(options = {}) {
       this.config = {
          text: options.text || null,
          background: options.background || "#FFFF",
          color: options.color || "#000000"
       };
    }

    async generate() {
      // Ditambahkan args sandbox agar lancar saat di-deploy di cloud Linux seperti Railway
      const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      try {
        const { background, color, text } = this.config;
        const context = await browser.newContext({
          viewport: { width: 1000, height: 1000 }
        });
        
        const page = await context.newPage();
        await page.goto(`https://bratgenerator.com/`);
        
        await page.click('#toggleButtonWhite');
        await page.click('#textOverlay');
        await page.click('#textInput');
        await page.fill('#textInput', text);
        
        await page.evaluate((data) => {
          if (data.background) {
            $('.node__content.clearfix').css('background-color', data.background);
          }
          if (data.color) {
            $('.textFitted').css('color', data.color);
          }
          $('.textFitted').css('max-width', '796px');
          $('.textFitted').css('max-height', '796px');
          $('.textFitted').css('font-size', '140px');
          $('#textOverlay').css({
            'border': `3px solid ${data.background}`,
            'width': '800px !important',
            'height': '800px !important',
            'min-width': '800px',
            'min-height': '800px',
            'max-width': '800px',
            'max-height': '800px',
            'display': 'flex',
            'align-items': 'center',
            'justify-content': 'center'
          });
        }, { background, color });

        // Tunggu transisi/render font selesai
        await page.waitForTimeout(1500);
        
        const select = await page.locator('#textOverlay');
        const element = await page.$('#textOverlay');
        const box = await element.boundingBox();
        
        const result = await select.screenshot({
          clip: {
            x: box.x,
            y: box.y,
            width: 800,
            height: 800
          }
        });

        await context.close();
        return result;
      } finally {
        // Pastikan browser selalu tertutup meski proses gagal agar tidak membengkak di RAM
        await browser.close();
      }
    }
}

module.exports = function (app) {

  // Handler universal rute brat sticker
  const handleBrat = async (req, res) => {
    const text = req.body.text || req.query.text;
    const background = req.body.background || req.query.background || "#FFFF";
    const color = req.body.color || req.query.color || "#000000";

    if (!text) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter "text" wajib diisi.',
        error: "TEXT_REQUIRED"
      });
    }

    try {
      const generator = new BratGenerator({ text, background, color });
      const imageBuffer = await generator.generate();

      // Struktur respons standar kode 200 sukses
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success generating brat sticker",
        data: {
          mimeType: "image/png",
          base64: imageBuffer.toString("base64"),
          url: `data:image/png;base64,${imageBuffer.toString("base64")}`
        }
      });
    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: err.message,
        error: "SERVER_ERROR"
      });
    }
  };

  /**
   * Gerbang Deteksi Bypass Dashboard Console
   */
  const bypassOrCheckApiKey = (req, res, next) => {
    const hasApiKey = req.query.apikey || req.headers['x-api-key'];
    
    if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
      return next();
    }
    
    return apiKeyMiddleware(req, res, next);
  };

  // Daftarkan rute GET & POST
  app.get("/api/sticker/brat", bypassOrCheckApiKey, handleBrat);
  app.post("/api/sticker/brat", bypassOrCheckApiKey, handleBrat);
};
