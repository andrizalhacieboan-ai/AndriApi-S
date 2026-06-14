/**
 * IMAGE UPSCALER
 * * [•] DESCRIPTION :: Upscale and enhance image resolution using iLoveIMG Engine
 * [•] BASE        :: https://www.iloveimg.com/upscale-image
 * * [!] INTEGRATED FOR ANDRI API (Category: Convert - NEW)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

// Daftar server API iLoveIMG secara acak
const SERVERS = [
  'api1g', 'api2g', 'api3g', 'api8g', 'api9g', 'api10g', 'api11g', 'api12g', 
  'api13g', 'api14g', 'api15g', 'api16g', 'api17g', 'api18g', 'api19g', 'api20g', 
  'api21g', 'api22g', 'api24g', 'api25g'
];

// 1. Fungsi mengambil Token Sesi & CSRF
async function getToken() {
  const res = await axios.get('https://www.iloveimg.com/upscale-image', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
    }
  });
  const $ = cheerio.load(res.data);
  const script = $('script:contains("ilovepdfConfig =")').html();
  if (!script) throw new Error("Gagal mendapatkan konfigurasi token dari iLoveIMG.");
  
  const jsons = script.split('ilovepdfConfig =')[1].split(';')[0];
  const json = JSON.parse(jsons);
  const csrf = $('meta[name="csrf-token"]').attr('content');
  return { token: json.token, csrf };
}

// 2. Fungsi melakukan Upload file buffer ke server iLoveIMG
async function uploader(server, headers, buffer) {
  const form = new FormData();
  // Menggunakan task token generator bawaan snippet asal Anda
  const task = 'r68zl88mq72xq94j2d5p66bn2z9lrbx20njsbw2qsAvgmzr11lvfhAx9kl87pp6yqgx7c8vg7sfbqnrr42qb16v0gj8jl5s0kq1kgp26mdyjjspd8c5A2wk8b4Adbm6vf5tpwbqlqdr8A9tfn7vbqvy28ylphlxdl379psxpd8r70nzs3sk1';

  form.append('name', 'image.jpg');
  form.append('chunk', '0');
  form.append('chunks', '1');
  form.append('task', task);
  form.append('preview', '1');
  form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

  const res = await axios.post(`https://${server}.iloveimg.com/v1/upload`, form, {
    headers: {
      ...headers,
      ...form.getHeaders(),
    },
  });

  return { ...res.data, task };
}

// 3. Eksekusi Proses Upscale Gambar
async function processUpscale(buffer, scale = 4) {
  const { token, csrf } = await getToken();
  const server = SERVERS[Math.floor(Math.random() * SERVERS.length)];

  const headers = {
    'Authorization': 'Bearer ' + token,
    'Origin': 'https://www.iloveimg.com/',
    'Cookie': '_csrf=' + csrf,
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
  };

  const upload = await uploader(server, headers, buffer);

  const form = new FormData();
  form.append('task', upload.task);
  form.append('server_filename', upload.server_filename);
  form.append('scale', String(scale));

  const res = await axios.post(`https://${server}.iloveimg.com/v1/upscale`, form, {
    headers: {
      ...headers,
      ...form.getHeaders(),
    },
    responseType: 'arraybuffer',
  });

  return res.data;
}

// ==========================================
// EXPRESS ROUTING MODULE FOR ANDRI API
// ==========================================
module.exports = function (app) {

  const handleUpscale = async (req, res) => {
    const targetUrl = req.body.url || req.query.url;
    // Mendukung custom skala kustom via parameter, default diatur ke 4 sesuai request dasar Anda
    const scale = req.body.scale || req.query.scale || 4; 

    if (!targetUrl) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter "url" gambar wajib disertakan.',
        error: "URL_REQUIRED"
      });
    }

    try {
      // Unduh gambar dari URL input menjadi Buffer
      const imageResponse = await axios.get(targetUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data, 'binary');

      // Jalankan mesin pemrosesan upscale
      const upscaledBuffer = await processUpscale(imageBuffer, scale);

      // Kirimkan balik berupa file gambar mentah langsung (Direct Image Stream)
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(upscaledBuffer);

    } catch (err) {
      // Jika terjadi kegagalan proses internal, kembalikan JSON Error standar Andri API
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Gagal memproses peningkatan resolusi gambar (Upscale).",
        error: err.message,
        creator: "Andri Api"
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

  // Pendaftaran Rute Endpoint Ke Aplikasi Utama
  app.get("/api/convert/upscale", bypassOrCheckApiKey, handleUpscale);
  app.post("/api/convert/upscale", bypassOrCheckApiKey, handleUpscale);
};
