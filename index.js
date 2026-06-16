require('dotenv').config();

const express = require('express');
const path    = require('path');
const cors    = require('cors');
const cookieParser = require('cookie-parser');

const { initDb } = require('./src/db/turso');
const { resolveUser } = require('./src/middleware/auth');

const app  = express();
const PORT = process.env.PORT || 4000;

app.enable('trust proxy');
app.set('json spaces', 2);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());

// ── DB init + startup ────────────────────────────────────────────────────────
let dbReady = false;
let dbError = null;

// Jalankan initDb segera saat module di-load
const dbInitPromise = initDb()
  .then(() => {
    dbReady = true;
    console.log('[DB] ✓ Database ready');
  })
  .catch(err => {
    dbError = err;
    console.error('[DB] ✗ Init failed:', err.message);
  });

// Guard middleware: Melindungi semua rute di bawahnya dari crash akibat DB belum siap
app.use(function dbGuard(req, res, next) {
  if (dbReady) return next();
  if (dbError) {
    return res.status(503).json({
      status: false, statusCode: 503,
      message: 'Database tidak tersedia. Cek konfigurasi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN.',
      error: 'DB_UNAVAILABLE'
    });
  }
  // Masih loading — tunggu sampai selesai
  dbInitPromise
    .then(() => next())
    .catch(() => res.status(503).json({
      status: false, statusCode: 503,
      message: 'Database gagal diinisialisasi.',
      error: 'DB_INIT_FAILED'
    }));
});

// ── Static Files ─────────────────────────────────────────────────────────────
app.use('/assets', express.static(path.join(__dirname, 'api-page/assets')));
app.get('/script.js',          (req, res) => res.sendFile(path.join(__dirname, 'script.js')));
app.get('/src/settings.json',  (req, res) => res.sendFile(path.join(__dirname, 'src/settings.json')));

// ── Global creator tag ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  const orig = res.json.bind(res);
  res.json = function(d) {
    if (d && typeof d === 'object' && !d.creator)
      d.creator = process.env.APP_NAME || 'Andri API';
    return orig(d);
  };
  next();
});

// ── Page routes ─────────────────────────────────────────────────────────────
const sendPage = (file) => (req, res) =>
  res.sendFile(path.join(__dirname, 'api-page', file));

app.get('/',        sendPage('index.html'));
app.get('/login',   sendPage('auth.html'));
app.get('/register',sendPage('auth.html'));
app.get('/pricing', sendPage('index.html'));
app.get('/docs',    sendPage('docs.html'));

app.get('/dashboard', (req, res) =>
  resolveUser(req)
    .then(u => u ? res.sendFile(path.join(__dirname, 'api-page/dashboard.html')) : res.redirect('/login'))
    .catch(() => res.redirect('/login'))
);
app.get('/profile', (req, res) =>
  resolveUser(req)
    .then(u => u ? res.sendFile(path.join(__dirname, 'api-page/profile.html')) : res.redirect('/login'))
    .catch(() => res.redirect('/login'))
);
app.get('/admin', (req, res) =>
  resolveUser(req)
    .then(u => (u && u.role === 'admin')
      ? res.sendFile(path.join(__dirname, 'api-page/admin.html'))
      : res.redirect('/login'))
    .catch(() => res.redirect('/login'))
);

// ── Auth / user routes ──────────────────────────────────────────────────────
require('./src/routes/auth')(app);
require('./src/routes/profile')(app);
require('./src/routes/payment')(app);
require('./src/routes/dashboard')(app);
require('./src/routes/admin')(app);

// ── API endpoint files (DIUBAH JADI STATIS UNTUK COMPATIBILITY CLOUD/VERCEL) ──
let loaded = 0;

try {
  require('./src/api/ai/ai-dolphinai.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: ai-dolphinai.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/ai/ai-dolphinai.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/ai/gpt.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: gpt.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/ai/gpt.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/ai/gemini.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: gemini.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/ai/gemini.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/random/random-bluearchive.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: random-bluearchive.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/random/random-bluearchive.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/search/search-youtube.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: search-youtube.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/search/search-youtube.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/search/tts.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: tts.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/search/tts.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/search/prompt.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: prompt.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/search/prompt.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/tiktok.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: tiktok.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/tiktok.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/tools/glen.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: glen.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/tools/glen.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/sticker/brat.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: brat.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/sticker/brat.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/facebook.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: facebook.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/facebook.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/tools/depai.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: depai.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/tools/depai.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/twitter.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: twitter.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/twitter.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/ytmp3.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: ytmp3.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/ytmp3.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/capcut.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: capcut.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/capcut.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/pinterest.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: pinterest.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/pinterest.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/mediafire.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: mediafire.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/mediafire.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/spotify.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: spotify.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/spotify.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/scdl.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: scdl.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/scdl.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/threads.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: threads.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/threads.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/shopeedl.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: shopeedl.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/shopeedl.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/downloader/ig.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: ig.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/downloader/ig.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/tools/welcome.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: welcome.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/tools/welcome.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/tools/tiktokstalk.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: tiktokstalk.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/tools/tiktokstalk.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/tools/igstalk.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: igstalk.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/tools/igstalk.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/tools/bypassunlock.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: bypassunlock.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/tools/bypassunlock.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/tools/fakeovo.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: fakeovo.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/tools/fakeovo.js`);
  console.error(`[API]   Reason: ${e.message}`);
}

try {
  require('./src/api/convert/upscale.js')(app);
  loaded++;
  console.log(`[API] ✓ Loaded: upscale.js`);
} catch (e) {
  console.error(`[API] ✗ FAILED to load ./src/api/convert/upscale.js`);
  console.error(`[API]   Reason: ${e.message}`);
}
console.log(`[API] ${loaded} route files successfully loaded`);

// ── API info ─────────────────────────────────────────────────────────────────
app.get('/api', (req, res) => res.json({
  status: true, statusCode: 200,
  message: 'Selamat datang di Andri API!',
  version: '1.0.0', 
  auth: 'Sertakan ?apikey= atau header x-api-key',
  plans: ['free', 'premium', 'vip', 'vvip']
}));

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      status: false, statusCode: 404,
      message: `Endpoint '${req.method} ${req.path}' tidak ditemukan.`,
      error: 'ENDPOINT_NOT_FOUND'
    });
  }
  const f404 = path.join(__dirname, 'api-page/404.html');
  try {
    require('fs').accessSync(f404);
    return res.status(404).sendFile(f404);
  } catch (_) {}
  res.status(404).json({ status: false, statusCode: 404, message: 'Not found.' });
});

// ── 500 Handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      status: false, statusCode: 500,
      message: 'Internal server error.',
      error: 'SERVER_ERROR'
    });
  }
  const f500 = path.join(__dirname, 'api-page/500.html');
  try {
    require('fs').accessSync(f500);
    return res.status(500).sendFile(f500);
  } catch (_) {}
  res.status(500).json({ status: false, statusCode: 500, message: 'Server error.' });
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  dbInitPromise.then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Andri API → http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  });
  module.exports = app;
}
