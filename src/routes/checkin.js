// Resident check-in via personal link: page, status, response, and "Se fue la luz" report.
// The token is the only credential; responses expose first name and town only.
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { audit } = require('../audit');
const { nowSimIso } = require('../clock');
const { resolveToken } = require('../tokens');
const records = require('../records');
const engine = require('../engine');

const router = express.Router();

const checkinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

const findMunicipioName = db.prepare('SELECT name FROM municipios WHERE id = ?');
const findOutageSource = db.prepare('SELECT source FROM outages WHERE id = ?');
const insertCheckin = db.prepare(`
  INSERT INTO checkins (outage_id, resident_id, response, channel, at) VALUES (?, ?, ?, 'web', ?)
`);
const insertResidentOutage = db.prepare(`
  INSERT INTO outages (scope_type, resident_id, source, started_at) VALUES ('resident', ?, 'resident_report', ?)
`);
// The resident just told us about the outage, so the T+0 check-in message is already satisfied.
const markNotified = db.prepare(`
  INSERT OR IGNORE INTO escalation_events (outage_id, resident_id, step, at) VALUES (?, ?, 'notify_resident', ?)
`);

const INVALID_LINK = { error: 'Este enlace no es válido. Revisa el mensaje más reciente de Energía Vital.' };

// Resolves the token to a live record (with outage status) or sends 404.
function loadLiveRecord(req, res) {
  const residentId = resolveToken(req.params.token);
  const record = residentId ? records.getOne(residentId) : null;
  if (!record) {
    res.status(404).json(INVALID_LINK);
    return null;
  }
  return engine.withStatus([record])[0];
}

function publicState(record) {
  const town = findMunicipioName.get(record.municipioId);
  const outage = record.outageId ? findOutageSource.get(record.outageId) : null;
  return {
    firstName: record.firstName,
    town: town ? town.name : null,
    outageActive: Boolean(record.outageId),
    outageSource: outage ? outage.source : null,
    status: record.status,
  };
}

// Page: always serve the same HTML; the page validates the token through the API.
router.get('/c/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'checkin.html'));
});

router.get('/api/checkin/:token', checkinLimiter, (req, res) => {
  const record = loadLiveRecord(req, res);
  if (record) res.json(publicState(record));
});

router.post('/api/checkin/:token', checkinLimiter, (req, res) => {
  const response = req.body && req.body.response;
  if (!['ok', 'help'].includes(response)) {
    return res.status(400).json({ error: 'Respuesta inválida.' });
  }

  const record = loadLiveRecord(req, res);
  if (!record) return;
  if (!record.outageId) {
    return res.status(409).json({ error: 'No hay un apagón activo en este momento.' });
  }

  insertCheckin.run(record.outageId, record.id, response, nowSimIso());
  audit('CHECKIN_RECEIVED', {
    actorRole: 'resident',
    residentId: record.id,
    details: { response, outageId: record.outageId },
  });

  engine.tick(); // "Necesito ayuda" escalates immediately
  res.json(publicState(engine.withStatus([records.getOne(record.id)])[0]));
});

router.post('/api/report-outage/:token', checkinLimiter, (req, res) => {
  const record = loadLiveRecord(req, res);
  if (!record) return;

  if (record.outageId) {
    return res.json({ ...publicState(record), alreadyActive: true });
  }

  const startedAt = nowSimIso();
  const { lastInsertRowid } = insertResidentOutage.run(record.id, startedAt);
  const outageId = Number(lastInsertRowid);
  markNotified.run(outageId, record.id, startedAt);
  audit('OUTAGE_REPORTED', {
    actorRole: 'resident',
    residentId: record.id,
    details: { outageId, source: 'resident_report' },
  });

  engine.tick();
  res.status(201).json(publicState(engine.withStatus([records.getOne(record.id)])[0]));
});

module.exports = router;