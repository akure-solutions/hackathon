// Clears all demo data and reseeds. Works while the server is running (no file deletion).
const db = require('../src/db');
const { seedAll } = require('./seed');

const TABLES_IN_DELETE_ORDER = [
  'access_log', 'audit_log', 'case_actions', 'escalation_events', 'checkins', 'checkin_tokens',
  'outages', 'consents', 'caregivers', 'residents', 'app_state',
];

db.transaction(() => {
  for (const table of TABLES_IN_DELETE_ORDER) db.prepare(`DELETE FROM ${table}`).run();
  db.prepare("INSERT INTO app_state (key, value) VALUES ('clock_offset_ms', '0')").run();
})();

seedAll();
console.log('Demo reset complete.');