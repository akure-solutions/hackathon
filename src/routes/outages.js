// Outage routes: simulate a municipio-wide outage, end it, list active ones.
const express = require('express');
const db = require('../db');
const { demoMode } = require('../config');
const { audit } = require('../audit');
const { nowSimIso } = require('../clock');
const engine = require('../engine');

const router = express.Router();

// Until role cookies exist (step 8), outage simulation is demo-only.
function requireDemo(req, res, next) {
  if (!demoMode) return res.status(403).json({ error: 'Disponible solo en modo demostración.' });
  next();
}

const findMunicipio = db.prepare('SELECT id, name FROM municipios WHERE id = ?');
const findActiveForMunicipio = db.prepare(`
  SELECT id FROM outages WHERE scope_type = 'municipio' AND municipio_id = ? AND ended_at IS NULL
`);
const insertOutage = db.prepare(`
  INSERT INTO outages (scope_type, municipio_id, source, started_at) VALUES ('municipio', ?, 'simulated', ?)
`);
const findOutage = db.prepare('SELECT id, ended_at FROM outages WHERE id = ?');
const endOutage = db.prepare('UPDATE outages SET ended_at = ? WHERE id = ?');
const listActive = db.prepare(`
  SELECT o.id, o.scope_type AS scopeType, o.municipio_id AS municipioId, m.name AS municipioName,
         o.resident_id AS residentId, o.source, o.started_at AS startedAt
  FROM outages o LEFT JOIN municipios m ON m.id = o.municipio_id
  WHERE o.ended_at IS NULL ORDER BY o.started_at
`);

router.get('/active', (req, res) => {
  res.json(listActive.all());
});

router.post('/', requireDemo, (req, res) => {
  const municipio = findMunicipio.get(Number(req.body && req.body.municipioId));
  if (!municipio) return res.status(400).json({ error: 'Selecciona un pueblo válido.', field: 'municipioId' });

  if (findActiveForMunicipio.get(municipio.id)) {
    return res.status(409).json({ error: `Ya hay un apagón activo en ${municipio.name}.` });
  }

  const { lastInsertRowid } = insertOutage.run(municipio.id, nowSimIso());
  const outageId = Number(lastInsertRowid);
  audit('OUTAGE_STARTED', { actorRole: 'demo', details: { outageId, municipioId: municipio.id, source: 'simulated' } });

  engine.tick(); // fire T+0 check-in messages right away
  res.status(201).json({ outageId, municipioId: municipio.id, municipioName: municipio.name });
});

router.post('/:id/end', requireDemo, (req, res) => {
  const outage = findOutage.get(Number(req.params.id));
  if (!outage) return res.status(404).json({ error: 'Apagón no encontrado.' });
  if (outage.ended_at) return res.status(409).json({ error: 'Este apagón ya terminó.' });

  endOutage.run(nowSimIso(), outage.id);
  audit('OUTAGE_ENDED', { actorRole: 'demo', details: { outageId: outage.id } });
  res.json({ outageId: outage.id, ended: true });
});

module.exports = router;