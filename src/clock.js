// Simulated clock for outages, check-ins, and escalations.
// now = real time + offset. The offset lives in app_state so every process sees the same value.
const db = require('./db');

const selectOffset = db.prepare("SELECT value FROM app_state WHERE key = 'clock_offset_ms'");
const upsertOffset = db.prepare(`
  INSERT INTO app_state (key, value) VALUES ('clock_offset_ms', ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

function offsetMs() {
  const row = selectOffset.get();
  return row ? Number(row.value) : 0;
}

function nowMs() {
  return Date.now() + offsetMs();
}

function nowSimIso() {
  return new Date(nowMs()).toISOString();
}

function fastForward(minutes) {
  const next = offsetMs() + Math.round(minutes * 60 * 1000);
  upsertOffset.run(String(next));
  return next;
}

function resetClock() {
  upsertOffset.run('0');
}

module.exports = { nowMs, nowSimIso, offsetMs, fastForward, resetClock };