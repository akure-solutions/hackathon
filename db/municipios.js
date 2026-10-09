// All 78 municipios of Puerto Rico. Participation and contacts are synthetic demo data.
const ALL_MUNICIPIOS = [
  'Adjuntas', 'Aguada', 'Aguadilla', 'Aguas Buenas', 'Aibonito', 'Añasco', 'Arecibo', 'Arroyo',
  'Barceloneta', 'Barranquitas', 'Bayamón', 'Cabo Rojo', 'Caguas', 'Camuy', 'Canóvanas', 'Carolina',
  'Cataño', 'Cayey', 'Ceiba', 'Ciales', 'Cidra', 'Coamo', 'Comerío', 'Corozal', 'Culebra', 'Dorado',
  'Fajardo', 'Florida', 'Guánica', 'Guayama', 'Guayanilla', 'Guaynabo', 'Gurabo', 'Hatillo',
  'Hormigueros', 'Humacao', 'Isabela', 'Jayuya', 'Juana Díaz', 'Juncos', 'Lajas', 'Lares',
  'Las Marías', 'Las Piedras', 'Loíza', 'Luquillo', 'Manatí', 'Maricao', 'Maunabo', 'Mayagüez',
  'Moca', 'Morovis', 'Naguabo', 'Naranjito', 'Orocovis', 'Patillas', 'Peñuelas', 'Ponce',
  'Quebradillas', 'Rincón', 'Río Grande', 'Sabana Grande', 'Salinas', 'San Germán', 'San Juan',
  'San Lorenzo', 'San Sebastián', 'Santa Isabel', 'Toa Alta', 'Toa Baja', 'Trujillo Alto', 'Utuado',
  'Vega Alta', 'Vega Baja', 'Vieques', 'Villalba', 'Yabucoa', 'Yauco',
];

// Synthetic on-call contacts. 555 numbers are reserved as fictional.
const PARTICIPATING = {
  Caguas:   { oncallName: 'Guardia OMME Caguas',   oncallPhone: '787-555-0101', backupName: 'Supervisor OMME Caguas',   backupPhone: '787-555-0102' },
  Humacao:  { oncallName: 'Guardia OMME Humacao',  oncallPhone: '787-555-0201', backupName: 'Supervisor OMME Humacao',  backupPhone: '787-555-0202' },
  Carolina: { oncallName: 'Guardia OMME Carolina', oncallPhone: '787-555-0301', backupName: 'Supervisor OMME Carolina', backupPhone: '787-555-0302' },
  'San Sebastián': { oncallName: 'Guardia OMME San Sebastián', oncallPhone: '787-555-0401', backupName: 'Supervisor OMME San Sebastián', backupPhone: '787-555-0402' },
};

module.exports = { ALL_MUNICIPIOS, PARTICIPATING };