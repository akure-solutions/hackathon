// Energía Vital PR: HTTP server entry point.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const { nowIso } = require('./src/time');

const residentsRouter = require('./src/routes/residents');
const municipiosRouter = require('./src/routes/municipios');

const outagesRouter = require('./src/routes/outages');
const demoRouter = require('./src/routes/demo');
const checkinRouter = require('./src/routes/checkin');
const dashboardRouter = require('./src/routes/dashboard');
const engine = require('./src/engine');
const { readViewer } = require('./src/auth');

const allowedOrigins = new Set([
  `http://localhost:${config.port}`,
  new URL(config.publicBaseUrl).origin,
]);

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use(readViewer);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/fontsource', express.static(path.join(__dirname, 'node_modules', '@fontsource')));

app.get('/health', (req, res) => {
  res.json({ ok: true, time: nowIso(), demoMode: config.demoMode });
});

app.get('/api/session', (req, res) => {
  const v = req.viewer;
  res.json(v ? {
    personaId: v.personaId, role: v.role, municipioId: v.municipioId, municipioName: v.municipioName,
    name: v.name, initials: v.initials, roleLabel: v.roleLabel, org: v.org, can: v.can, avatar: v.avatar, label: v.label,
  } : null);
});

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origen no permitido.' });
  }
  next();
});

app.use('/api/municipios', municipiosRouter);
app.use('/api/residents', residentsRouter);
app.use('/api/outages', outagesRouter);
app.use('/api/demo', demoRouter);
app.use('/api/dashboard', dashboardRouter);
app.use(checkinRouter);

// Unknown API routes return JSON, not HTML.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'No encontrado.' });
});

// Central error handler: log details server-side, return a generic Spanish message.
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Ocurrió un error. Intenta de nuevo.' });
});

app.listen(config.port, () => {
  console.log(`Energía Vital running on http://localhost:${config.port}`);
  engine.start();
});