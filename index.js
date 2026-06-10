require('dotenv').config();

const express      = require('express');
const chalk        = require('chalk');
const path         = require('path');
const cors         = require('cors');
const cookieParser = require('cookie-parser');

const { initDb }     = require('./src/db/turso');
const { resolveUser } = require('./src/middleware/auth');

const app  = express();
const PORT = process.env.PORT || 4000;

app.enable('trust proxy');
app.set('json spaces', 2);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use('/assets', express.static(path.join(__dirname, 'api-page/assets')));

// ── Global creator tag ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const orig = res.json.bind(res);
  res.json = function(d) {
    if (d && typeof d === 'object' && !d.creator) d.creator = process.env.APP_NAME || 'Andri API';
    return orig(d);
  };
  next();
});

// ── Page routes ───────────────────────────────────────────────────────────────
const sendPage = (file) => (req, res) => res.sendFile(path.join(__dirname, 'api-page', file));

app.get('/',         sendPage('index.html'));
app.get('/login',    sendPage('auth.html'));
app.get('/register', sendPage('auth.html'));
app.get('/pricing',  sendPage('index.html'));
app.get('/docs',     sendPage('docs.html'));

app.get('/dashboard', (req, res) => {
  resolveUser(req)
    .then(u => u ? res.sendFile(path.join(__dirname, 'api-page/dashboard.html')) : res.redirect('/login'))
    .catch(() => res.redirect('/login'));
});
app.get('/profile', (req, res) => {
  resolveUser(req)
    .then(u => u ? res.sendFile(path.join(__dirname, 'api-page/profile.html')) : res.redirect('/login'))
    .catch(() => res.redirect('/login'));
});
app.get('/admin', (req, res) => {
  resolveUser(req)
    .then(u => (u && u.role === 'admin') ? res.sendFile(path.join(__dirname, 'api-page/admin.html')) : res.redirect('/login'))
    .catch(() => res.redirect('/login'));
});

// ── API routes ────────────────────────────────────────────────────────────────
require('./src/routes/auth')(app);
require('./src/routes/profile')(app);
require('./src/routes/payment')(app);
require('./src/routes/dashboard')(app);
require('./src/routes/admin')(app);

// ── API endpoint files ────────────────────────────────────────────────────────
const apiFiles = [
  './src/api/ai/ai-luminai',
  './src/api/random/random-bluearchive',
  './src/api/search/search-youtube',
];
let loaded = 0;
for (const f of apiFiles) {
  try {
    require(f)(app);
    loaded++;
    console.log(`[API] Loaded: ${path.basename(f)}.js`);
  } catch (e) {
    console.error(`[API] Failed to load ${f}: ${e.message}`);
  }
}
console.log(`[API] ${loaded} routes loaded`);

// ── /api info ─────────────────────────────────────────────────────────────────
app.get('/api', (req, res) => res.json({
  status: true, statusCode: 200,
  message: 'Selamat datang di Andri API!',
  version: '1.0.0', docs: '/docs',
  auth: 'Sertakan ?apikey= atau header x-api-key',
  plans: ['free', 'premium', 'vip', 'vvip']
}));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      status: false, statusCode: 404,
      message: `Endpoint '${req.method} ${req.path}' tidak ditemukan.`,
      error: 'ENDPOINT_NOT_FOUND', docs: '/docs'
    });
  }
  const f404 = path.join(__dirname, 'api-page/404.html');
  const fs = require('fs');
  if (fs.existsSync(f404)) return res.status(404).sendFile(f404);
  res.status(404).json({ status: false, statusCode: 404, message: 'Not found.' });
});

// ── 500 ───────────────────────────────────────────────────────────────────────
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
  const fs = require('fs');
  if (fs.existsSync(f500)) return res.status(500).sendFile(f500);
  res.status(500).json({ status: false, statusCode: 500, message: 'Server error.' });
});

// ── DB init + start ───────────────────────────────────────────────────────────
// initDb is called once and cached — safe for both serverless and traditional hosting
let dbReady = false;
let dbInitPromise = null;

function ensureDb() {
  if (dbReady) return Promise.resolve();
  if (!dbInitPromise) {
    dbInitPromise = initDb()
      .then(() => { dbReady = true; console.log('[DB] Ready'); })
      .catch(err => {
        dbInitPromise = null; // allow retry on next request
        console.error('[DB] Init failed:', err.message);
        throw err;
      });
  }
  return dbInitPromise;
}

// ── Vercel: export app directly (no app.listen) ───────────────────────────────
// For Vercel serverless, DB is initialized on first request
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  // Wrap every request to ensure DB is ready first
  const originalHandler = app;
  const wrappedApp = async (req, res) => {
    try {
      await ensureDb();
    } catch (err) {
      console.error('[STARTUP] DB init error:', err.message);
      // Continue anyway — individual routes will fail gracefully
    }
    return originalHandler(req, res);
  };
  module.exports = wrappedApp;
} else {
  // Local dev: start normally
  ensureDb()
    .then(() => {
      app.listen(PORT, () => console.log(`🚀 Andri API running → http://localhost:${PORT}`));
    })
    .catch(err => {
      console.error('[FATAL] Cannot start without DB:', err.message);
      process.exit(1);
    });
  module.exports = app;
}
