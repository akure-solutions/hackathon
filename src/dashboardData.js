// Dashboard data service: scope by viewer, derive case fields, KPIs, permission strip,
// and access-log de-duplication for auto-refresh. Routes stay thin by calling this.
const db = require('./db');
const records = require('./records');
const engine = require('./engine');
const { VISIBILITY } = require('./visibility');
const { HOUR } = require('./rules');

// Spanish labels for field names (permission strip, access log).
const FIELD_LABELS = Object.freeze({
  name: 'Nombre', phone: 'Teléfono', address: 'Dirección', barrio: 'Barrio', gps: 'Ubicación',
  lumaMeter: 'Contador', equipmentCategory: 'Tipo de equipo', mobilityLimited: 'Movilidad',
  livesAlone: 'Vive solo', caregiverContact: 'Contacto de emergencia', backupPower: 'Respaldo',
  subsidyStatus: 'Subsidio de equipo de vida', survivalWindowHours: 'Ventana de batería',
  tier: 'Nivel', status: 'Estado', lastCheckinAt: 'Último check-in', lifeSupport: 'Dependencia eléctrica',
});

// Fields shown in the "Lo que puedes ver" strip, in display order.
const STRIP_FIELDS = Object.freeze([
  'name', 'phone', 'address', 'barrio', 'equipmentCategory', 'mobilityLimited', 'livesAlone',
  'caregiverContact', 'lumaMeter', 'backupPower', 'subsidyStatus',
]);

const CASE_STATE_KINDS = Object.freeze(['attempted', 'coordinated', 'followup', 'resolved']);
const STATUS_RANK = { help: 0, awaiting: 1, ok: 2, no_outage: 3 };

// Which consent partner governs what each viewer role may see.
function partnerFor(role) {
  return role === 'luma' ? 'luma' : 'municipio'; // analyst counts are based on municipio consent
}

const selectOutage = db.prepare('SELECT id, source, started_at FROM outages WHERE id = ?');
const selectActiveReport = db.prepare(`
  SELECT 1 FROM outages
  WHERE scope_type = 'resident' AND resident_id = ? AND source = 'resident_report' AND ended_at IS NULL
  LIMIT 1
`);
const selectStep = db.prepare(`
  SELECT at FROM escalation_events WHERE outage_id = ? AND resident_id = ? AND step = ?
`);
const selectCaseState = db.prepare(`
  SELECT kind, at, actor_label FROM case_actions
  WHERE resident_id = ? AND outage_id IS ? AND kind IN ('attempted', 'coordinated', 'followup', 'resolved')
  ORDER BY id DESC LIMIT 1
`);

// Case fields derived from a live record (record already has tier/status/outageId/elapsedMs).
function deriveCase(rec) {
  const inOutage = Boolean(rec.outageId);
  const outage = inOutage ? selectOutage.get(rec.outageId) : null;
  const caregiverStep = inOutage ? selectStep.get(rec.outageId, rec.id, 'alert_caregivers') : null;
  const oncallStep = inOutage ? selectStep.get(rec.outageId, rec.id, 'alert_oncall') : null;
  const lastAction = inOutage ? selectCaseState.get(rec.id, rec.outageId) : null;

  let caseState = 'monitor';
  if (lastAction) caseState = lastAction.kind;
  else if (inOutage && rec.status !== 'ok' && (rec.status === 'help' || oncallStep)) caseState = 'pending';

  return {
    inOutage,
    power: !inOutage ? 'none'
      : (outage.source === 'resident_report' || selectActiveReport.get(rec.id)) ? 'confirmed' : 'area',
    outageStartedAt: outage ? outage.started_at : null,
    batteryRemainingHours: inOutage ? rec.survivalWindowHours - rec.elapsedMs / HOUR : null,
    caregiverNotifiedAt: caregiverStep ? caregiverStep.at : null,
    caseState,
    caseUpdatedBy: lastAction ? lastAction.actor_label : null,
  };
}

function sortCases(rows) {
  return rows.slice().sort((a, b) =>
    (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
    ((a.caseState === 'pending' ? 0 : 1) - (b.caseState === 'pending' ? 0 : 1)) ||
    ((a.batteryRemainingHours ?? Infinity) - (b.batteryRemainingHours ?? Infinity))
  );
}

// Residents this viewer is entitled to (consented), plus how many were withheld.
// LUMA scope is island-wide; municipio and analyst scope is their municipio.
function loadScope(viewer) {
  const partner = partnerFor(viewer.role);
  const base = viewer.role === 'luma' ? records.listAll() : records.listByMunicipio(viewer.municipioId);
  const consents = records.activeConsentsMap();
  const live = engine.withStatus(base, consents);
  const allowed = live
    .filter((r) => (consents.get(r.id) || []).includes(partner))
    .map((r) => ({ ...r, ...deriveCase(r) }));

  return { partner, consents, allowed: sortCases(allowed), hiddenCount: live.length - allowed.length };
}

function kpis(allowed) {
  const affected = allowed.filter((r) => r.inOutage);
  const count = (status) => affected.filter((r) => r.status === status).length;
  return {
    registered: allowed.length,
    possiblyAffected: affected.length,
    confirmedOutage: affected.filter((r) => r.power === 'confirmed').length,
    help: count('help'),
    awaiting: count('awaiting'),
    ok: count('ok'),
  };
}

// "Lo que puedes ver": allowed vs blocked field labels for this viewer.
function permissions(viewer) {
  if (viewer.role === 'analyst') {
    return {
      allowed: ['Estadísticas agregadas por barrio'],
      blocked: STRIP_FIELDS.map((f) => FIELD_LABELS[f]),
    };
  }
  const allowList = VISIBILITY[partnerFor(viewer.role)];
  return {
    allowed: STRIP_FIELDS.filter((f) => allowList.includes(f)).map((f) => FIELD_LABELS[f]),
    blocked: STRIP_FIELDS.filter((f) => !allowList.includes(f)).map((f) => FIELD_LABELS[f]),
  };
}

// Auto-refresh polls every 5 s; only log a list view when what the viewer sees changes.
const lastSignatures = new Map();

function changedSince(viewer, context, signature) {
  const key = `${viewer.personaId}:${context}`;
  if (lastSignatures.get(key) === signature) return false;
  lastSignatures.set(key, signature);
  return true;
}

function resetAccessSignatures() {
  lastSignatures.clear();
}

module.exports = {
  FIELD_LABELS, CASE_STATE_KINDS, partnerFor, deriveCase, loadScope, kpis, permissions,
  changedSince, resetAccessSignatures,
};