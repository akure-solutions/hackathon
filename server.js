// Energía Vital PR: HTTP server entry point.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const { nowIso } = require('./src/time');

const residentsRouter = require('./src/routes/residents');
const municipiosRouter = require('./src/routes/municipios');

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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/fontsource', express.static(path.join(__dirname, 'node_modules', '@fontsource')));

app.get('/health', (req, res) => {
  res.json({ ok: true, time: nowIso(), demoMode: config.demoMode });
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
});