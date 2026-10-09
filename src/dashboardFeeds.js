// Feed, case history, grouped access log and analyst aggregates for the dashboard.
// Names appear only where the viewer is entitled (municipio role + OMME consent).
const db = require('./db');
const { decrypt } = require('./crypto');
const { FIELD_LABELS } = require('./dashboardData');

const ACTION_TEXT = Object.freeze({
  attempted: 'marcó «Contacto intentado»',
  coordinated: 'marcó «Asistencia coordinada»',
  followup: 'marcó «Seguimiento requerido»',
  resolved: 'cerró el caso como «Resuelto»',
  call_resident: 'llamó al residente',
  call_caregiver: 'contactó al cuidador',
  note: 'agregó una nota',
});

const RELATIONSHIP_LABELS = Object.freeze({
  child: 'hijo/a', spouse: 'pareja', parent: 'padre/madre', sibling: 'hermano/a', grandchild: 'nieto/a',
  other_family: 'familiar', neighbor: 'vecino/a', friend: 'amigo/a', professional_caregiver: 'cuidador/a',
});

const CHANNEL_LABELS = Object.freeze({ sms: 'mensaje de texto', whatsapp: 'WhatsApp', call: 'llamada' });

function barrioLabel(barrio) {
  if (!barrio) return null;
  return barrio === 'Pueblo' ? 'Pueblo' : `Bo. ${barrio}`;
}

// Resolves a resident id to what this viewer may see as a name.
function nameResolver(viewer, allowedById, barrioById) {
  return (residentId) => {
    if (viewer.role === 'municipio' && allowedById.has(residentId)) return allowedById.get(residentId).name;
    if (viewer.role === 'analyst') {
      const b = barrioLabel(barrioById.get(residentId));
      return b ? `un residente de ${b}` : 'un residente';
    }
    return 'residente sin autorización';
  };
}

// ---------- Alerts and escalation feed ----------

const selectTownResidents = db.prepare('SELECT id, barrio FROM residents WHERE municipio_id = ?');
const selectTownName = db.prepare('SELECT name FROM municipios WHERE id = ?');
const selectOutages = db.prepare(`
  SELECT o.id, o.scope_type, o.resident_id, o.started_at FROM outages o
  LEFT JOIN residents r ON r.id = o.resident_id
  WHERE (o.scope_type = 'municipio' AND o.municipio_id = ?) OR (o.scope_type = 'resident' AND r.municipio_id = ?)
`);
const countNotified = db.prepare(`
  SELECT COUNT(*) AS n FROM escalation_events WHERE outage_id = ? AND step = 'notify_resident'
`);
const selectCheckins = db.prepare(`
  SELECT c.id, c.resident_id, c.response, c.at FROM checkins c
  JOIN residents r ON r.id = c.resident_id WHERE r.municipio_id = ?
`);
const selectEscalations = db.prepare(`
  SELECT e.id, e.resident_id, e.step, e.at FROM escalation_events e
  JOIN residents r ON r.id = e.resident_id
  WHERE r.municipio_id = ? AND e.step <> 'notify_resident'
`);
const selectActions = db.prepare(`
  SELECT id, resident_id, kind, actor_label, at FROM case_actions WHERE municipio_id = ?
`);

function caregiverText(viewer, allowedById, residentId) {
  const rec = allowedById.get(residentId);
  if (viewer.role !== 'municipio' || !rec || !rec.caregiverContact) return 'su contacto';
  const c = rec.caregiverContact;
  return `${c.firstName} (${RELATIONSHIP_LABELS[c.relationship] || c.relationship})`;
}

