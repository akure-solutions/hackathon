// Viewer session: a signed JWT in an httpOnly cookie holding only { personaId }.
// Role and municipio scope are re-derived server-side from personas.js on every request.
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('./config');
const { resolvePersona } = require('./personas');

const COOKIE_NAME = 'ev_session';
const SESSION_HOURS = 8;
const ROLES = ['municipio', 'analyst', 'luma'];

function setViewer(req, res, personaId) {
  const token = jwt.sign({ personaId }, jwtSecret, { expiresIn: `${SESSION_HOURS}h` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure, // true through the HTTPS tunnel, false on http://localhost
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
    path: '/',
  });
}

function clearViewer(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Middleware: attaches req.viewer = { personaId, role, municipioId, label, ... } or null. Never throws.
function readViewer(req, res, next) {
  req.viewer = null;
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    try {
      const { personaId } = jwt.verify(token, jwtSecret);
      const persona = resolvePersona(personaId);
      if (persona && ROLES.includes(persona.role)) {
        req.viewer = { ...persona, personaId: persona.id };
      }
    } catch (err) {
      // expired or tampered: treat as anonymous
    }
  }
  next();
}

// Middleware factory: only the listed roles may continue.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.viewer) return res.status(401).json({ error: 'Selecciona un perfil para continuar.' });
    if (!roles.includes(req.viewer.role)) return res.status(403).json({ error: 'No tienes acceso a esta vista.' });
    next();
  };
}

module.exports = { ROLES, setViewer, clearViewer, readViewer, requireRole };