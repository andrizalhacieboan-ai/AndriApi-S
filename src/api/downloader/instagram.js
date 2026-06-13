/**
 * Lokasi File: ./src/api/downloader/instagram.js
 * Ditulis khusus untuk backend Andri API (Downloader & Scraper Category)
 */

const vm = require("vm");
const sharp = require("sharp");
const crypto = require("crypto");
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0";
const site = "https://igram.world";
const hub = "https://api-wh.igram.world";
const ocrKeys = ["helloworld", "K81634588988957", "K87899142388957"];
const headers = { "user-agent": ua, origin: site, referer: site + "/" };

// Variabel Cache global agar tidak mem-fetch chunk JS terus-menerus di setiap request
let cachedChunk = null;

async function getChunk() {
    if (cachedChunk) return cachedChunk;
    try {
        const home = await (await fetch(site + "/en1/", { headers: { ...headers, accept: "text/html" } })).text();
        const appPath = (home.match(/\/js\/app\.js\?id=[a-f0-9]+/) || ["/js/app.js"])[0];
        const app = await (await fetch(site + appPath, { headers: { ...headers, accept: "*/*" } })).text();
        const chunk = (app.match(/js\/link\.chunk\.js\?ch=[0-9a-f]+\.js/) || ["js/link.chunk.js"])[0];
        cachedChunk = await (await fetch(site + "/" + chunk, { headers: { ...headers, accept: "*/*" } })).text();
        return cachedChunk;
    } catch (err) {
        // Jika gagal, reset cache agar request berikutnya mencoba fetch ulang
        cachedChunk = null;
        throw new Error("Gagal menginisialisasi modul internal bypass signature.");
    }
}

