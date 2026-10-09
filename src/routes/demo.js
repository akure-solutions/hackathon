// Demo controls: simulated clock, fast-forward, in-app reset, simulated message feed.
const express = require('express');
const db = require('../db');
const { demoMode } = require('../config');
const { audit } = require('../audit');
const clock = require('../clock');
const { nextEscalation } = require('../rules');
const engine = require('../engine');
const { resetAccessSignatures } = require('../dashboardData');
const notify = require('../notify');
const records = require('../records');
const { setViewer, clearViewer } = require('../auth');
const { resolvePersona, listPersonas } = require('../personas');

const router = express.Router();

function requireDemo(req, res, next) {
  if (!demoMode) return res.status(403).json({ error: 'Disponible solo en modo demostración.' });
  next();
}

const selectActiveMunicipioOutage = db.prepare(`
  SELECT o.id, o.municipio_id AS municipioId, m.name AS municipioName, o.started_at AS startedAt
  FROM outages o JOIN municipios m ON m.id = o.municipio_id
  WHERE o.scope_type = 'municipio' AND o.ended_at IS NULL
    AND (? IS NULL OR o.municipio_id = ?)
  ORDER BY o.started_at LIMIT 1
`);

// Clock banner data. No PII. Optional ?municipioId= to focus on one town.
router.get('/clock', (req, res) => {
  const municipioId = req.query.municipioId ? Number(req.query.municipioId) : null;
  const now = clock.nowMs();
  const outage = selectActiveMunicipioOutage.get(municipioId, municipioId);

  let outageInfo = null;
  if (outage) {
    const elapsedMs = Math.max(0, now - Date.parse(outage.startedAt));
    outageInfo = { ...outage, elapsedMs, next: nextEscalation(elapsedMs) };
  }

  res.json({
    demoMode,
    simNow: new Date(now).toISOString(),
    offsetMs: clock.offsetMs(),
    outage: outageInfo,
  });
});

router.post('/fast-forward', requireDemo, (req, res) => {
  const minutes = Number(req.body && req.body.minutes);
  if (!(minutes >= 1 && minutes <= 1440)) {
    return res.status(400).json({ error: 'Minutos inválidos (1 a 1440).' });
  }
  clock.fastForward(minutes);
  audit('CLOCK_FAST_FORWARDED', { actorRole: 'demo', details: { minutes } });
  engine.tick(); // apply due escalations immediately
  res.json({ simNow: clock.nowSimIso(), offsetMs: clock.offsetMs() });
});

// Resets outage state for a fresh demo run. Keeps residents and the audit trail.
router.post('/reset', requireDemo, (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM outages').run(); // cascades to checkins + escalation_events
    db.prepare('DELETE FROM access_log').run();
  })();
  clock.resetClock();
  engine.resetState();
  resetAccessSignatures();
  audit('DEMO_RESET', { actorRole: 'demo' });
  res.json({ reset: true });
});

router.get('/personas', requireDemo, (req, res) => {
  res.json(listPersonas());
});

router.post('/role', requireDemo, (req, res) => {
  const persona = resolvePersona(req.body && req.body.personaId);
  if (!persona) return res.status(400).json({ error: 'Perfil inválido.' });

  setViewer(req, res, persona.id);
  audit('ROLE_SWITCHED', { actorRole: persona.role, details: { personaId: persona.id } });
  res.json({ personaId: persona.id, role: persona.role, municipioId: persona.municipioId, label: persona.label });
});

router.post('/role/clear', requireDemo, (req, res) => {
  clearViewer(res);
  res.json({ cleared: true });
});

// Simulated resident responses for the active town outage (demo only, clearly labeled).
// Uses the same tables and audits as the real check-in page. The live demo resident is skipped.
const DEMO_RESIDENT_ID = 1; // Doña Carmen: answers live from the phone
const insertScenarioCheckin = db.prepare(`
  INSERT INTO checkins (outage_id, resident_id, response, channel, at) VALUES (?, ?, ?, 'web', ?)
`);
const insertScenarioReport = db.prepare(`
  INSERT INTO outages (scope_type, resident_id, source, started_at) VALUES ('resident', ?, 'resident_report', ?)
`);
const hasActiveReport = db.prepare(`
  SELECT 1 FROM outages WHERE scope_type = 'resident' AND resident_id = ? AND ended_at IS NULL LIMIT 1
`);
const hasCheckin = db.prepare('SELECT 1 FROM checkins WHERE outage_id = ? AND resident_id = ? LIMIT 1');

router.post('/scenario', requireDemo, (req, res) => {
  const municipioId = req.body && req.body.municipioId ? Number(req.body.municipioId) : null;
  const outage = selectActiveMunicipioOutage.get(municipioId, municipioId);
  if (!outage) return res.status(409).json({ error: 'Primero simula un apagón.' });

  const residents = records.listByMunicipio(outage.municipioId)
    .filter((r) => r.id !== DEMO_RESIDENT_ID)
    .sort((a, b) => a.id - b.id);
  const at = clock.nowSimIso();
  const counts = { reported: 0, ok: 0, help: 0 };

  db.transaction(() => {
    residents.forEach((r, i) => {
      // About 1 in 3 confirm "Se fue la luz" in their home.
      if (i % 3 === 2 && !hasActiveReport.get(r.id)) {
        insertScenarioReport.run(r.id, at);
        counts.reported += 1;
        audit('OUTAGE_REPORTED', { actorRole: 'demo', residentId: r.id, details: { simulated: true } });
      }

      // A few ask for help, about 1 in 4 are fine, and the rest stay awaiting.
      if (hasCheckin.get(outage.id, r.id)) return;
      const response = i % 9 === 1 ? 'help' : i % 4 === 0 ? 'ok' : null;
      if (!response) return;
      insertScenarioCheckin.run(outage.id, r.id, response, at);
      counts[response] += 1;
      audit('CHECKIN_RECEIVED', {
        actorRole: 'demo', residentId: r.id,
        details: { response, outageId: outage.id, simulated: true },
      });
    });
  })();

  audit('DEMO_SCENARIO_APPLIED', { actorRole: 'demo', details: { outageId: outage.id, ...counts } });
  engine.tick(); // "Necesito ayuda" escalates right away
  res.json({ outageId: outage.id, ...counts });
});

router.get('/messages', requireDemo, (req, res) => {
  res.json(notify.getRecentMessages());
});

module.exports = router;