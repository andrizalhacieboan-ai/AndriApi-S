/**
 * Lokasi File: ./src/api/downloader/spotify.js
 * Ditulis khusus untuk backend Andri API (Downloader Category)
 * Base Scraper: https://spotisaver.net
 */

const fs = require('node:fs');
const path = require('node:path');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const BASE_URL = "https://spotisaver.net";
const LANG = "en";
const DOWNLOAD_DIR = "downloads";
const FILENAME_TAG = "SPOTISAVER";
const MAX_DOWNLOAD_RETRY = 5;
const RETRY_DELAYS = [5000, 8000, 12000, 18000, 25000];
const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

// Global cookie store untuk mengumpulkan session scraper
let cookieStore = {
  "_s-uid": `v_${Math.random().toString(16).slice(2, 16)}.${Math.floor(Math.random() * 100000000)}`,
  lang: LANG
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanInput(input) {
  return String(input || "")
    .trim()
    .replace(/%0A/gi, "")
    .replace(/%0D/gi, "")
    .replace(/\r|\n/g, "");
}

function randomIp() {
  return [
    Math.floor(Math.random() * 223) + 1,
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256)
  ].join(".");
}

function cookieHeader() {
  return Object.entries(cookieStore)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
}

function saveCookies(headers) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : splitSetCookie(headers.get("set-cookie"));

  for (const item of raw) {
    const part = item.split(";")[0];
    const i = part.indexOf("=");
    if (i > -1) cookieStore[part.slice(0, i)] = part.slice(i + 1);
  }
}

function jsonBase64(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

function parseSpotify(input) {
  const cleaned = cleanInput(input);
  const url = new URL(cleaned);
  const parts = url.pathname.split("/").filter(Boolean);

  return {
    raw: cleaned,
    type: parts[0] || "track",
    id: parts[1] || cleaned
  };
}

function safeName(name) {
  return String(name || "spotify-audio.mp3")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function getFilenameFromDisposition(disposition) {
  if (!disposition) return null;
  const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) return decodeURIComponent(utf[1].replace(/^"|"$/g, ""));
  const normal = disposition.match(/filename="([^"]+)"/i);
  if (normal?.[1]) return normal[1];
  return null;
}

function isHtml(text, contentType) {
  return contentType.includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(text);
}

function parseMaybeJson(buffer, contentType) {
  const text = buffer.toString("utf8");
  let json = null;
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      json = JSON.parse(text);
    } catch {}
  }
  return { text, json };
}

async function warmup(parsed) {
  const urls = [
    `${BASE_URL}/en1`,
    `${BASE_URL}/en/${parsed.type}/${parsed.id}/`
  ];
  for (const url of urls) {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(60000),
      headers: {
        "user-agent": UA,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "cookie": cookieHeader()
      }
    }).catch(() => null);

    if (res) {
      saveCookies(res.headers);
      await res.arrayBuffer().catch(() => null);
    }
  }
}

async function requestJson(url, extraHeaders = {}, referer = `${BASE_URL}/en1`) {
  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(60000),
    headers: {
      "user-agent": UA,
      "accept": "application/json",
      "sec-ch-ua-platform": "\"Android\"",
      "sec-ch-ua": "\"Google Chrome\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
      "sec-ch-ua-mobile": "?1",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "referer": referer,
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "cookie": cookieHeader(),
      "priority": "u=1, i",
      ...extraHeaders
    }
  });

  saveCookies(res.headers);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  return {
    code: res.status,
    ok: res.ok,
    contentType: res.headers.get("content-type") || "",
    text,
    data
  };
}

async function requestDownloadOnce(url, body, referer) {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: {
      "user-agent": UA,
      "sec-ch-ua-platform": "\"Android\"",
      "sec-ch-ua": "\"Google Chrome\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
      "sec-ch-ua-mobile": "?1",
      "content-type": "application/json",
      "accept": "*/*",
      "origin": BASE_URL,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "referer": referer,
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "cookie": cookieHeader(),
      "priority": "u=1, i"
    },
    body: JSON.stringify(body)
  });

  saveCookies(res.headers);
  const contentType = res.headers.get("content-type") || "";
  const disposition = res.headers.get("content-disposition") || "";
  const buffer = Buffer.from(await res.arrayBuffer());
  const parsed = parseMaybeJson(buffer, contentType);

  return {
    code: res.status,
    ok: res.ok,
    contentType,
    disposition,
    buffer,
    text: parsed.text,
    json: parsed.json
  };
}

