/**
 * GPT 3.5 TURBO CHAT ENGINE
 * * [•] DESCRIPTION :: Chat with GPT-3.5 Turbo model via Chat Everywhere proxy
 * [•] BASE        :: https://chateverywhere.app
 * * [!] INTEGRATED FOR ANDRI API (Category: AI)
 */

const cheerio = require('cheerio');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

async function processGpt(input, options = {}) {
  const scheme = "https:";
  const sep = "/";
  const doubleSep = sep + sep;
  const hostChat = "chateverywhere.app";
  const hostIngest = "ingest.chatanywhere.app";

  const apiChatUrl = scheme + doubleSep + hostChat + sep + "api" + sep + "chat";
  const refererUrl = scheme + doubleSep + hostChat + sep + "id#";
  const ingestBaseUrl = scheme + doubleSep + hostIngest + sep + "i" + sep + "v0" + sep + "e" + sep + "?ip=1&_=";

  const userAgent = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

  const defaultPrompt = `Lu adalah gpt ai, asisten chat gen-z yang natural, luwes, dan nyambung konteks. Wajib pakai gw/lu. Jangan pernah nyebut nama model, provider, engine, API, atau platform asli gpt, open ai, chatgpt. Kalau user nanya identitas (siapa lu), jawab: "gw ai dari andri api". Tetap hindari pengulangan kata andri api berlebihan. Gaya jawaban: mulai dari inti 1-2 kalimat yang langsung jawab pertanyaan user, lalu lanjut detail seperlunya. Kalau user minta "detail", "lengkap", "komprehensif", atau "step by step", jawab panjang, terstruktur, dan mendalam (minimal 8 poin/subbagian) plus contoh praktis. Dilarang jawaban template, dilarang muter, dilarang ambigu, dilarang formal kaku. Boleh tajem tapi tetap sopan dan relevan, jangan toxic. Kalau user curhat, respon empatik dan manusiawi, jangan robotik. Emoji adaptif: kalau user pakai emoji atau konteks emosional, pakai 1 emoji relevan; kalau netral, emoji opsional maksimal 1. Jangan spam emoji. Dilarang em dash. Dilarang markdown seperti *, **, #, tabel, quote block, dan format aneh. Output wajib teks biasa rapi.`;

  const requestPayload = {
    model: {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5",
      maxLength: 12000,
      tokenLimit: 4000,
      completionTokenLimit: 2500,
      deploymentName: "gpt-35",
    },
    messages: [
      {
        role: "user",
        content: input,
        pluginId: null,
      },
    ],
    prompt: options.prompt || defaultPrompt,
    temperature: options.temperature || 0.5,
    enableConversationPrompt: false
  };

  const mainHeaders = {
    "Content-Type": "application/json",
    "Output-Language": "",
    "user-browser-id": "db7a9d69-c583-4875-8199-9e167cdd155a",
    "user-selected-plugin-id": "",
    "User-Agent": userAgent,
    "Referer": refererUrl
  };

  const ingestHeaders = {
    "Content-Type": "text/plain",
    "User-Agent": userAgent,
    "Referer": refererUrl
  };

  // Menggunakan native fetch bawaan Node.js
  await fetch(refererUrl, { headers: { "User-Agent": userAgent } }).catch(() => {});

  const currentTime = Date.now();
  const ingestSuffix = "&ver=1.161.3&compression=gzip-js";
  
  await fetch(ingestBaseUrl + currentTime + ingestSuffix, { method: "POST", headers: ingestHeaders, body: "" }).catch(() => {});
  await fetch(ingestBaseUrl + (currentTime + 150) + ingestSuffix, { method: "POST", headers: ingestHeaders, body: "" }).catch(() => {});
  await fetch(ingestBaseUrl + (currentTime + 180) + ingestSuffix, { method: "POST", headers: ingestHeaders, body: "" }).catch(() => {});

  const response = await fetch(apiChatUrl, {
    method: "POST",
    headers: mainHeaders,
    body: JSON.stringify(requestPayload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Status ${response.status} - ${errText}`);
  }

  const responseText = await response.text();
  
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    data = responseText;
  }

  await fetch(ingestBaseUrl + (currentTime + 300) + ingestSuffix, { method: "POST", headers: ingestHeaders, body: "" }).catch(() => {});

  return data;
}

module.exports = function (app) {

  const handleGpt = async (req, res) => {
    const message = req.body.prompt || req.query.prompt || req.body.message || req.query.message;
    const customPrompt = req.body.custom_prompt || req.query.custom_prompt;
    const temperature = parseFloat(req.body.temperature || req.query.temperature) || 0.5;
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
      const result = await processGpt(message, { prompt: customPrompt, temperature });
      
      let text = "";
      if (result) {
        if (typeof result === "string") {
          text = result;
        } else if (result.choices && result.choices[0]) {
          text = result.choices[0].message?.content || result.choices[0].text || "";
        } else if (result.text) {
          text = result.text;
        } else if (result.message) {
          text = result.message;
        }
      }

      if (!text) {
        return res.status(422).json({
          status: false,
          statusCode: 422,
          message: "Gagal mendapatkan respons teks valid dari engine Chat Everywhere.",
          error: "EMPTY_RESPONSE",
          creator: "Andri Api"
        });
      }

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success chat with GPT 3.5 Turbo",
        creator: "Andri Api",
        time_ms: Date.now() - started,
        data: {
          input: message,
          result: text
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal Server Error pada sistem jembatan GPT AI.",
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

  // Daftarkan rute endpoint ke Express (Mendukung GET dan POST)
  app.get("/api/ai/gpt", bypassOrCheckApiKey, handleGpt);
  app.post("/api/ai/gpt", bypassOrCheckApiKey, handleGpt);
};
