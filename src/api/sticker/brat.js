/**
 * Lokasi File: ./src/api/sticker/brat.js
 * Ditulis khusus untuk backend Andri API (Sticker Category - Canvas Version)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit');
const { createCanvas } = require('canvas');

class BratGenerator {
    constructor(options = {}) {
       this.config = {
          text: options.text || "",
          // Default Brat menggunakan warna hijau lime khas (#8ace00)
          background: options.background || "#8ace00", 
          color: options.color || "#000000"
       };
    }

    async generate() {
        const width = 800;
        const height = 800;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 1. Gambar Background
        ctx.fillStyle = this.config.background;
        ctx.fillRect(0, 0, width, height);

        // 2. Konfigurasi Teks Gaya Brat (Menggunakan Arial/Sans-serif polos)
        ctx.fillStyle = this.config.color;
        
        let fontSize = 110; // Ukuran font awal yang ideal
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const words = this.config.text.split(' ');
        const maxWidth = 720; // Padding kiri-kanan 40px
        const maxHeight = 720; // Padding atas-bawah 40px
        
        let lines = [];
        let currentLine = '';

        // Algoritma Text Wrapping (Memecah kata ke baris baru jika kepanjangan)
        for (let i = 0; i < words.length; i++) {
            let testLine = currentLine + words[i] + ' ';
            let metrics = ctx.measureText(testLine.trim());
            
            if (metrics.width > maxWidth && i > 0) {
                lines.push(currentLine.trim());
                currentLine = words[i] + ' ';
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine.trim());

        // Algoritma Text Fitting (Mengecilkan font jika tinggi total teks melebihi batas)
        let lineHeight = fontSize * 1.15;
        while ((lines.length * lineHeight) > maxHeight && fontSize > 30) {
            fontSize -= 5;
            lineHeight = fontSize * 1.15;
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        }

        // 3. Render Teks ke Tengah Canvas
        const totalHeight = lines.length * lineHeight;
        let startY = (height - totalHeight) / 2 + (lineHeight / 2);

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], width / 2, startY);
            startY += lineHeight;
        }

        // Mengembalikan Buffer PNG
        return canvas.toBuffer('image/png');
    }
}

module.exports = function (app) {

  const handleBrat = async (req, res) => {
    const text = req.body.text || req.query.text;
    // Kita buat default-nya langsung warna hijau Brat (#8ace00) jika user tidak mengirimkan warna background
    const background = req.body.background || req.query.background || "#8ace00";
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

      // Respons standar sukses
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success generating brat sticker via Canvas",
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

  const bypassOrCheckApiKey = (req, res, next) => {
    const hasApiKey = req.query.apikey || req.headers['x-api-key'];
    if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
      return next();
    }
    return apiKeyMiddleware(req, res, next);
  };

  app.get("/api/sticker/brat", bypassOrCheckApiKey, handleBrat);
  app.post("/api/sticker/brat", bypassOrCheckApiKey, handleBrat);
};