async function requestDownload(url, body, referer) {
  const attempts = [];
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRY; attempt++) {
    const dl = await requestDownloadOnce(url, body, referer);
    const errorText = dl.json?.error || dl.text.slice(0, 200);
    const noSlots = dl.json?.error === "No available slots" || dl.text.includes("No available slots");

    attempts.push({
      attempt,
      code: dl.code,
      content_type: dl.contentType,
      error: dl.contentType.includes("audio") ? null : errorText,
      retry: noSlots && attempt < MAX_DOWNLOAD_RETRY
    });

    if (dl.ok && dl.contentType.includes("audio")) {
      return { ...dl, ok: true, attempts };
    }
    if (!noSlots || attempt >= MAX_DOWNLOAD_RETRY) {
      return { ...dl, ok: false, attempts };
    }
    await sleep(RETRY_DELAYS[attempt - 1] || 25000);
  }

  return {
    code: 500,
    ok: false,
    contentType: "application/json",
    disposition: "",
    buffer: Buffer.from(JSON.stringify({ error: "Max retry reached" })),
    text: JSON.stringify({ error: "Max retry reached" }),
    json: { error: "Max retry reached" },
    attempts
  };
}

async function getSignature(action, ctxPayload, referer) {
  const ctx = jsonBase64(ctxPayload);
  const url = `${BASE_URL}/api/get_signature.php?action=${encodeURIComponent(action)}&ctx=${encodeURIComponent(ctx)}`;
  return await requestJson(url, {}, referer);
}

