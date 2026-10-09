// Personal check-in links. Only the SHA-256 hash of each token is stored.
const crypto = require('crypto');
const db = require('./db');
const { nowIso } = require('./time');
const { publicBaseUrl } = require('./config');

const insertToken = db.prepare(`
  INSERT INTO checkin_tokens (token_hash, resident_id, created_at)
  VALUES (?, ?, ?)
`);

const findToken = db.prepare(`
  SELECT resident_id FROM checkin_tokens
  WHERE token_hash = ? AND revoked_at IS NULL
`);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Creates a new token for a resident and returns the raw token (shown once, never stored).
function issueToken(residentId) {
  const token = crypto.randomBytes(32).toString('base64url');
  insertToken.run(hashToken(token), residentId, nowIso());
  return token;
}

// Returns the resident_id for a valid token, or null.
function resolveToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = findToken.get(hashToken(token));
  return row ? row.resident_id : null;
}

function checkinUrl(token) {
  return `${publicBaseUrl}/c/${token}`;
}

module.exports = { issueToken, resolveToken, checkinUrl };