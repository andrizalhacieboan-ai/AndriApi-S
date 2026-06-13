/**
 * Lokasi File: ./src/api/tools/tiktokstalk.js
 * Ditulis khusus untuk backend Andri API (Tools Category)
 */

const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

// ==========================================
// CORE SCRAPER FUNCTION (PURE FETCH)
// ==========================================
async function stalk(username) {
    username = username.replace(/^@/, "").trim();
    const html = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
        headers: {
            "authority": "www.tiktok.com",
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": "Android",
            "user-agent": "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
        }
    }).then(a => a.text());

    const match =
        html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/) ||
        html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
        
    if (!match) return null;

    const json = JSON.parse(match[1]);
    const scope = json.__DEFAULT_SCOPE__ || json.DEFAULT_SCOPE;
    const detail = scope?.["webapp.user-detail"] || scope?.["webapp.reflow.profile.initial"];
    const userInfo = detail?.userInfo;

    let u, s;
    if (userInfo?.user) {
        u = userInfo.user;
        s = userInfo.stats || userInfo.statsV2 || {};
    } else if (json.UserModule?.users) {
        const id = Object.keys(json.UserModule.users)[0];
        u = json.UserModule.users[id];
        s = json.UserModule.stats?.[id] || {} ;
    } else {
        return null;
    }

    return {
        username: u.uniqueId || username,
        nickname: u.nickname || "",
        userId: u.id || null,
        secUid: u.secUid || null,
        verified: !!u.verified,
        privateAccount: !!u.privateAccount,
        region: u.region || null,
        language: u.language || null,
        ttSeller: !!u.ttSeller,
        createdAt: u.createTime ? new Date(u.createTime * 1000).toISOString() : null,
        signature: u.signature || "",
        bioLink: u.bioLink?.link || null,
        avatar: {
            thumb: u.avatarThumb || null,
            medium: u.avatarMedium || null,
            larger: u.avatarLarger || null
        },
        stats: {
            followers: Number(s.followerCount) || 0,
            following: Number(s.followingCount) || 0,
            hearts: Number(s.heartCount ?? s.heart) || 0,
            videos: Number(s.videoCount) || 0,
            friends: Number(s.friendCount) || 0,
            diggs: Number(s.diggCount) || 0
        },
        profileUrl: `https://www.tiktok.com/@${u.uniqueId || username}`
    };
}

// ==========================================
// EXPRESS ROUTING MODULE FOR ANDRI API
// ==========================================
module.exports = function (app) {

    // Handler universal untuk melayani request TikTok Stalker
    const handleTiktokStalk = async (req, res) => {
        // Mendukung parameter username atau user dari body maupun query string
        const targetUser = req.body.username || req.query.username || req.body.user || req.query.user;

        if (!targetUser) {
            return res.status(400).json({ 
                status: false, 
                statusCode: 400,
                message: 'Parameter "username" wajib diisi.',
                error: "USERNAME_REQUIRED" 
            });
        }

        try {
            // Eksekusi fungsi stalker
            const result = await stalk(targetUser);

            if (!result) {
                return res.status(404).json({
                    status: false,
                    statusCode: 404,
                    message: "User tidak ditemukan atau struktur data TikTok telah diperbarui.",
                    error: "USER_NOT_FOUND"
                });
            }

            // Struktur respons standar sukses (status 200) sesuai sistem Andri API
            return res.status(200).json({
                status: true,
                statusCode: 200,
                message: "Success stalking TikTok profile",
                data: result
            });

        } catch (err) {
            // Penanganan jika terjadi error server / network fail
            return res.status(500).json({ 
                status: false, 
                statusCode: 500,
                message: err.message || "Internal Server Error saat memproses request.", 
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

    // Registrasi Rute Express (Mendukung GET dan POST)
    app.get("/api/tools/tiktokstalk", bypassOrCheckApiKey, handleTiktokStalk);
    app.post("/api/tools/tiktokstalk", bypassOrCheckApiKey, handleTiktokStalk);
};
