// Demo controls: simulated clock, fast-forward, in-app reset, simulated message feed.
const express = require('express');
const db = require('../db');
const { demoMode } = require('../config');
const { audit } = require('../audit');
const clock = require('../clock');
const { nextEscalation } = require('../rules');
const engine = require('../engine');
const notify = require('../notify');

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
  audit('DEMO_RESET', { actorRole: 'demo' });
  res.json({ reset: true });
});

router.get('/messages', requireDemo, (req, res) => {
  res.json(notify.getRecentMessages());
});

module.exports = router;