/**
 * Lokasi File: ./src/api/tools/glen.js
 * Ditulis khusus untuk backend Andri API (Search/Tools Category)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit');

class GoogleLensClient {
	/** @type {Record<string, string>} */
	#headers;

	/** @type {number} */
	#timeoutMs;

	/**
	 * Create a GoogleLensClient.
	 *
	 * @param {Object} [options]
	 * @param {string} [options.userAgent]
	 * @param {Record<string, string>} [options.headers]
	 * @param {number} [options.timeoutMs]
	 */
	constructor({ userAgent, headers, timeoutMs = 60_000 } = {}) {
		const ua = userAgent || GoogleLensClient.DEFAULT_UA;
		this.#headers = { ...GoogleLensClient.DEFAULT_HEADERS(ua), ...headers };
		this.#timeoutMs = timeoutMs;
	}

	/**
	 * Perform a Google Lens search by providing a public image URL.
	 *
	 * @param {string} imageUrl - Publicly reachable image URL (http/https).
	 * @returns {Promise<Object>} Parsed results and visual matches.
	 */
	async search(imageUrl) {
		const target = `https://r.jina.ai/https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
		const res = await fetch(target, {
			headers: this.#headers,
			signal: AbortSignal.timeout(this.#timeoutMs),
		});

		if (!res.ok) {
			throw new Error(`HTTP Error: ${res.status}`);
		}
		return GoogleLensClient.#extractData(await res.text());
	}

	/** @type {string} */
	static DEFAULT_UA =
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

	static DEFAULT_HEADERS = (ua) => ({
		"User-Agent": ua,
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.7",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		Origin: "https://lens.google.com",
	});

	static #isUrl = (u) => {
		try {
			return new URL(u).protocol.startsWith("http");
		} catch {
			return false;
		}
	};

	static #isJunk = (t) =>
		!t.trim() || /^\d+:\d{2}$/.test(t) || t.startsWith("![");

	static #clean = (str) =>
		str
			.replace(/\r/g, "")
			.replace(/https?:\/\/[^\s)\]]+/g, (m) => m.replace(/\s+/g, ""))
			.replace(
				/\(\s*(https?:\/\/[\s\S]*?)\s*\)/g,
				(_, u) => `(${u.replace(/\s+/g, "")})`
			);

	static #slice(text, starts, end) {
		const idx = Math.min(
			...starts.map((s) => text.indexOf(s)).filter((i) => i >= 0)
		);
		if (idx === Infinity) {
			return "";
		}
		const sub = text.slice(idx);
		const e = sub.indexOf(end);
		return e < 0 ? sub : sub.slice(0, e);
	}

	static #extractData(raw) {
		const text = GoogleLensClient.#clean(raw);
		const visual = GoogleLensClient.#slice(
			text,
			[
				"Visual matches\n--------------",
				"Related search\n--------------",
			],
			"Footer Links"
		);
		const results = GoogleLensClient.#slice(
			text,
			["Search Results"],
			"Show more"
		);
		return {
			results: GoogleLensClient.#parseResults(results || visual),
			images: GoogleLensClient.#parseImages(visual),
		};
	}

	static #parseImages(block) {
		const chunks = block.split("\n\n").filter(Boolean);
		const rImg = /!\[[^\]]*?\]\((.*?)\)/;
		const rCard = /\[!\[[^\]]*?\]\((.*?)\)\s*([^\]]*?)\]\((.*?)\)/;
		const out = [];

		for (let i = 0; i < chunks.length; i++) {
			const img = rImg.exec(chunks[i]),
				card = rCard.exec(chunks[i]);
			if (img && !card) {
				const next = rCard.exec(chunks[i + 1] || "");
				if (next) {
					out.push({
						image: img[1],
						icon: next[1],
						title: next[2],
						source: next[3],
					});
				}
			} else if (card && !img) {
				const prev = rImg.exec(chunks[i - 1] || "");
				if (prev) {
					out.push({
						image: prev[1],
						icon: card[1],
						title: card[2],
						source: card[3],
					});
				}
			} else if (img && card) {
				out.push({
					image: img[1],
					icon: card[1],
					title: card[2],
					source: card[3],
				});
			}
		}

		const seen = new Set();
		return out
			.map((o) => ({
				image: (o.image || "").trim(),
				icon: (o.icon || "").trim(),
				title: (o.title || "").trim(),
				source: (o.source || "").trim(),
			}))
			.filter(
				(o) =>
					GoogleLensClient.#isUrl(o.source) &&
					GoogleLensClient.#isUrl(o.image) &&
					GoogleLensClient.#isUrl(o.icon) &&
					!o.image.startsWith("blob:") &&
					!o.icon.startsWith("blob:") &&
					!o.image.includes("localhost") &&
					!o.icon.includes("localhost") &&
					!GoogleLensClient.#isJunk(o.title) &&
					((k) => !seen.has(k) && !!seen.add(k))(
						`${o.source}||${o.title}||${o.image}`
					)
			);
	}

	static #parseResults(block) {
		const seen = new Set();
		return block
			.split("\n\n")
			.filter((s) => s.startsWith("[###"))
			.map((s) => {
				const m =
					/\[###\s*(.*?)\s*!\[[^\]]*?\]\([^)]*?\)\s*(.*?)\]\((.*?)\)/.exec(
						s
					);
				return (
					m && {
						title: m[1].trim(),
						desc: m[2].trim(),
						link: m[3].trim(),
					}
				);
			})
			.filter(Boolean)
			.filter(
				(o) =>
					o.title &&
					GoogleLensClient.#isUrl(o.link) &&
					((k) => !seen.has(k) && !!seen.add(k))(o.link)
			);
	}
}

// Inisialisasi Google Lens Client tunggal
const lensClient = new GoogleLensClient();

module.exports = function (app) {

	// Handler universal untuk melayani request Google Lens
	const handleGoogleLens = async (req, res) => {
		// Fleksibel menerima parameter 'url' atau 'imageUrl' dari body/query
		const url = req.body.url || req.query.url || req.body.imageUrl || req.query.imageUrl;

		if (!url) {
			return res.status(400).json({
				status: false,
				statusCode: 400,
				message: 'Parameter "url" (link gambar) wajib diisi.',
				error: 'URL_REQUIRED'
			});
		}

		try {
			const result = await lensClient.search(url);

			// Struktur respons standar kode 200 sukses
			return res.status(200).json({
				status: true,
				statusCode: 200,
				message: "Success searching image via Google Lens",
				data: result
			});
		} catch (err) {
			return res.status(500).json({
				status: false,
				statusCode: 500,
				message: err.message,
				error: 'SERVER_ERROR'
			});
		}
	};

	/**
	 * Gerbang Deteksi Bypass Khusus Console Dashboard
	 */
	const bypassOrCheckApiKey = (req, res, next) => {
		const hasApiKey = req.query.apikey || req.headers['x-api-key'];
		
		if (!hasApiKey && (req.cookies?.session || req.cookies?.token)) {
			return next();
		}
		
		return apiKeyMiddleware(req, res, next);
	};

	// Daftarkan rute ke Express
	app.get("/api/tools/glen", bypassOrCheckApiKey, handleGoogleLens);
	app.post("/api/tools/glen", bypassOrCheckApiKey, handleGoogleLens);
};