function createSigner(code) {
    const reals = {};
    for (const k of ["Object", "Array", "Function", "Boolean", "Number", "String", "Symbol", "Math", "JSON", "Date", "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "Promise", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "Map", "Set", "WeakMap", "WeakSet", "ArrayBuffer", "Uint8Array", "Uint16Array", "Uint32Array", "Int8Array", "Int16Array", "Int32Array", "Float32Array", "Float64Array", "DataView", "TextEncoder", "TextDecoder", "Reflect", "Proxy", "BigInt", "escape", "unescape", "Intl"]) reals[k] = global[k];
    reals.crypto = global.crypto || crypto.webcrypto;
    reals.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
    reals.performance = global.performance;
    reals.atob = global.atob;
    reals.btoa = global.btoa;
    reals.setTimeout = () => 0; reals.clearTimeout = () => {}; reals.setInterval = () => 0; reals.clearInterval = () => {};
    reals.requestIdleCallback = () => 0; reals.cancelIdleCallback = () => {}; reals.requestAnimationFrame = () => 0; reals.cancelAnimationFrame = () => {};
    reals.queueMicrotask = f => Promise.resolve().then(f);
    reals.URL = global.URL; reals.URLSearchParams = global.URLSearchParams; reals.Blob = global.Blob; reals.fetch = global.fetch;
    reals.AbortController = global.AbortController; reals.AbortSignal = global.AbortSignal;
    reals.Event = global.Event || function () {}; reals.CustomEvent = global.CustomEvent || function () {}; reals.EventTarget = global.EventTarget || function () {};
    reals.MessageChannel = global.MessageChannel || function () { this.port1 = {}; this.port2 = {}; };
    reals.structuredClone = global.structuredClone;
    
    const storage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
    reals.localStorage = storage(); reals.sessionStorage = storage();
    reals.navigator = { userAgent: ua, language: "en-US", languages: ["en-US", "en"], platform: "Win32", hardwareConcurrency: 8, deviceMemory: 8, webdriver: false, vendor: "Google Inc.", plugins: { length: 0 }, maxTouchPoints: 0 };
    reals.location = { href: site + "/en1/", origin: site, protocol: "https:", host: "igram.world", hostname: "igram.world", pathname: "/en1/", search: "", hash: "", reload() {}, replace() {}, assign() {}, toString() { return this.href; } };
    
    const el = (tag = "DIV") => ({ tagName: tag, nodeName: tag, nodeType: 1, ownerDocument: null, [Symbol.toStringTag]: "HTML" + tag[0] + tag.slice(1).toLowerCase() + "Element", setAttribute() {}, getAttribute() { return null }, hasAttribute() { return false }, appendChild(x) { return x }, removeChild(x) { return x }, insertBefore(x) { return x }, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true }, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false }, toggle() {} }, getContext() { return null }, remove() {}, cloneNode() { return el(tag) }, set src(v) {}, get src() { return "" }, set onload(v) {}, set onerror(v) {}, set innerHTML(v) {}, get innerHTML() { return "" }, children: [], childNodes: [] });
    reals.document = { [Symbol.toStringTag]: "HTMLDocument", nodeType: 9, nodeName: "#document", createElement: t => el((t || "div").toUpperCase()), createElementNS: (ns, t) => el((t || "div").toUpperCase()), createTextNode: t => ({ nodeType: 3, textContent: t }), createComment: () => ({ nodeType: 8 }), createDocumentFragment: () => el("FRAGMENT"), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], getElementsByTagName: () => [], getElementsByClassName: () => [], addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true }, head: el("HEAD"), body: el("BODY"), documentElement: el("HTML"), cookie: "", currentScript: null, readyState: "complete", visibilityState: "visible", hidden: false, referrer: "", title: "igram", characterSet: "UTF-8", contentType: "text/html", compatMode: "CSS1Compat", hasFocus: () => true };
    reals.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 };
    reals.history = { pushState() {}, replaceState() {}, length: 1, state: null };
    reals.addEventListener = () => {}; reals.removeEventListener = () => {}; reals.dispatchEvent = () => true;
    reals.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    reals.getComputedStyle = () => ({ getPropertyValue: () => "" });
    reals.XMLHttpRequest = function () { this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; this.addEventListener = () => {}; };
    reals.WebSocket = function () { this.close = () => {}; this.send = () => {}; this.addEventListener = () => {}; };
    reals.Worker = function () { this.postMessage = () => {}; this.terminate = () => {}; this.addEventListener = () => {}; };
    reals.Image = function () {}; reals.CSS = { supports: () => false };

    let captured = [];
    const handler = {
        get(t, p, r) { if (p in t) return t[p]; if (["self", "window", "globalThis", "global", "top", "parent", "frames"].includes(p)) return r; return undefined; },
        set(t, p, v) { t[p] = v; if (Array.isArray(v)) captured.push(v); return true; }
    };
    const ctx = new Proxy(reals, handler);
    reals.self = ctx; reals.window = ctx; reals.globalThis = ctx; reals.global = ctx; reals.top = ctx; reals.parent = ctx; reals.frames = ctx;
    reals.document.defaultView = ctx; reals.document.location = reals.location;

    vm.createContext(ctx);
    vm.runInContext(code, ctx, { filename: "link.chunk.js" });

    let modules = null;
    for (const arr of captured) for (const e of arr) if (Array.isArray(e) && Array.isArray(e[0]) && e[1] && typeof e[1] === "object") modules = e[1];
    if (!modules || !modules[3508]) throw new Error("signer module not found");

    const cache = {};
    function req(id) {
        if (cache[id]) return cache[id].exports;
        const m = cache[id] = { exports: {} };
        try { modules[id].call(ctx, m, m.exports, req); } catch {}
        return m.exports;
    }
    req.d = (e, defs) => { for (const k in defs) if (Object.prototype.hasOwnProperty.call(defs, k) && !Object.prototype.hasOwnProperty.call(e, k)) Object.defineProperty(e, k, { enumerable: true, get: defs[k] }); };
    req.o = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    req.r = e => { try { Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }); } catch {} Object.defineProperty(e, "__esModule", { value: true }); };
    req.n = m => { const g = m && m.__esModule ? () => m.default : () => m; req.d(g, { a: g }); return g; };
    req.e = () => Promise.resolve(); req.g = ctx; req.p = site + "/"; req.b = req.p; req.u = () => ""; req.f = {}; req.m = modules; req.c = cache; req.x = () => {}; req.h = () => "";

    req(2871).evaluateEnvironment = () => ({ hardFail: false, hardReasons: [], score: 0, flags: 0, signals: {} });
    req(9267).checkDomainAdvanced = () => ({ ok: true, hardFail: false, hardReason: "", score: 0, flags: 0, signals: {}, host: "igram.world" });
    req(9267).isProbablyNative = () => true;

    return req(3508).default;
}

