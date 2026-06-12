/**
 * Lokasi File: ./src/api/tools/depai.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 */

const axios = require("axios");
const crypto = require("crypto");
const { apiKeyMiddleware } = require('../../middleware/ratelimit');

const AGENT = "Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36";
const SALT = "hackers_become_a_little_stinkier_every_time_they_hack";

const md5 = s => crypto.createHash("md5").update(s).digest("hex");
const reverse = s => s.split("").reverse().join("");
const generateRandomIP = () => Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 254)).join(".");

function genKEY() {
    const r = String(Math.floor(Math.random() * 1e11));
    const h1 = reverse(md5(AGENT + r + SALT));
    const h2 = reverse(md5(AGENT + h1));
    const h3 = reverse(md5(AGENT + h2));
    return `tryit-${r}-${h3}`;
}

async function editImageFromUrl(imageUrl, prompt) {
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(imageResponse.data, 'binary');
    const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
    const filename = imageUrl.split('/').pop().split('?')[0] || 'image.jpg';

    let last = "request failed";
    
    for (let i = 0; i < 6; i++) {
        const form = new FormData();
        const blob = new Blob([buffer], { type: contentType });
        form.append("image", blob, filename);
        form.append("text", prompt);
        form.append("image_generator_version", "standard");

        try {
            const res = await fetch("https://api.deepai.org/api/image-editor", {
                method: "POST",
                headers: {
                    accept: "*/*",
                    origin: "https://deepai.org",
                    referer: "https://deepai.org/",
                    "user-agent": AGENT,
                    "api-key": genKEY(),
                    "x-forwarded-for": generateRandomIP()
                },
                body: form
            });

            const json = await res.json().catch(() => null);
            
            if (json?.output_url) {
                const resultRes = await fetch(json.output_url);
                const resultBuffer = Buffer.from(await resultRes.arrayBuffer());
                
                return {
                    success: true,
                    sourceUrl: json.output_url,
                    id: json.id,
                    buffer: resultBuffer
                };
            }
            last = json?.status || `http ${res.status}`;
        } catch (e) { 
            last = e.message; 
        }
    }
    
    throw new Error(last);
}

module.exports = function (app) {

  const handleDeepAI = async (req, res) => {
    const imageUrl = req.body.url || req.query.url;
    const prompt = req.body.prompt || req.query.prompt;
    const renderType = req.body.action || req.query.action || "json"; 
    const apiKey = req.query.apikey || req.headers['x-api-key'] || "";

    if (!imageUrl || !prompt) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter "url" (gambar) dan "prompt" (perintah edit) wajib diisi.',
        error: "MISSING_PARAMETERS"
      });
    }

    try {
      const result = await editImageFromUrl(imageUrl, prompt);

      // 1. MODE RENDER FILE GAMBAR LANGSUNG
      if (renderType === "render") {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(result.buffer);
      }

      // 2. MODE JSON DENGAN LINK RE-RENDER OTOMATIS
      const protocol = req.protocol;
      const host = req.get('host');
      
      let dynamicRenderUrl = `${protocol}://${host}/api/tools/deepai?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}&action=render`;
      if (apiKey) dynamicRenderUrl += `&apikey=${apiKey}`;

      // RESPONS DATA SEMPURNA
      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success editing image via DeepAI",
        data: {
          id: result.id,
          mimeType: "image/jpeg",
          renderUrl: dynamicRenderUrl, // <--- LINK DIRECT IMAGE UTK BOT KAMU
          source: result.sourceUrl,
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

  app.get("/api/tools/deepai", bypassOrCheckApiKey, handleDeepAI);
  app.post("/api/tools/deepai", bypassOrCheckApiKey, handleDeepAI);
};
