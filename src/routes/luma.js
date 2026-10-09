// GET /api/luma/regions?municipioId= : cached LUMA regional indicator (public data, no PII).
const express = require('express');
const db = require('../db');
const lumaFeed = require('../lumaFeed');

const router = express.Router();
const findName = db.prepare('SELECT name FROM municipios WHERE id = ?');

router.get('/regions', (req, res) => {
  const row = req.query.municipioId ? findName.get(Number(req.query.municipioId)) : null;
  res.json({ source: 'LUMA · fuente pública no oficial', ...lumaFeed.summaryFor(row ? row.name : null) });
});

module.exports = router;