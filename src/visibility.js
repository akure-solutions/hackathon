// Consent-based field visibility. Default deny: a partner sees a resident only with an
// active consent, and only the fields listed for its role. Every projected read is logged.
const db = require('./db');
const { nowIso } = require('./time');

// One allow-list per role. Field names match the decrypted record from records.js.
const VISIBILITY = Object.freeze({
  luma: [
    'id', 'name', 'phone', 'address', 'gps', 'lumaMeter',
    'lifeSupport', 'survivalWindowHours', 'tier', 'backupPower', 'subsidyStatus',
    'status', 'lastCheckinAt',
  ],
  municipio: [
    'id', 'name', 'phone', 'address', 'gps',
    'lifeSupport', 'equipmentCategory', 'survivalWindowHours', 'tier', 'backupPower',
    'mobilityLimited', 'livesAlone', 'status', 'lastCheckinAt',
  ],
  caregiver: [
    'id', 'name', 'phone', 'address', 'gps',
    'lifeSupport', 'equipmentCategory', 'survivalWindowHours', 'tier', 'backupPower',
    'subsidyStatus', 'mobilityLimited', 'livesAlone', 'status', 'lastCheckinAt',
  ],
});

const insertAccess = db.prepare(`
  INSERT INTO access_log (viewer_role, viewer_municipio_id, resident_id, fields_disclosed, at)
  VALUES (?, ?, ?, ?, ?)
`);

// Returns a new object with only the allowed fields, or null when the partner has no
// active consent. `consents` is the array of active partner names, e.g. ['service', 'luma'].
function projectFor(role, record, consents) {
  const allowed = VISIBILITY[role];
  if (!allowed || !consents.includes(role)) return null;

  const projected = {};
  for (const field of allowed) {
    if (record[field] !== undefined) projected[field] = record[field];
  }
  return projected;
}

// Projects a record for a viewer and writes one access_log row listing what was disclosed.
// viewer = { role, municipioId }
function projectAndLog(viewer, record, consents) {
  const projected = projectFor(viewer.role, record, consents);
  if (!projected) return null;

  const disclosed = Object.keys(projected).filter((f) => projected[f] !== null);
  insertAccess.run(viewer.role, viewer.municipioId ?? null, record.id, JSON.stringify(disclosed), nowIso());
  return projected;
}

module.exports = { VISIBILITY, projectFor, projectAndLog };