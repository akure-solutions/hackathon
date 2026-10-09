// Consent-based field visibility. Default deny: a partner sees a resident only with an
// active consent, and only the fields listed for its role. Every projected read is logged,
// grouped by request so one screen load becomes one access-log entry.
const crypto = require('crypto');
const db = require('./db');
const { nowIso } = require('./time');

// One allow-list per consent partner. Field names match the decrypted record from records.js.
const VISIBILITY = Object.freeze({
  luma: [
    'id', 'name', 'phone', 'address', 'barrio', 'gps', 'lumaMeter',
    'lifeSupport', 'survivalWindowHours', 'tier', 'backupPower', 'subsidyStatus',
    'status', 'lastCheckinAt',
  ],
  municipio: [
    'id', 'name', 'phone', 'address', 'barrio', 'gps',
    'lifeSupport', 'equipmentCategory', 'survivalWindowHours', 'tier', 'backupPower',
    'mobilityLimited', 'livesAlone', 'caregiverContact', 'status', 'lastCheckinAt',
  ],
  caregiver: [
    'id', 'name', 'phone', 'address', 'barrio', 'gps',
    'lifeSupport', 'equipmentCategory', 'survivalWindowHours', 'tier', 'backupPower',
    'subsidyStatus', 'mobilityLimited', 'livesAlone', 'status', 'lastCheckinAt',
  ],
});

// Every field any partner could see, for the "Lo que puedes ver" strip.
const ALL_SHAREABLE = Object.freeze([...new Set(Object.values(VISIBILITY).flat())]);

const insertAccess = db.prepare(`
  INSERT INTO access_log (request_id, context, viewer_role, viewer_label, viewer_municipio_id,
                          resident_id, fields_disclosed, at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function newRequestId() {
  return crypto.randomUUID();
}

// Returns a new object with only the allowed fields, or null when the partner has no
// active consent. `consents` is the array of active partner names, e.g. ['service', 'luma'].
function projectFor(partner, record, consents) {
  const allowed = VISIBILITY[partner];
  if (!allowed || !consents.includes(partner)) return null;

  const projected = {};
  for (const field of allowed) {
    if (record[field] !== undefined) projected[field] = record[field];
  }
  return projected;
}

// Projects and writes one access_log row per disclosed resident.
// viewer = req.viewer; log = { requestId, context }
// Field names actually disclosed (non-null values).
function disclosedFields(projected) {
  return Object.keys(projected).filter((f) => projected[f] !== null);
}

// Writes one access_log row. viewer = req.viewer; log = { requestId, context }
function logDisclosure(viewer, residentId, fields, log) {
  insertAccess.run(
    log.requestId, log.context, viewer.role, viewer.label, viewer.municipioId ?? null,
    residentId, JSON.stringify(fields), nowIso()
  );
}

// Projects one record and always logs it (used for case detail).
function projectAndLog(partner, viewer, record, consents, log) {
  const projected = projectFor(partner, record, consents);
  if (!projected) return null;
  logDisclosure(viewer, record.id, disclosedFields(projected), log);
  return projected;
}

module.exports = { VISIBILITY, ALL_SHAREABLE, projectFor, projectAndLog, logDisclosure, disclosedFields, newRequestId };