/**
 * INSTAGRAM STALKER
 * * [•] AUTHOR      :: DEFAN
 * [•] WEB         :: soonex.biz.id
 * [•] DESCRIPTION :: Stalk Instagram profile info using username
 * [•] BASE        :: Supabase Edge Function
 * [•] CHANNEL     :: https://whatsapp.com/channel/0029Vb89qIx1XquQoXgzdd2m
 * * [!] INTEGRATED FOR ANDRI API (Category: Tools)
 * RESPECT THE AUTHOR, DO NOT REMOVE THIS WATERMARK!
 */

const axios = require('axios');
const { apiKeyMiddleware } = require('../../middleware/ratelimit'); 

const BASE_URL = 'https://fukqyugetzepsaanzqcy.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1a3F5dWdldHplcHNhYW56cWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTkxODMsImV4cCI6MjA2NTY5NTE4M30.RmRmd34FN5r3Q77Nt5GrDCqrrxOtAJWAaSQBJKh8fAM';

module.exports = function (app) {

  const handleIgStalk = async (req, res) => {
    const username = req.query.username || req.body.username;

    if (!username) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        message: 'Parameter "username" wajib diisi.',
        error: "USERNAME_REQUIRED"
      });
    }

    const cleanUsername = username.replace(/@/g, '').trim();

    try {
      const headers = { 
        'Authorization': 'Bearer ' + ANON_KEY, 
        'apikey': ANON_KEY,
        'Content-Type': 'application/json' 
      };

      const resInfo = await axios.get(
        `${BASE_URL}/functions/v1/mediafy-proxy?endpoint=info&username=${encodeURIComponent(cleanUsername)}`, 
        { headers }
      );
      
      const u = resInfo.data?.data;

      if (!u || Object.keys(u).length === 0) {
        return res.status(404).json({
          status: false,
          statusCode: 404,
          message: `Username "${cleanUsername}" tidak ditemukan di database Instagram.`,
          error: "USER_NOT_FOUND",
          creator: "Andri Api"
        });
      }

      return res.status(200).json({
        status: true,
        statusCode: 200,
        message: "Success stalking Instagram profile",
        creator: "Andri Api",
        author: "ANDRI STORE",
        data: {
          username: u.username,
          full_name: u.full_name || "",
          bio: u.biography || "",
          stats: {
            followers: u.follower_count || 0,
            following: u.following_count || 0,
            posts: u.media_count || 0
          },
          profile_pic: u.hd_profile_pic_url_info ? u.hd_profile_pic_url_info.url : u.profile_pic_url,
          is_private: u.is_private || false,
          is_verified: u.is_verified || false,
          external_url: u.external_url || null
        }
      });

    } catch (error) {
      // FIX: Jika proxy mengembalikan 404 (User mematikan akun / tidak ada)
      if (error.response?.status === 404) {
        return res.status(404).json({
          status: false,
          statusCode: 404,
          message: `Username "${cleanUsername}" tidak dapat ditemukan. Pastikan ketikan sudah benar dan akun tidak di-banned.`,
          error: "USERNAME_NOT_FOUND",
          creator: "Andri Api"
        });
      }

      // Menangkap error system lainnya (misal: Token expired / server down)
      const errorMsg = error.response?.data?.message || error.message || "Error";
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Gagal mengambil data profil dari server target proxy.",
        error: errorMsg,
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

  app.get("/api/tools/igstalk", bypassOrCheckApiKey, handleIgStalk);
  app.post("/api/tools/igstalk", bypassOrCheckApiKey, handleIgStalk);
};
