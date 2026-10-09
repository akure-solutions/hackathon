// Audit log helper. Every significant operation calls audit() with an UPPERCASE event type.
// Details must never contain PII (names, phones, addresses).
const db = require('./db');
const { nowIso } = require('./time');

const insertAudit = db.prepare(`
  INSERT INTO audit_log (event_type, actor_role, resident_id, details, at)
  VALUES (?, ?, ?, ?, ?)
`);

function audit(eventType, { actorRole = 'system', residentId = null, details = null } = {}) {
  if (!/^[A-Z_]+$/.test(eventType)) {
    throw new Error(`Invalid audit event type: ${eventType}`);
  }
  insertAudit.run(
    eventType,
    actorRole,
    residentId,
    details ? JSON.stringify(details) : null,
    nowIso()
  );
}

module.exports = { audit };