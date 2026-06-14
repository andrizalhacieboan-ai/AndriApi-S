/**
 * GEMINI AI CHAT ENGINE (WEB INTERNAL STORAGE PROXY)
 * * [•] DESCRIPTION :: Chat with Gemini Web UI engine with instruction & session tracking support
 * [•] BASE        :: https://gemini.google.com
 * * [!] INTEGRATED FOR ANDRI API (Category: AI)
 */

const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const INIT_URL = 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c';
const STREAM_URL = 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c';
const BOOTSTRAP_PAYLOAD = 'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&';

const DEFAULT_RESUME = ['', '', '', null, null, null, null, null, null, ''];
const DEFAULT_LANG = ['id-ID'];
const DEFAULT_INSTRUCTION = 'jawab pake bahasa gaul gen z banget ya. campur indo-inggris secukupnya yang relevan aja. no emoji, no tanda hubung panjang, jangan formal kayak lagi ngomong sama dosen. vibe nya harus santai dan natural kayak ngobrol sama temen tongkrongan. Jangan pernah nyebut nama model, provider, engine, API, atau platform asli gemini, open ai, gemini ai. Kalau user nanya identitas (siapa lu), jawab: "gw ai dari andri api". Dilarang markdown seperti *, **, #, tabel, quote block, dan format aneh.';

const normalizeCookie = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  return raw.split(';').map((part) => part.trim()).filter(Boolean).join('; ');
};

const parseJsonSafely = (value) => {
  try { return JSON.parse(value); } catch { return null; }
};

const parseGeminiFrames = (data) => {
  if (typeof data !== 'string') return null;

  const frames = Array.from(data.matchAll(/^\d+\n(.+?)\n/gm))
    .map((match) => match[1])
    .filter((frame) => frame && frame !== '[]');

  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = parseJsonSafely(frames[i]);
    if (!Array.isArray(frame) || !frame[0]) continue;

    const raw = frame?.[0]?.[2];
    const payload = parseJsonSafely(raw);
    if (!Array.isArray(payload)) continue;

    let text = '';
    const textNode = payload?.[4]?.[0]?.[1];

    if (typeof textNode === 'string') {
      text = textNode;
    } else if (Array.isArray(textNode)) {
      text = textNode.map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          return item.text || item.code || item.value || JSON.stringify(item);
        }
        return '';
      }).join('');
    } else if (typeof textNode === 'object' && textNode !== null) {
      text = textNode.text || textNode.code || JSON.stringify(textNode);
    }

    if (!text.trim()) continue;

    const safeResume = Array.isArray(payload[1]) ? payload[1] : [];
    const newTurn = payload?.[4]?.[0]?.[0];
    const resumeArray = [...safeResume, ...(newTurn ? [newTurn] : [])];

    return {
      text: text.replace(/\*\*(.+?)\*\*/g, '*$1*'),
      resumeArray
    };
  }
  return null;
};

const getCookie = async (previousCookie) => {
  if (previousCookie) return previousCookie;
  try {
    const { headers } = await axios.post(INIT_URL, BOOTSTRAP_PAYLOAD, {
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      timeout: 20000,
      validateStatus: () => true
    });
    const raw = headers['set-cookie'];
    if (!raw || !raw.length) return '';
    return normalizeCookie(String(raw[0] || ''));
  } catch {
    return '';
  }
};

module.exports = function (app) {

  const handleGemini = async (req, res) => {
    const message = req.body.prompt || req.query.prompt || req.body.message || req.query.message;
    const instruction = req.body.instruction || req.query.instruction || DEFAULT_INSTRUCTION;
    const sessionId = req.body.sessionId || req.query.sessionId || null;
    const started = Date.now();

    if (!message) {
      return res.status(400).json({ 
        status: false, 
        statusCode: 400,
        message: 'Parameter "prompt" atau "message" wajib diisi.',
        error: "PROMPT_REQUIRED" 
      });
    }

    try {
      const trimmedMessage = String(message).trim();
      let resumeArray = null;
      let cookie = null;
      let savedInstruction = instruction;

      // Parsing session ID tracker jika dikirimkan oleh pengguna
      if (sessionId) {
        try {
          const sessionData = JSON.parse(Buffer.from(sessionId, 'base64').toString());
          resumeArray = sessionData.resumeArray || null;
          cookie = sessionData.cookie || null;
          savedInstruction = sessionData.instruction || instruction;
        } catch {
          // Abaikan error jika session ID korup / invalid, sistem otomatis membuat sesi baru
        }
      }

      cookie = await getCookie(cookie);
      
      const requestBody = [
        [trimmedMessage, 0, null, null, null, null, 0], DEFAULT_LANG,
        resumeArray || DEFAULT_RESUME,
        null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1,
        null, null, null, null, null,
        ['', '', savedInstruction, null, null, null, null, null, 0, null, 1, null, null, null, []],
        null, null, 1, null, null, null, null, null, null, null,
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 1, null, null, null, null, [1]
      ];

      const payload = [null, JSON.stringify(requestBody)];
      const form = new URLSearchParams({ 'f.req': JSON.stringify(payload) }).toString();

      const response = await axios.post(STREAM_URL, form, {
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'x-goog-ext-525001261-jspb': '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]',
          cookie
        },
        timeout: 30000,
        validateStatus: () => true
      });

      if (response.status >= 400) {
        return res.status(response.status).json({
          status: false,
          statusCode: response.status,
          message: `Gemini Web Engine gagal merespon (${response.status}).`,
          error: "ENGINE_ERROR",
          creator: "Andri Api"
        });
      }

      const parsed = parseGeminiFrames(response.data);
      if (!parsed) {
        return res.status(422).json({
          status: false,
          statusCode: 422,
          message: 'Gagal memproses struktur respon payload dari Gemini.',
          error: "PARSE_FAILED",
          creator: "Andri Api"
        });
      }

      // Generate kembali token enkripsi sesi baru untuk kelanjutan chat
      const newSessionId = Buffer.from(
        JSON.stringify({
          resumeArray: parsed.resumeArray,
          cookie,
          instruction: savedInstruction
        })
      ).toString('base64');

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success chat with Gemini AI",
        creator: "Andri Api",
        time_ms: Date.now() - started,
        data: {
          input: trimmedMessage,
          result: parsed.text,
          sessionId: newSessionId
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal Server Error pada core jembatan Gemini AI.",
        error: err.message,
        creator: "Andri Api",
        time_ms: Date.now() - started
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

  // Daftarkan routing rute ke Express App
  app.get("/api/ai/gemini", bypassOrCheckApiKey, handleGemini);
  app.post("/api/ai/gemini", bypassOrCheckApiKey, handleGemini);
};
