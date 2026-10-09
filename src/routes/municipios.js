// GET /api/municipios: dropdown data for sign-up. Never exposes on-call contacts.
const express = require('express');
const db = require('../db');

const router = express.Router();

const listMunicipios = db.prepare(`
  SELECT id, name, participating, omme_office AS ommeOffice
  FROM municipios
  ORDER BY name COLLATE NOCASE
`);

router.get('/', (req, res) => {
  const rows = listMunicipios.all().map((m) => ({ ...m, participating: m.participating === 1 }));
  res.json(rows);
});

module.exports = router;