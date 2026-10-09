// Rules engine runner: evaluates residents in active outages, fires due escalations
// exactly once (UNIQUE outage+resident+step), and enriches records with live status.
const db = require('./db');
const { decrypt } = require('./crypto');
const { audit } = require('./audit');
const { nowMs, nowSimIso } = require('./clock');
const { evaluate } = require('./rules');
const records = require('./records');
const notify = require('./notify');
const { issueToken, checkinUrl } = require('./tokens');

const TICK_MS = 5000;

const selectActiveOutages = db.prepare(`
  SELECT id, scope_type, municipio_id, resident_id, started_at
  FROM outages WHERE ended_at IS NULL ORDER BY started_at
`);
const selectLatestCheckin = db.prepare(`
  SELECT response, at FROM checkins
  WHERE outage_id = ? AND resident_id = ?
  ORDER BY at DESC, id DESC LIMIT 1
`);
const selectLastCheckinEver = db.prepare(`
  SELECT at FROM checkins WHERE resident_id = ? ORDER BY at DESC, id DESC LIMIT 1
`);
const selectMunicipios = db.prepare('SELECT id, name, participating, oncall_name FROM municipios');
const selectFirstCaregiver = db.prepare(`
  SELECT first_name FROM caregivers WHERE resident_id = ? ORDER BY id LIMIT 1
`);
const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO escalation_events (outage_id, resident_id, step, at)
  VALUES (?, ?, ?, ?)
`);

// Last tier seen per outage+resident, to audit TIER_CHANGED only on actual changes.
const lastTiers = new Map();

function municipiosMap() {
  const map = new Map();
  for (const m of selectMunicipios.all()) map.set(m.id, m);
  return map;
}

// Earliest active outage that covers this resident (municipio-wide or their own report).
function outageFor(record, outages) {
  return outages.find((o) =>
    (o.scope_type === 'municipio' && o.municipio_id === record.municipioId) ||
    (o.scope_type === 'resident' && o.resident_id === record.id)
  ) || null;
}

// Adds live outage state to each record: tier, status, lastCheckinAt, outageId, elapsedMs, dueSteps.
function withStatus(recordList, consentsMap = records.activeConsentsMap()) {
  const outages = selectActiveOutages.all();
  const municipios = municipiosMap();
  const now = nowMs();

  return recordList.map((record) => {
    const outage = outageFor(record, outages);
    const municipio = municipios.get(record.municipioId);
    const checkinRow = outage ? selectLatestCheckin.get(outage.id, record.id) : null;
    const lastEver = selectLastCheckinEver.get(record.id);

    const result = evaluate({
      resident: record,
      outage: outage ? { startedAtMs: Date.parse(outage.started_at) } : null,
      checkin: checkinRow ? { response: checkinRow.response, atMs: Date.parse(checkinRow.at) } : null,
      consents: consentsMap.get(record.id) || [],
      municipioParticipating: Boolean(municipio && municipio.participating),
    }, now);

    return {
      ...record,
      tier: result.tier,
      status: result.status,
      lastCheckinAt: lastEver ? lastEver.at : null,
      outageId: outage ? outage.id : null,
      elapsedMs: result.elapsedMs,
      ratio: result.ratio,
      dueSteps: result.dueSteps,
    };
  });
}

function fireStep(step, record, municipio) {
  const simAt = nowSimIso();
  const { changes } = insertEvent.run(record.outageId, record.id, step, simAt);
  if (changes === 0) return; // already fired for this outage

  const caregiverRow = selectFirstCaregiver.get(record.id);
  const ctx = {
    record,
    town: municipio ? municipio.name : 'tu pueblo',
    elapsedMs: record.elapsedMs,
    response: record.status === 'help' ? 'help' : null,
    caregiver: caregiverRow ? { firstName: decrypt(caregiverRow.first_name) } : null,
    oncallName: municipio ? municipio.oncall_name : null,
    link: step === 'notify_resident' ? checkinUrl(issueToken(record.id)) : null,
  };

  notify.deliver(step, ctx);
  audit('ESCALATION_FIRED', {
    residentId: record.id,
    details: { step, outageId: record.outageId },
  });
}

function tick() {
  try {
    const municipios = municipiosMap();
    const live = withStatus(records.listAll()).filter((r) => r.outageId);

    for (const record of live) {
      const key = `${record.outageId}:${record.id}`;
      const previous = lastTiers.get(key);
      if (previous !== record.tier) {
        if (previous) {
          audit('TIER_CHANGED', {
            residentId: record.id,
            details: { from: previous, to: record.tier, outageId: record.outageId },
          });
        }
        lastTiers.set(key, record.tier);
      }

      const municipio = municipios.get(record.municipioId);
      for (const step of record.dueSteps) fireStep(step, record, municipio);
    }
  } catch (err) {
    console.error('[engine] tick failed:', err);
  }
}

let timer = null;

function start() {
  if (timer) return;
  tick();
  timer = setInterval(tick, TICK_MS);
  console.log(`[engine] running every ${TICK_MS / 1000}s`);
}

function resetState() {
  lastTiers.clear();
  notify.clearMessages();
}

module.exports = { start, tick, withStatus, resetState };