// Demo personas for the "Ver demo como" menu. Each maps to a server-enforced role + scope.
// Municipio ids are resolved by name at runtime so they survive database rebuilds.
const db = require('./db');

const PERSONAS = Object.freeze({
  omme_ss: {
    role: 'municipio', municipioName: 'San Sebastián',
    name: 'R. Quiñones', initials: 'RQ', roleLabel: 'Respondedor', org: 'OMME San Sebastián',
    can: 'Ve expedientes autorizados, contacta y actualiza casos.', avatar: 'teal',
  },
  omme_caguas: {
    role: 'municipio', municipioName: 'Caguas',
    name: 'M. Feliciano', initials: 'MF', roleLabel: 'Respondedor', org: 'OMME Caguas',
    can: 'Ve solo residentes de Caguas que autorizaron compartir con su OMME.', avatar: 'signal',
  },
  analyst_ss: {
    role: 'analyst', municipioName: 'San Sebastián',
    name: 'J. Ortiz', initials: 'JO', roleLabel: 'Analista', org: 'OMME San Sebastián',
    can: 'Ve estadísticas agregadas y anónimas. Sin nombres ni contactos.', avatar: 'slate',
  },
  luma_ops: {
    role: 'luma', municipioName: null,
    name: 'Operador 0417', initials: 'LU', roleLabel: 'Operaciones', org: 'LUMA',
    can: 'Ve hogares que autorizaron compartir con LUMA: contador y respaldo, sin tipo de equipo.', avatar: 'navy',
  },
});

const findMunicipioId = db.prepare('SELECT id FROM municipios WHERE name = ? AND participating = 1');

// Returns the persona with its resolved municipioId and display label, or null.
function resolvePersona(personaId) {
  const p = Object.prototype.hasOwnProperty.call(PERSONAS, personaId) ? PERSONAS[personaId] : null;
  if (!p) return null;

  let municipioId = null;
  if (p.municipioName) {
    const row = findMunicipioId.get(p.municipioName);
    if (!row) return null; // municipio missing or not participating
    municipioId = row.id;
  }
  return { id: personaId, ...p, municipioId, label: `${p.name} · ${p.org}` };
}

// Public list for the role menu (no internal fields).
function listPersonas() {
  return Object.keys(PERSONAS).map((id) => {
    const p = resolvePersona(id);
    return p && {
      id: p.id, name: p.name, initials: p.initials, roleLabel: p.roleLabel,
      org: p.org, can: p.can, avatar: p.avatar, role: p.role,
    };
  }).filter(Boolean);
}

module.exports = { resolvePersona, listPersonas };