function buildFeed(viewer, scope, limit = 40) {
  const townId = viewer.municipioId;
  const town = (selectTownName.get(townId) || {}).name || 'el pueblo';
  const allowedById = new Map(scope.allowed.map((r) => [r.id, r]));
  const barrioById = new Map(selectTownResidents.all(townId).map((r) => [r.id, r.barrio]));
  const nameOf = nameResolver(viewer, allowedById, barrioById);
  const items = [];

  for (const o of selectOutages.all(townId, townId)) {
    if (o.scope_type === 'municipio') {
      const n = countNotified.get(o.id).n;
      items.push({ key: `o${o.id}`, at: o.started_at, kind: 'checkin', text: `Apagón en ${town}: check-in enviado a ${n} residentes: «¿Estás bien?»` });
    } else {
      items.push({ key: `o${o.id}`, at: o.started_at, kind: 'outage', text: `Nuevo reporte de apagón: ${nameOf(o.resident_id)} confirmó que se fue la luz.` });
    }
  }

  for (const c of selectCheckins.all(townId)) {
    items.push(c.response === 'help'
      ? { key: `c${c.id}`, at: c.at, kind: 'help', text: `${nameOf(c.resident_id)} seleccionó «Necesito ayuda».` }
      : { key: `c${c.id}`, at: c.at, kind: 'ok', text: `${nameOf(c.resident_id)} respondió al check-in: «Estoy bien».` });
  }

  for (const e of selectEscalations.all(townId)) {
    const name = nameOf(e.resident_id);
    if (e.step === 'alert_caregivers') {
      items.push({ key: `e${e.id}`, at: e.at, kind: 'cg_notified', text: `Contacto notificado: ${caregiverText(viewer, allowedById, e.resident_id)}, por ${name}.` });
    } else if (e.step === 'alert_oncall') {
      items.push({ key: `e${e.id}`, at: e.at, kind: 'escalated', text: `Caso escalado a Respuesta a Emergencias: ${name}.` });
    } else {
      items.push({ key: `e${e.id}`, at: e.at, kind: 'escalated', text: `Recordatorio de contacto individual: ${name}.` });
    }
  }

  for (const a of selectActions.all(townId)) {
    items.push({ key: `a${a.id}`, at: a.at, kind: 'responder', text: `${a.actor_label} ${ACTION_TEXT[a.kind]} · ${nameOf(a.resident_id)}.` });
  }

  return items.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, limit);
}

// ---------- Case history (drawer) ----------

const selectResidentOutages = db.prepare(`
  SELECT o.id, o.scope_type, o.started_at FROM outages o
  JOIN residents r ON (o.scope_type = 'municipio' AND o.municipio_id = r.municipio_id)
                   OR (o.scope_type = 'resident' AND o.resident_id = r.id)
  WHERE r.id = ?
`);
const selectResidentCheckins = db.prepare('SELECT id, response, at FROM checkins WHERE resident_id = ?');
const selectResidentSteps = db.prepare('SELECT id, step, at FROM escalation_events WHERE resident_id = ?');
const selectResidentActions = db.prepare('SELECT id, kind, note, actor_label, at FROM case_actions WHERE resident_id = ?');

function caseHistory(rec) {
  const items = [];
  const cg = rec.caregiverContact;
  const cgText = cg ? `${cg.firstName} (${RELATIONSHIP_LABELS[cg.relationship] || cg.relationship})` : 'su contacto';

  for (const o of selectResidentOutages.all(rec.id)) {
    items.push({ key: `o${o.id}`, at: o.started_at, kind: o.scope_type === 'resident' ? 'outage' : 'checkin',
      text: o.scope_type === 'resident' ? 'Reportó que se fue la luz en su casa.' : 'Apagón en su pueblo (posiblemente afectada).' });
  }
  for (const c of selectResidentCheckins.all(rec.id)) {
    items.push({ key: `c${c.id}`, at: c.at, kind: c.response === 'help' ? 'help' : 'ok',
      text: c.response === 'help' ? 'Seleccionó «Necesito ayuda».' : 'Respondió «Estoy bien».' });
  }
  for (const s of selectResidentSteps.all(rec.id)) {
    const text = {
      notify_resident: `Check-in enviado por ${CHANNEL_LABELS[rec.notifyChannel] || 'mensaje'}: «¿Estás bien?»`,
      alert_caregivers: `Contacto notificado: ${cgText}.`,
      alert_oncall: 'Escalado a Respuesta a Emergencias (guardia 24/7).',
    }[s.step] || 'Recordatorio de contacto individual.';
    items.push({ key: `e${s.id}`, at: s.at, kind: s.step === 'alert_oncall' ? 'escalated' : s.step === 'alert_caregivers' ? 'cg_notified' : 'checkin', text });
  }
  for (const a of selectResidentActions.all(rec.id)) {
    const note = a.note ? decrypt(a.note) : null;
    items.push({ key: `a${a.id}`, at: a.at, kind: 'responder',
      text: `${a.actor_label} ${ACTION_TEXT[a.kind]}${note ? `: «${note}»` : '.'}` });
  }
  return items.sort((x, y) => (x.at < y.at ? 1 : -1));
}