// ==========================================
// EXPRESS ROUTING MODULE FOR ANDRI API
// ==========================================
module.exports = function (app) {

  const handleSpotify = async (req, res) => {
    const target = req.body.url || req.query.url || req.body.link || req.query.link;
    const wantStream = req.query.stream === 'true' || req.body.stream === true;

    if (!target) {
      return res.status(400).json({ 
        status: false, 
        statusCode: 400,
        message: 'Parameter "url" atau "link" wajib diisi.',
        error: "URL_REQUIRED" 
      });
    }

    if (!target.includes("spotify.com")) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: "URL tidak valid. Pastikan menggunakan tautan spotify.com",
        error: "INVALID_URL"
      });
    }

    try {
      const parsed = parseSpotify(target);
      const cleanUrl = parsed.raw;
      const pageReferer = `${BASE_URL}/en/${parsed.type}/${parsed.id}/`;
      const autoIp = randomIp();

      await warmup(parsed);

      // 1. Ambil Signature Playlist / Track Info
      const playlistSig = await getSignature("get_playlist", {
        id: parsed.id,
        type: parsed.type,
        lang: LANG
      }, pageReferer);

      if (!playlistSig.ok || !playlistSig.data?.success || !playlistSig.data?.token || !playlistSig.data?.exp) {
        return res.status(playlistSig.code || 400).json({
          status: false,
          statusCode: playlistSig.code || 400,
          step: "playlist_signature",
          message: "Gagal memproses tanda tangan playlist Spotify.",
          error: playlistSig.data || playlistSig.text.slice(0, 300)
        });
      }

      // 2. Ambil Track list Metadata
      const playlistUrl = `${BASE_URL}/api/get_playlist.php?id=${encodeURIComponent(parsed.id)}&type=${encodeURIComponent(parsed.type)}&lang=${encodeURIComponent(LANG)}`;
      const playlist = await requestJson(playlistUrl, {
        "x-pe": String(playlistSig.data.exp),
        "x-pt": String(playlistSig.data.token)
      }, pageReferer);

      if (!playlist.ok || !playlist.data?.tracks?.length) {
        return res.status(playlist.code || 400).json({
          status: false,
          statusCode: playlist.code || 400,
          step: "playlist_fetch",
          message: "Gagal memuat detail lagu dari database Spotify.",
          error: playlist.data || playlist.text.slice(0, 300)
        });
      }

      const info = playlist.data.playlist_info || {};
      const track = playlist.data.tracks[0];
      const realTrackId = track.id || parsed.id;
      const realReferer = `${BASE_URL}/en/track/${realTrackId}/`;

      const downloadCtx = {
        lang: LANG,
        id: String(realTrackId),
        name: String(track.name || ""),
        duration_ms: String(track.duration_ms || "")
      };

      // 3. Ambil Signature Downloader
      const downloadSig = await getSignature("download_track", downloadCtx, realReferer);
      if (!downloadSig.ok || !downloadSig.data?.success || !downloadSig.data?.token || !downloadSig.data?.exp) {
        return res.status(downloadSig.code || 400).json({
          status: false,
          statusCode: downloadSig.code || 400,
          step: "download_signature",
          message: "Gagal mendapatkan otentikasi unduhan musik.",
          error: downloadSig.data || downloadSig.text.slice(0, 300)
        });
      }

      const sigPayload = jsonBase64({
        token: String(downloadSig.data.token),
        exp: String(downloadSig.data.exp)
      });

      const dlUrl = `${BASE_URL}/api/download_track.php?sig=${encodeURIComponent(sigPayload)}`;
      const body = {
        track,
        download_dir: DOWNLOAD_DIR,
        filename_tag: FILENAME_TAG,
        user_ip: autoIp,
        is_premium: false,
        lang: LANG
      };

      // 4. Unduh Binary Buffer Audio
      const dl = await requestDownload(dlUrl, body, realReferer);
      if (!dl.ok || !dl.contentType.includes("audio")) {
        const rawErr = dl.text || dl.buffer.toString("utf8");
        return res.status(dl.code || 400).json({
          status: false,
          statusCode: dl.code || 400,
          step: "download_stream",
          message: "Gagal mengunduh file media audio dari server resource.",
          error: dl.json || rawErr.slice(0, 300)
        });
      }

      const headerName = getFilenameFromDisposition(dl.disposition);
      const filename = safeName(headerName || `${track.artists?.join(", ") || info.owner || "Spotify"} - ${track.name || info.name || realTrackId} (${FILENAME_TAG}).mp3`);

      // [OPSIONAL] Simpan ke local storage jika berjalan di Environment Persistent Disk
      try {
        fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        fs.writeFileSync(path.join(DOWNLOAD_DIR, filename), dl.buffer);
      } catch (fsErr) {
        // Dilewati jika hosting memakai sistem berkas Read-Only / Serverless Vercel
      }

      // 5. PENYALURAN RESPON (STREAMING AUDIO VS METADATA JSON)
      if (wantStream) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.send(dl.buffer);
      }

      // Generate dynamic stream URL untuk bot
      const currentApikey = req.query.apikey || req.headers['x-api-key'] || '';
      const streamUrl = `${req.protocol}://${req.get('host')}/api/download/spotify?url=${encodeURIComponent(cleanUrl)}&stream=true${currentApikey ? `&apikey=${currentApikey}` : ''}`;

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success downloading Spotify track",
        data: {
          id: realTrackId,
          type: info.type || "track",
          title: track.name || info.name || null,
          artists: track.artists || [],
          album: track.album || null,
          duration_ms: track.duration_ms || null,
          release_date: track.release_date || null,
          cover: track.image?.url || info.images?.[0]?.url || null,
          external_url: track.external_url || info.external_url || cleanUrl,
          format: "mp3",
          size: formatBytes(dl.buffer.length),
          filename: filename,
          url: streamUrl // Link streaming langsung mp3 untuk WhatsApp/Telegram Bot
        }
      });

    } catch (err) {
      return res.status(500).json({ 
        status: false, 
        statusCode: 500,
        message: err.message || "Internal Server Error saat mengunduh dari Spotify.", 
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

  app.get("/api/download/spotify", bypassOrCheckApiKey, handleSpotify);
  app.post("/api/download/spotify", bypassOrCheckApiKey, handleSpotify);
};
