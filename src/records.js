// Loads residents and turns encrypted rows into decrypted records for projection.
// This is the only place resident PII is decrypted for dashboards.
const db = require('./db');
const { decrypt } = require('./crypto');

const RESIDENT_COLUMNS = `
  id, first_name, last_name_paternal, last_name_maternal, phone, address, gps, luma_meter,
  notify_channel, municipio_id, zip_code, equipment_category, survival_window_hours,
  backup_power, lives_alone, mobility_limited, subsidy_status, created_at
`;

const selectByMunicipio = db.prepare(`SELECT ${RESIDENT_COLUMNS} FROM residents WHERE municipio_id = ? ORDER BY id`);
const selectAll = db.prepare(`SELECT ${RESIDENT_COLUMNS} FROM residents ORDER BY id`);
const selectOne = db.prepare(`SELECT ${RESIDENT_COLUMNS} FROM residents WHERE id = ?`);

const selectActiveConsents = db.prepare(`
  SELECT resident_id, partner FROM consents WHERE revoked_at IS NULL
`);
const selectActiveConsentsFor = db.prepare(`
  SELECT partner FROM consents WHERE resident_id = ? AND revoked_at IS NULL
`);

function parseGps(value) {
  if (!value) return null;
  const [lat, lng] = value.split(',').map(Number);
  return { lat, lng };
}

// Decrypted record. tier/status/lastCheckinAt are filled by the rules engine (step 6).
function toRecord(row) {
  const fullName = [row.first_name, row.last_name_paternal, row.last_name_maternal]
    .map(decrypt)
    .filter(Boolean)
    .join(' ');

  return {
    id: row.id,
    municipioId: row.municipio_id,
    name: fullName,
    firstName: decrypt(row.first_name),
    phone: decrypt(row.phone),
    address: decrypt(row.address),
    gps: parseGps(decrypt(row.gps)),
    lumaMeter: decrypt(row.luma_meter),
    notifyChannel: row.notify_channel,
    zipCode: row.zip_code,
    lifeSupport: true, // everyone in the registry depends on electric medical equipment
    equipmentCategory: row.equipment_category,
    survivalWindowHours: row.survival_window_hours,
    backupPower: row.backup_power,
    livesAlone: row.lives_alone === 1,
    mobilityLimited: row.mobility_limited === 1,
    subsidyStatus: row.subsidy_status,
    createdAt: row.created_at,
    tier: null,
    status: 'no_outage',
    lastCheckinAt: null,
  };
}

// Map of residentId -> array of active partner names.
function activeConsentsMap() {
  const map = new Map();
  for (const { resident_id: id, partner } of selectActiveConsents.all()) {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(partner);
  }
  return map;
}

function activeConsentsFor(residentId) {
  return selectActiveConsentsFor.all(residentId).map((r) => r.partner);
}

function listByMunicipio(municipioId) {
  return selectByMunicipio.all(municipioId).map(toRecord);
}

function listAll() {
  return selectAll.all().map(toRecord);
}

function getOne(residentId) {
  const row = selectOne.get(residentId);
  return row ? toRecord(row) : null;
}

module.exports = { listByMunicipio, listAll, getOne, activeConsentsMap, activeConsentsFor };