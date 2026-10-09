// Dashboard API. Every route enforces role + scope server-side; list views are logged
// (de-duplicated across auto-refresh) and case detail is always logged.
const express = require('express');
const db = require('../db');
const { encrypt } = require('../crypto');
const { audit } = require('../audit');
const { nowSimIso } = require('../clock');
const { requireRole } = require('../auth');
const { projectFor, projectAndLog, logDisclosure, disclosedFields, newRequestId } = require('../visibility');
const data = require('../dashboardData');
const feeds = require('../dashboardFeeds');

const router = express.Router();

const DERIVED = ['caseState', 'caseUpdatedBy', 'power', 'outageStartedAt', 'batteryRemainingHours', 'caregiverNotifiedAt', 'inOutage'];
const ACTION_KINDS = ['call_resident', 'call_caregiver', 'attempted', 'coordinated', 'followup', 'resolved', 'note'];

// Projected fields + derived case fields (derived values come from allowed fields only).
function toRow(partner, rec, consents) {
  const projected = projectFor(partner, rec, consents.get(rec.id) || []);
  if (!projected) return null;
  const row = { ...projected };
  for (const k of DERIVED) row[k] = rec[k];
  return { row, fields: disclosedFields(projected) };
}

// Builds a list view and logs it once per change in what the viewer sees.
function listAndLog(req, scope, context) {
  const built = scope.allowed.map((rec) => toRow(scope.partner, rec, scope.consents)).filter(Boolean);
  const signature = JSON.stringify(built.map((b) => [b.row.id, b.fields]));
  if (built.length && data.changedSince(req.viewer, context, signature)) {
    const log = { requestId: newRequestId(), context };
    for (const b of built) logDisclosure(req.viewer, b.row.id, b.fields, log);
  }
  return built.map((b) => b.row);
}

router.get('/overview', requireRole('municipio', 'analyst', 'luma'), (req, res) => {
  const scope = data.loadScope(req.viewer);
  res.json({
    viewer: { label: req.viewer.label, role: req.viewer.role, org: req.viewer.org, municipioName: req.viewer.municipioName },
    kpis: data.kpis(scope.allowed),
    hiddenCount: scope.hiddenCount,
    permissions: data.permissions(req.viewer),
  });
});

router.get('/cases', requireRole('municipio'), (req, res) => {
  const scope = data.loadScope(req.viewer);
  res.json({ rows: listAndLog(req, scope, 'case_list'), hiddenCount: scope.hiddenCount });
});

router.get('/cases/:id', requireRole('municipio'), (req, res) => {
  const scope = data.loadScope(req.viewer);
  const rec = scope.allowed.find((r) => r.id === Number(req.params.id));
  if (!rec) return res.status(404).json({ error: 'Expediente no disponible: fuera de tu municipio o sin autorización del residente.' });

  const projected = projectAndLog('municipio', req.viewer, rec, scope.consents.get(rec.id) || [], {
    requestId: newRequestId(), context: 'case_detail',
  });
  const detail = { ...projected };
  for (const k of DERIVED) detail[k] = rec[k];
  res.json({ ...detail, consentVerified: true, history: feeds.caseHistory(rec) });
});

const insertAction = db.prepare(`
  INSERT INTO case_actions (outage_id, resident_id, kind, note, actor_label, municipio_id, at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

router.post('/cases/:id/actions', requireRole('municipio'), (req, res) => {
  const kind = req.body && req.body.kind;
  if (!ACTION_KINDS.includes(kind)) return res.status(400).json({ error: 'Acción inválida.' });

  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (kind === 'note' && !note) return res.status(400).json({ error: 'Escribe la nota antes de guardar.' });
  if (note.length > 500) return res.status(400).json({ error: 'La nota no puede pasar de 500 caracteres.' });

  const scope = data.loadScope(req.viewer);
  const rec = scope.allowed.find((r) => r.id === Number(req.params.id));
  if (!rec) return res.status(404).json({ error: 'Expediente no disponible.' });

  insertAction.run(rec.outageId || null, rec.id, kind, note ? encrypt(note) : null,
    req.viewer.label, req.viewer.municipioId, nowSimIso());
  audit('CASE_ACTION', { actorRole: req.viewer.role, residentId: rec.id, details: { kind, outageId: rec.outageId || null } });
  res.status(201).json({ saved: true });
});

router.get('/luma', requireRole('luma'), (req, res) => {
  const scope = data.loadScope(req.viewer);
  res.json({ rows: listAndLog(req, scope, 'luma_list'), hiddenCount: scope.hiddenCount });
});

router.get('/analytics', requireRole('analyst'), (req, res) => {
  res.json(feeds.analytics(data.loadScope(req.viewer)));
});

router.get('/feed', requireRole('municipio', 'analyst'), (req, res) => {
  res.json(feeds.buildFeed(req.viewer, data.loadScope(req.viewer)));
});

router.get('/access-log', requireRole('municipio', 'luma'), (req, res) => {
  res.json(feeds.accessLog(req.viewer, data.loadScope(req.viewer)));
});

module.exports = router;