async function ocr(png) {
    for (const key of ocrKeys) {
        const form = new FormData();
        form.append("file", new Blob([png], { type: "image/png" }), "c.png");
        form.append("language", "eng"); form.append("OCREngine", "2"); form.append("scale", "true"); form.append("isOverlayRequired", "false");
        try {
            const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: key }, body: form });
            const j = await res.json().catch(() => null);
            if (j && !j.IsErroredOnProcessing && Array.isArray(j.ParsedResults)) return j.ParsedResults.map(r => r.ParsedText || "").join("").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
            if (!/rate|limit|exceed|quota/i.test(JSON.stringify(j))) break;
        } catch {}
    }
    return "";
}

async function solveCaptcha() {
    const j = await (await fetch(hub + "/api/captcha", { headers: { ...headers, accept: "application/json, text/plain, */*" } })).json();
    if (!j || !j.captcha || !j.hash) return null;
    const svgRes = await fetch(hub + "/captcha?captcha=" + encodeURIComponent(j.captcha), { headers: { ...headers, accept: "image/*" } });
    const svg = Buffer.from(await svgRes.arrayBuffer());
    const png = await sharp(svg, { density: 220 }).flatten({ background: "#ffffff" }).resize(360, 120).png().toBuffer();
    const text = await ocr(png);
    if (text.length < 3) return null;
    const body = new URLSearchParams({ value: text, hash: j.hash });
    const r = await fetch(hub + "/api/captcha", { method: "POST", headers: { ...headers, "content-type": "application/x-www-form-urlencoded", accept: "application/json, text/plain, */*" }, body });
    const s = await r.json().catch(() => ({}));
    return s && s.result ? s.result : null;
}

async function rawPost(url, body, token) {
    const h = { ...headers, "content-type": "application/json", accept: "application/json, text/plain, */*" };
    if (token) h["x-token"] = token;
    const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, data: j, captcha: j && j.code === "CAPTCHA_REQUIRED" };
}

async function signedRequest(signer, url, rawBody) {
    let body = await signer(rawBody);
    let res = await rawPost(url, body);
    let attempts = 0;
    while (res.captcha && attempts < 8) {
        attempts++;
        const token = await solveCaptcha();
        if (!token) continue;
        body = await signer(rawBody);
        res = await rawPost(url, body, token);
    }
    return { ...res, attempts };
}

function parse(data) {
    const nodes = Array.isArray(data) ? data : [data];
    const out = [];
    for (const node of nodes) {
        const arr = Array.isArray(node && node.url) ? node.url : [];
        for (const it of arr) if (it && (it.url || it.href)) out.push({ url: it.url || it.href, type: it.type || it.ext || "", quality: it.quality || it.subname || it.subName || "", ext: it.ext || "" });
    }
    return out;
}

function mediaResult(data) {
    const first = Array.isArray(data) ? (data[0] || {}) : (data || {}) ;
    const meta = first.meta || {};
    return {
        source: meta.source || "",
        shortcode: meta.shortcode || "",
        username: meta.username || "",
        title: meta.title || first.title || "",
        likes: meta.like_count ?? null,
        comments: meta.comment_count ?? null,
        taken_at: meta.taken_at ?? null,
        thumb: first.thumb || meta.thumb || "",
        slides: Array.isArray(data) ? data.length : 1,
        media: parse(data)
    };
}

function parseStories(data) {
    const arr = Array.isArray(data && data.result) ? data.result : Array.isArray(data) ? data : [];
    const out = [];
    for (const it of arr) {
        if (!it) continue;
        const vids = it.video_versions || it.video_resources || [];
        if (Array.isArray(vids) && vids.length) {
            const v = vids[0];
            out.push({ type: "video", url: v.url_wrapped || v.url, width: v.width || null, height: v.height || null, taken_at: it.taken_at ?? null });
        } else {
            const cands = (it.image_versions2 && it.image_versions2.candidates) || it.display_resources || [];
            const c = cands[0];
            if (c) out.push({ type: "image", url: c.url_wrapped || c.url || c.src, width: c.width || null, height: c.height || null, taken_at: it.taken_at ?? null });
        }
    }
    return out;
}