// ---------- Grouped access log ----------

const selectAccessForTown = db.prepare(`
  SELECT a.request_id, a.context, a.viewer_role, a.viewer_label, MIN(a.at) AS at, COUNT(*) AS n,
         json_group_array(a.fields_disclosed) AS fields, MIN(a.resident_id) AS resident_id
  FROM access_log a JOIN residents r ON r.id = a.resident_id
  WHERE r.municipio_id = ?
  GROUP BY a.request_id ORDER BY at DESC LIMIT 30
`);
const selectAccessForRole = db.prepare(`
  SELECT request_id, context, viewer_role, viewer_label, MIN(at) AS at, COUNT(*) AS n,
         json_group_array(fields_disclosed) AS fields, MIN(resident_id) AS resident_id
  FROM access_log WHERE viewer_role = ?
  GROUP BY request_id ORDER BY at DESC LIMIT 30
`);

const BADGES = { luma: 'LUMA', municipio: 'OMME', analyst: 'OMME' };
const HIDDEN_FIELDS = new Set(['id', 'lifeSupport', 'tier', 'status', 'lastCheckinAt']);

function accessLog(viewer, scope) {
  const rows = viewer.role === 'luma' ? selectAccessForRole.all('luma') : selectAccessForTown.all(viewer.municipioId);
  const allowedById = new Map(scope.allowed.map((r) => [r.id, r]));
  const nameOf = nameResolver(viewer, allowedById, new Map());

  return rows.map((row) => {
    const fields = new Set();
    for (const list of JSON.parse(row.fields)) for (const f of JSON.parse(list)) fields.add(f);
    const labels = [...fields].filter((f) => !HIDDEN_FIELDS.has(f) && FIELD_LABELS[f]).map((f) => FIELD_LABELS[f]);

    let action;
    if (row.context === 'case_detail') action = `Abrió el expediente de ${nameOf(row.resident_id)}`;
    else if (row.context === 'luma_list') action = `Vio la lista de hogares con dependencia eléctrica (${row.n})`;
    else action = `Vio la lista de afectados (${row.n} residentes)`;

    return { key: row.request_id, at: row.at, badge: BADGES[row.viewer_role] || row.viewer_role, who: row.viewer_label, action, fields: labels };
  });
}

// ---------- Analyst aggregates (small-cell rule: 1–2 shown as "≤2") ----------

function suppress(n) {
  return n > 0 && n < 3 ? '≤2' : n;
}

function analytics(scope) {
  const byBarrio = new Map();
  for (const r of scope.allowed) {
    const key = r.barrio || 'Sin barrio';
    if (!byBarrio.has(key)) byBarrio.set(key, { barrio: key, label: barrioLabel(r.barrio) || 'Sin barrio', n: 0, inOutage: 0, help: 0, awaiting: 0, ok: 0 });
    const b = byBarrio.get(key);
    b.n += 1;
    if (r.inOutage) {
      b.inOutage += 1;
      if (b[r.status] !== undefined) b[r.status] += 1;
    }
  }
  const rows = [...byBarrio.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return {
    rows: rows.map((b) => ({
      barrio: b.barrio, label: b.label, n: suppress(b.n), inOutage: suppress(b.inOutage),
      help: suppress(b.help), awaiting: suppress(b.awaiting), ok: suppress(b.ok),
      power: b.inOutage > 0 ? 'Apagón en el área' : 'Sin apagón',
    })),
    note: 'Datos agregados y anónimos. Valores de 1 a 2 se muestran como «≤2».',
  };
}

module.exports = { buildFeed, caseHistory, accessLog, analytics, RELATIONSHIP_LABELS };