/**
 * PROMPTHERO AI IMAGE PROMPT SEARCH ENGINE
 * * [•] DESCRIPTION :: Search high-quality AI generation prompts from PromptHero.com (tRPC Internal Route)
 * [•] BASE        :: https://prompthero.com
 * * [!] INTEGRATED FOR ANDRI API (Category: SEARCH)
 * * [•] ORIGINAL SCRAPE BY DEFAN
 */

const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

/**
 * Pembersihan data mendalam untuk meringankan ukuran payload response
 */
function cleanResult(results) {
  if (!results || !results.items) return [];
  
  return results.items.map(item => {
    // Ekstraksi data krusial dari struktur objek tRPC PromptHero
    return {
      id: item.id || null,
      slug: item.slug || null,
      prompt: item.promptText || item.prompt || null,
      negative_prompt: item.negativePrompt || null,
      model: item.model || item.modelName || "unknown",
      view_count: item.viewsCount || 0,
      like_count: item.likesCount || 0,
      is_nsfw: item.nsfw || false,
      media: {
        thumbnail: item.imageUrl || null,
        full_res: item.imageUrl ? item.imageUrl.replace('-thumb', '') : null // Mengambil resolusi asli jika ada suffix thumb
      },
      sampler: item.sampler || null,
      cfg_scale: item.cfgScale || null,
      seed: item.seed || null,
      dimensions: item.width && item.height ? `${item.width}x${item.height}` : null
    };
  });
}

module.exports = function (app) {

  const handlePromptHeroSearch = async (req, res) => {
    // Fleksibilitas parameter input (q, prompt, atau query)
    const query = req.query.q || req.body.q || req.query.prompt || req.body.prompt || req.query.query || req.body.query;
    const page = parseInt(req.query.page || req.body.page) || 1;
    const limit = parseInt(req.query.limit || req.body.limit) || 10;
    const started = Date.now();

    if (!query) {
      return res.status(400).json({ 
        status: false, 
        statusCode: 400,
        message: 'Parameter kata kunci pencarian (q / prompt) wajib diisi.',
        error: "QUERY_REQUIRED" 
      });
    }

    try {
      // Struktur payload batch untuk endpoint tRPC milik PromptHero
      const requestBody = {
        0: { json: null, meta: { values: ["undefined"], v: 1 } },
        1: { json: null, meta: { values: ["undefined"], v: 1 } },
        2: {
          json: {
            query: String(query).trim(),
            searchMode: null,
            searchType: null,
            page: page,
            pageSize: limit,
            sort: null,
            model: null,
            modelVersion: null,
            type: null,
            timeRange: null,
            nsfw: false,
            nsfwOnly: null,
            sortOverride: null,
            featured: null,
            category: null,
            excludeNsfwDiscoveryContent: null
          },
          meta: {
            values: {
              searchMode: ["undefined"],
              searchType: ["undefined"],
              sort: ["undefined"],
              model: ["undefined"],
              modelVersion: ["undefined"],
              type: ["undefined"],
              timeRange: ["undefined"],
              nsfwOnly: ["undefined"],
              sortOverride: ["undefined"],
              featured: ["undefined"],
              category: ["undefined"],
              excludeNsfwDiscoveryContent: ["undefined"]
            },
            v: 1
          }
        }
      };

      const params = new URLSearchParams({
        batch: "1",
        input: JSON.stringify(requestBody)
      }).toString();

      const url = `https://prompthero.com/api/trpc/prompt.getModelsForSearch,category.getIndexedOptions,prompt.search?${params}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'x-trpc-source': 'nextjs-react',
          'Referer': 'https://prompthero.com/',
          'Origin': 'https://prompthero.com'
        },
        timeout: 15000
      });

      // Parsing data dari koordinat array objek tRPC rute ke-3 [2]
      const rawResults = response.data?.[2]?.result?.data?.json;
      const cleanItems = cleanResult(rawResults);

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success fetch AI prompts from PromptHero",
        creator: "Andri Api",
        time_ms: Date.now() - started,
        data: {
          search_query: query,
          page: page,
          per_page: limit,
          total_results: cleanItems.length,
          results: cleanItems
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal Server Error saat menjembatani tRPC PromptHero.",
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

  // Registrasi rute routing ke Express App
  app.get("/api/search/prompt", bypassOrCheckApiKey, handlePromptHeroSearch);
  app.post("/api/search/prompt", bypassOrCheckApiKey, handlePromptHeroSearch);
};
