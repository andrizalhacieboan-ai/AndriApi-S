/**
 * Lokasi File: ./src/api/tools/fakeovo.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 */

const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "tmp");

const IMAGE_URL = "https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Image/file_0000000078bc71fa87da5cf26dc6c008.jpeg";

const WIDTH = 841;
const HEIGHT = 1870;

const FONT_PATHS = [
  path.join(ROOT, "node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff2"), 
  path.join(ROOT, "node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-ext-600-normal.woff2"),
];

const FIXED_RP = Object.freeze({
  text: "Rp",
  x: 61,
  y: 368,
  size: 20,
  weight: 800,
});

const AMOUNT_STYLE = {
  x: 94,
  y: 371,
  size: 28,
  weight: 800,
  color: "#FFFFFF",
};

// State flag agar font tidak di-register berulang kali setiap kali API dipanggil (mencegah memory leak)
let isFontRegistered = false;

function registerFont() {
  if (isFontRegistered) return;
  
  for (const fontPath of FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      GlobalFonts.registerFromPath(fontPath, "Plus Jakarta Sans");
      isFontRegistered = true;
      return;
    }
  }
  console.warn("⚠️ Font Plus Jakarta Sans tidak ditemukan, menggunakan font default sistem.");
}

function formatAmount(input) {
  const digits = String(input).replace(/[^\d]/g, "") || "0";
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

async function loadImageFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal unduh template gambar: HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return loadImage(Buffer.from(arrayBuffer));
}

module.exports = function (app) {

  // Handler utama manipulasi gambar via @napi-rs/canvas
  const handleFakeOvo = async (req, res) => {
    const amountInput = req.query.amount || req.body.amount;

    // Validasi parameter wajib
    if (!amountInput) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter "amount" (jumlah nominal) wajib diisi.',
        error: "AMOUNT_REQUIRED"
      });
    }

    try {
      // Pastikan direktori penampung sementara tersedia
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      // Load font secara aman
      registerFont();

      // Memproses render gambar canvas
      const image = await loadImageFromUrl(IMAGE_URL);
      const canvas = createCanvas(WIDTH, HEIGHT);
      const ctx = canvas.getContext("2d");

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = AMOUNT_STYLE.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      // Render teks mata uang "Rp"
      ctx.font = `${FIXED_RP.weight} ${FIXED_RP.size}px "Plus Jakarta Sans"`;
      ctx.fillText(FIXED_RP.text, FIXED_RP.x, FIXED_RP.y);

      // Render angka nominal terformat
      const AMOUNT_TEXT = formatAmount(amountInput);
      ctx.font = `${AMOUNT_STYLE.weight} ${AMOUNT_STYLE.size}px "Plus Jakarta Sans"`;
      ctx.fillText(AMOUNT_TEXT, AMOUNT_STYLE.x, AMOUNT_STYLE.y);

      // Encode canvas ke buffer PNG dan tulis ke file temporer
      const buffer = await canvas.encode("png");
      const uniqueOutput = path.join(OUTPUT_DIR, `ovo-render-${Date.now()}.png`);
      await fsp.writeFile(uniqueOutput, buffer);

      // Set header respons sebagai gambar PNG murni
      res.setHeader("Content-Type", "image/png");
      
      // Kirim file ke client, lalu hapus file dari direktori /tmp agar penyimpanan disk tetap bersih
      return res.sendFile(uniqueOutput, (err) => {
        if (err) {
          console.error("Gagal mengirim file gambar:", err);
        }
        // Garbage collection: hapus file setelah koneksi selesai/terputus
        fs.unlink(uniqueOutput, () => {});
      });

    } catch (error) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: error.message || "Terjadi kesalahan internal pada proses pembuatan gambar.",
        error: "SERVER_ERROR"
      });
    }
  };

  // Proteksi rute murni menggunakan apiKeyMiddleware bawaan Andri API (Mendukung GET & POST)
  app.get("/api/tools/fakeovo", apiKeyMiddleware, handleFakeOvo);
  app.post("/api/tools/fakeovo", apiKeyMiddleware, handleFakeOvo);
};
