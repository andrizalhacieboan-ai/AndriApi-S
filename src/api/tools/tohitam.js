/**
 * Lokasi File: ./src/api/tools/tohitam.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 */

const axios = require("axios");
const { apiKeyMiddleware } = require('../../middleware/ratelimit');

async function processToHitam(imageUrl, customPrompt) {
    // Default prompt sesuai fungsionalitas utama plugin bot ".tohitam"
    const prompt = customPrompt || "dark cinematic portrait, low light aesthetic";

    try {
        const response = await axios.get("https://api.ikyyxd.my.id/edit/nanobananav3", {
            params: {
                prompt: prompt,
                url: imageUrl
            },
            timeout: 45000 // Berikan waktu lebih panjang untuk pemrosesan AI
        });

        const data = response.data;

        // Ekstraksi URL hasil dari berbagai kemungkinan struktur response API luar
        let resultUrl = typeof data === 'string' ? 
            data : 
            (data?.result?.url || data?.result || data?.url || data?.data?.url || data?.data?.image);

        if (!resultUrl || typeof resultUrl !== 'string') {
            throw new Error('Format response dari core API AI tidak dikenali atau kosong.');
        }

        // Unduh gambar hasil ke dalam bentuk buffer
        const imageRes = await axios.get(resultUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(imageRes.data, 'binary');

        return {
            success: true,
            resultUrl: resultUrl,
            buffer: buffer
        };

    } catch (error) {
        throw new Error(error?.response?.data?.message || error.message || "Gagal memproses gambar AI");
    }
}

module.exports = function (app) {

  const handleToHitam = async (req, res) => {
    const imageUrl = req.body.url || req.query.url;
    const prompt = req.body.prompt || req.query.prompt || null; 
    const renderType = req.body.action || req.query.action || "json";

    if (!imageUrl) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter "url" gambar yang ingin diubah wajib diisi.',
        error: "URL_REQUIRED"
      });
    }

    try {
      const result = await processToHitam(imageUrl, prompt);

      // JIKA USER INGIN OUTPUT GAMBAR LANGSUNG
      if (renderType === "render") {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(result.buffer);
      }

      // RESPONS DATA STANDAR JSON + BASE64
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success converting image to dark aesthetic style",
        data: {
          mimeType: "image/jpeg",
          style: prompt || "dark cinematic portrait, low light aesthetic",
          source: result.resultUrl,
          base64: result.buffer.toString("base64"),
          url: `data:image/jpeg;base64,${result.buffer.toString("base64")}`
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

  app.get("/api/tools/tohitam", bypassOrCheckApiKey, handleToHitam);
  app.post("/api/tools/tohitam", bypassOrCheckApiKey, handleToHitam);
};
