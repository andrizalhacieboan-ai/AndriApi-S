require('dotenv').config();

const express     = require('express');
const chalk       = require('chalk');
const fs          = require('fs');
const cors        = require('cors');
const path        = require('path');
const cookieParser= require('cookie-parser');

const { initDb } = require('./src/db/turso');
const { resolveUser, requireAuth, requireAdminPage } = require('./src/middleware/auth');

const app  = express();
const PORT = process.env.PORT || 4000;

app.enable('trust proxy');
app.set('json spaces', 2);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use('/assets', express.static(path.join(__dirname, 'api-page/assets')));

// Global creator tag
app.use((req, res, next) => {
  const orig = res.json.bind(res);
  res.json = function(d) {
    if (d && typeof d === 'object' && !d.creator) d.creator = process.env.APP_NAME || 'Andri API';
    return orig(d);
  };
  next();
});

// ── Page routes ──────────────────────────────────────────────────────────────
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'api-page/index.html')));
app.get('/login',     (req, res) => res.sendFile(path.join(__dirname, 'api-page/auth.html')));
app.get('/register',  (req, res) => res.sendFile(path.join(__dirname, 'api-page/auth.html')));
app.get('/pricing',   (req, res) => res.sendFile(path.join(__dirname, 'api-page/index.html') ));
app.get('/docs',      (req, res) => res.sendFile(path.join(__dirname, 'api-page/docs.html')));

app.get('/dashboard', (req, res, next) => {
  resolveUser(req).then(u => {
    if (!u) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'api-page/dashboard.html'));
  }).catch(() => res.redirect('/login'));
});

app.get('/profile', (req, res) => {
  resolveUser(req).then(u => {
    if (!u) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'api-page/profile.html'));
  }).catch(() => res.redirect('/login'));
});

app.get('/admin', (req, res) => {
  resolveUser(req).then(u => {
    if (!u || u.role !== 'admin') return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'api-page/admin.html'));
  }).catch(() => res.redirect('/login'));
});

// ── API routes ────────────────────────────────────────────────────────────────
require('./src/routes/auth')(app);
require('./src/routes/profile')(app);
require('./src/routes/payment')(app);
require('./src/routes/dashboard')(app);
require('./src/routes/admin')(app);

// Auto-load API endpoint files
let totalRoutes = 0;
const apiFolder = path.join(__dirname, './src/api');
fs.readdirSync(apiFolder).forEach(sub => {
  const subPath = path.join(apiFolder, sub);
  if (fs.statSync(subPath).isDirectory()) {
    fs.readdirSync(subPath).forEach(file => {
      if (path.extname(file) === '.js') {
        require(path.join(subPath, file))(app);
        totalRoutes++;
        console.log(chalk.bgHex('#FFFF99').hex('#333').bold(` Loaded: ${file} `));
      }
    });
  }
});
console.log(chalk.bgHex('#90EE90').hex('#333').bold(` ✓ ${totalRoutes} API routes loaded `));

// GET /api — info
app.get('/api', (req, res) => {
  res.status(200).json({
    status:true, statusCode:200,
    message:'Selamat datang di Andri API!',
    version:'1.0.0', docs:'/docs',
    auth:'Sertakan ?apikey=? atau header x-api-key',
    plans:['free','premium','vip','vvip']
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      status:false, statusCode:404,
      message:`Endpoint '${req.method} ${req.path}' tidak ditemukan.`,
      error:'ENDPOINT_NOT_FOUND', docs:'/docs'
    });
  }
  res.status(404).sendFile(path.join(__dirname, 'api-page/404.html'));
});

// ── 500 ───────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(chalk.red('[ERROR]'), err.stack);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      status:false, statusCode:500,
      message:'Internal server error.',
      error:'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  res.status(500).sendFile(path.join(__dirname, 'api-page/500.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(chalk.bgHex('#90EE90').hex('#333').bold(` 🚀 Andri API running → http://localhost:${PORT} `));
  });
}).catch(err => {
  console.error(chalk.red('[ERR] DB init:'), err.message);
  process.exit(1);
});

module.exports = app;
