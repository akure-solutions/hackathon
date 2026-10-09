// Energía Vital PR: HTTP server entry point.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const { nowIso } = require('./src/time');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, time: nowIso(), demoMode: config.demoMode });
});

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