/**
 * Lokasi File: ./src/api/tools/tohitam.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 */

const axios = require("axios");
const { apiKeyMiddleware } = require('../../middleware/ratelimit');

async function processToHitam(imageUrl, customPrompt) {
    const prompt = customPrompt || "dark cinematic portrait, low light aesthetic";

    try {
        const response = await axios.get("https://api.ikyyxd.my.id/edit/nanobananav3", {
            params: {
                prompt: prompt,
                url: imageUrl
            },
            timeout: 45000 
        });

        const data = response.data;
        let resultUrl = typeof data === 'string' ? 
            data : 
            (data?.result?.url || data?.result || data?.url || data?.data?.url || data?.data?.image);

        if (!resultUrl || typeof resultUrl !== 'string') {
            throw new Error('Format response dari core API AI tidak dikenali atau kosong.');
        }

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
    const prompt = req.body.prompt || req.query.prompt || ""; 
    const renderType = req.body.action || req.query.action || "json";
    const apiKey = req.query.apikey || req.headers['x-api-key'] || "";

    if (!imageUrl) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter 'url' gambar yang ingin diubah wajib diisi.',
        error: "URL_REQUIRED"
      });
    }

    try {
      const result = await processToHitam(imageUrl, prompt);

      // 1. JIKA USER MEMANG SENGAJA MEMANGGIL MODE RENDER GAMBAR SAJA
      if (renderType === "render") {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(result.buffer);
      }

      // 2. JIKA MODE JSON, KITA BUAT GENERATE URL DIRECT-NYA SECARA OTOMATIS
      const protocol = req.protocol;
      const host = req.get('host');
      
      // Membuat link dinamis yang mengarah balik ke endpoint ini untuk memunculkan gambar langsung
      let dynamicRenderUrl = `${protocol}://${host}/api/tools/tohitam?url=${encodeURIComponent(imageUrl)}&action=render`;
      if (prompt) dynamicRenderUrl += `&prompt=${encodeURIComponent(prompt)}`;
      if (apiKey) dynamicRenderUrl += `&apikey=${apiKey}`; // Sertakan apikey agar link render tidak terblokir limit

      // RESPONS DATA SEMPURNA (Dapat JSON + Dapat Link Gambar Instan)
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success converting image to dark aesthetic style",
        data: {
          mimeType: "image/jpeg",
          style: prompt || "dark cinematic portrait, low light aesthetic",
          renderUrl: dynamicRenderUrl, // <--- INI DIA LINK GAMBAR JADINYA!
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
