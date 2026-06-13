/**
 * Lokasi File: ./src/api/downloader/pinterest.js
 * Ditulis khusus untuk backend Andri API (Downloader & Search Category)
 * Base Scraper Creator: ShanMolvyr (https://whatsapp.com/channel/0029VbB4Kw8EFeXfeExaXc3Q)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 
const https = require("https");
const crypto = require("crypto");

// ─── CORE HTTP REQUEST ──────────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          "User-Agent": "Mozilla/5.0 (Android 15; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept-Encoding": "identity",
          "X-Requested-With": "XMLHttpRequest",
          "X-Pinterest-AppState": "active",
          "X-Pinterest-PWS-Handler": "www/search/[scope].js",
          ...headers,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body, headers: res.headers })
        );
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ─── PINTEREST SCRAPER HELPERS ──────────────────────────────────────────
const rand = (n) => crypto.randomBytes(n).toString("hex");
const appVer = () => rand(4).slice(0, 7);
const ts = () => Date.now();

function buildSearchUrl(query, pageSize, bookmark) {
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
  const options = {
    query,
    scope: "pins",
    page_size: pageSize,
    rs: "typed",
    redux_normalize_feed: true,
    appliedProductFilters: "---",
    auto_correction_disabled: false,
    static_feed: false,
    ...(bookmark ? { bookmarks: [bookmark] } : {}),
  };
  const data = encodeURIComponent(JSON.stringify({ options, context: {} }));
  return (
    `https://id.pinterest.com/resource/BaseSearchResource/get/` +
    `?source_url=${encodeURIComponent(sourceUrl)}&data=${data}&_=${ts()}`
  );
}

function buildPinUrl(pinId) {
  const options = { id: pinId, field_set_key: "detailed" };
  const data = encodeURIComponent(JSON.stringify({ options, context: {} }));
  return (
    `https://id.pinterest.com/resource/PinResource/get/` +
    `?source_url=${encodeURIComponent(`/pin/${pinId}/`)}&data=${data}&_=${ts()}`
  );
}

function apiHeaders(query) {
  const trace = rand(8);
  return {
    "X-APP-VERSION": appVer(),
    "X-B3-TraceId": trace,
    "X-B3-SpanId": rand(8),
    "X-B3-ParentSpanId": trace,
    "X-B3-Flags": "0",
    "screen-dpr": "2.857142857142857",
    "X-Pinterest-Source-Url": `/search/pins/?rs=typed&q=${encodeURIComponent(query || "")}`,
    Referer: `https://id.pinterest.com/search/pins/?rs=typed&q=${encodeURIComponent(query || "")}`,
  };
}

function parsePin(p) {
  if (!p || !p.id) return null;

  const images = p.images || {};
  const videos = p.videos?.video_list || null;

  let type = "image";
  let mediaUrl = images["736x"]?.url || images.orig?.url || null;
  let sizes = {
    orig: images.orig || null,
    "736x": images["736x"] || null,
    "474x": images["474x"] || null,
    "236x": images["236x"] || null,
  };

  if (videos && Object.keys(videos).length) {
    type = "video";
    const sorted = Object.entries(videos).sort(
      (a, b) => (b[1]?.width || 0) - (a[1]?.width || 0)
    );
    mediaUrl = sorted[0]?.[1]?.url || null;
    sizes = videos;
  } else if (mediaUrl?.includes(".gif") || p.is_gif) {
    type = "gif";
  }

  return {
    id: p.id,
    type,
    title: p.title || p.grid_title || p.description?.slice(0, 80) || "",
    description: p.description || "",
    pinUrl: `https://www.pinterest.com/pin/${p.id}/`,
    mediaUrl,
    thumbnail: images["236x"]?.url || images["474x"]?.url || mediaUrl,
    sizes,
    link: p.link || null,
    board: p.board ? { id: p.board.id, name: p.board.name } : null,
    pinner: p.pinner
      ? {
          username: p.pinner.username,
          fullName: p.pinner.full_name,
          avatar: p.pinner.image_small_url || null,
        }
      : null,
    stats: {
      saves: p.save_count || p.repin_count || 0,
      comments: p.comment_count || 0,
    },
    dominantColor: p.dominant_color || null,
    createdAt: p.created_at || null,
  };
}

async function searchPinterest(query, opts = {}) {
  const { limit = 25, bookmark = null } = opts;
  const url = buildSearchUrl(query, limit, bookmark);
  const { status, body } = await httpsGet(url, apiHeaders(query));

  if (status !== 200) throw new Error(`HTTP ${status}`);

  const json = JSON.parse(body);
  const rr = json?.resource_response;

  if (!rr || rr.status !== "success") {
    throw new Error(rr?.message || "Pinterest API Error");
  }

  const pins = rr.data?.results || [];
  const nextBookmark = rr.data?.bookmark || null;

  return {
    query,
    total: pins.length,
    bookmark: nextBookmark,
    hasMore: !!nextBookmark,
    results: pins.map(parsePin).filter(Boolean),
  };
}

async function getPin(pinId) {
  const url = buildPinUrl(pinId);
  const { status, body } = await httpsGet(url, {
    ...apiHeaders(""),
    Referer: `https://id.pinterest.com/pin/${pinId}/`,
    "X-Pinterest-Source-Url": `/pin/${pinId}/`,
  });

  if (status !== 200) throw new Error(`HTTP ${status}`);

  const json = JSON.parse(body);
  const pin = json?.resource_response?.data;
  if (!pin) throw new Error(`Pin ${pinId} tidak ditemukan`);
  return parsePin(pin);
}

function extractPinId(urlOrId) {
  if (!urlOrId) return null;
  if (/^\d+$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(/\/pin\/(\d+)/);
  return match ? match[1] : null;
}

// ─── EXPRESS ROUTE ROUTING ──────────────────────────────────────────────
module.exports = function (app) {

    // 1. HANDLER UNIVERSAL UNTUK DOWNLOAD (URL / ID)
    const handleDownload = async (req, res) => {
        const target = req.body.url || req.query.url || req.body.id || req.query.id;

        if (!target) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "url" atau "id" pin wajib diisi.',
                error: "URL_REQUIRED" 
            });
        }

        const pinId = extractPinId(target);
        if (!pinId) {
            return res.status(400).json({
                status: false,
                statusCode: 400,
                message: 'Format URL atau ID Pinterest tidak valid.',
                error: "INVALID_TARGET"
            });
        }

        try {
            const result = await getPin(pinId);

            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success downloading Pinterest media",
                data: result
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

    // 2. HANDLER UNIVERSAL UNTUK PENCARIAN (SEARCH PINS)
    const handleSearch = async (req, res) => {
        const query = req.body.q || req.query.q || req.body.query || req.query.query;
        const limit = req.body.limit || req.query.limit || 25;

        if (!query) {
            return res.status(400).json({
                status: false,
                statusCode: 400,
                message: 'Parameter kata kunci "q" atau "query" wajib diisi.',
                error: "QUERY_REQUIRED"
            });
        }

        try {
            const result = await searchPinterest(query, { limit: parseInt(limit) || 25 });

            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success searching Pinterest pins",
                data: result
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
     * Gerbang Deteksi Bypass Khusus Console Web / Session Cookie
     */
    const bypassOrCheckApiKey = (req, res, next) => {
        const hasApiKey = req.query.apikey || req.headers['x-api-key'];
        
        if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
            return next();
        }
        
        return apiKeyMiddleware(req, res, next);
    };

    // Registrasi Rute Express untuk Downloader (Mendukung GET dan POST)
    app.get("/api/download/pinterest", bypassOrCheckApiKey, handleDownload);
    app.post("/api/download/pinterest", bypassOrCheckApiKey, handleDownload);

    // Registrasi Rute Express untuk Pencarian (Mendukung GET dan POST)
    app.get("/api/search/pinterest", bypassOrCheckApiKey, handleSearch);
    app.post("/api/search/pinterest", bypassOrCheckApiKey, handleSearch);
};