function parseProfile(data) {
    const u = (data && data.result) || data || {};
    const n = x => (x && typeof x === "object" && "count" in x) ? x.count : (x ?? null);
    return {
        id: u.id || u.pk || "",
        username: u.username || "",
        full_name: u.full_name || "",
        biography: u.biography || "",
        is_private: !!u.is_private,
        is_verified: !!(u.is_verified || u.is_verified_badge),
        followers: n(u.edge_followed_by) ?? u.follower_count ?? null,
        following: n(u.edge_follow) ?? u.following_count ?? null,
        posts: n(u.edge_owner_to_timeline_media) ?? u.media_count ?? null,
        avatar: u.profile_pic_url_wrapped || u.profile_pic_url_hd || u.profile_pic_url || ""
    };
}

function detect(input) {
    const s = String(input).trim();
    if (!/^https?:\/\//i.test(s)) return { kind: "profile", username: s.replace(/^@/, "").replace(/\/+$/, "") };
    let path = s;
    try { path = new URL(s).pathname; } catch {}
    const story = path.match(/\/stories\/([^/]+)(?:\/(\d+))?/);
    if (story) return story[2] ? { kind: "story", url: s } : { kind: "stories", username: story[1] };
    if (/\/(p|reel|reels|tv)\//.test(path)) return { kind: "media", url: s };
    const prof = path.match(/^\/([^/]+)\/?$/);
    if (prof && !["explore", "p", "reel", "reels", "tv", "stories"].includes(prof[1])) return { kind: "profile", username: prof[1] };
    return { kind: "media", url: s };
}

module.exports = function (app) {

    // Main Handler untuk Instagram API
    const handleInstagram = async (req, res) => {
        const target = req.body.url || req.query.url || req.body.username || req.query.username || req.body.input || req.query.input;

        if (!target) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "url", "username", atau "input" wajib diisi.',
                error: "INPUT_REQUIRED" 
            });
        }

        try {
            const t = detect(target);
            const chunkCode = await getChunk();
            const fnSign = createSigner(chunkCode);
            const pending = fnSign.default || fnSign;
            const signer = await pending;

            let r;
            if (t.kind === "media") r = await signedRequest(signer, hub + "/api/convert", { target_url: t.url });
            else if (t.kind === "story") r = await signedRequest(signer, hub + "/api/v1/instagram/story", { url: t.url });
            else if (t.kind === "stories") r = await signedRequest(signer, hub + "/api/v1/instagram/stories", { username: t.username });
            else r = await signedRequest(signer, hub + "/api/v1/instagram/profile", { username: t.username });

            if (r.captcha) {
                return res.status(422).json({
                    status: false,
                    statusCode: 422,
                    message: "Gagal memproses request karena rintangan captcha server luar setelah " + r.attempts + " kali percobaan.",
                    error: "CAPTCHA_UNSOLVED"
                });
            }

            if (r.status !== 200 || (r.data && r.data.success === false)) {
                return res.status(r.status === 200 ? 422 : r.status).json({
                    status: false,
                    statusCode: r.status === 200 ? 422 : r.status,
                    message: (r.data && (r.data.message || r.data.info)) || ("HTTP Provider Error " + r.status),
                    error: "PROVIDER_ERROR"
                });
            }

            // Parsing hasil data sesuai tipe deteksi awal
            let resultData = {};
            if (t.kind === "media") {
                resultData = mediaResult(r.data);
            } else if (t.kind === "story" || t.kind === "stories") {
                resultData = { username: t.username || r.data?.username || "", media: parseStories(r.data) };
            } else {
                resultData = { profile: parseProfile(r.data) };
            }

            // Struktur respons sukses standar Andri API
            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: `Success fetching Instagram ${t.kind} data`,
                data: {
                    type: t.kind,
                    captchaAttempts: r.attempts,
                    ...resultData
                }
            });

        } catch (err) {
            console.error("[Instagram Downloader Error]", err);
            return res.status(500).json({ 
                status: false, 
                statusCode: 500,
                message: err.message || "Gagal memproses data Instagram.", 
                error: "SERVER_ERROR"
            });
        }
    };

    /**
     * Gerbang Deteksi Bypass Sesi Console Web / Session Cookie
     */
    const bypassOrCheckApiKey = (req, res, next) => {
        const hasApiKey = req.query.apikey || req.headers['x-api-key'];
        
        if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
            return next();
        }
        
        return apiKeyMiddleware(req, res, next);
    };

    // Registrasi Rute Express (Mendukung GET dan POST)
    app.get("/api/download/instagram", bypassOrCheckApiKey, handleInstagram);
    app.post("/api/download/instagram", bypassOrCheckApiKey, handleInstagram);
};
