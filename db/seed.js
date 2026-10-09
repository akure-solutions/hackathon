// Seeds reference data. Safe to run repeatedly (upserts by name).
const db = require('../src/db');
const { encrypt } = require('../src/crypto');
const { nowIso } = require('../src/time');
const { ALL_MUNICIPIOS, PARTICIPATING } = require('./municipios');

const { issueToken, checkinUrl } = require('../src/tokens');

// Synthetic demo cast. Every name, phone, address and meter number is fictitious.
// gps: small offsets near each town center, not real homes. Phones use reserved 555 numbers.
const SEED_RESIDENTS = [
  { town: 'San Sebastián', zip: '00685', first: 'Carmen', lastP: 'Ríos', lastM: 'Vega', phone: '7875550141', channel: 'whatsapp', address: 'Calle Ficticia 12', barrio: 'Guatemala', gps: [18.3442, -67.0121], equipment: 'breathing', hours: 6, backup: 'none', alone: 1, mobility: 1, cg: ['Ana', 'Ríos Soto', '7875550241', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'], demoLink: true },
  { town: 'San Sebastián', zip: '00685', first: 'José', lastP: 'Méndez', lastM: 'Cruz', phone: '7875550142', channel: 'sms', address: 'Calle Ficticia 27', barrio: 'Hoyamala', gps: [18.3521, -66.9702], equipment: 'dialysis', hours: 4, backup: 'none', alone: 0, mobility: 1, cg: ['Luz', 'Méndez Ortiz', '7875550242', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Ana', lastP: 'Lugo', lastM: 'Pérez', phone: '7875550143', channel: 'whatsapp', address: 'Calle Ficticia 14', barrio: 'Pueblo', gps: [18.3369, -66.9903], equipment: 'breathing', hours: 3, backup: 'none', alone: 1, mobility: 0, cg: ['Raúl', 'Lugo Díaz', '7875550243', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Luis', lastP: 'Acevedo', lastM: 'Pérez', phone: '7875550144', channel: 'sms', address: 'Camino Ficticio 18', barrio: 'Alto Sano', gps: [18.3201, -66.9655], equipment: 'feeding', hours: 8, backup: 'none', alone: 0, mobility: 1, cg: ['Marta', 'Acevedo Ruiz', '7875550244', 'sibling'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Rosa', lastP: 'Vélez', lastM: 'Ortiz', phone: '7875550145', channel: 'whatsapp', address: 'Sector Ficticio El Cerro', barrio: 'Culebrinas', gps: [18.3215, -67.0189], equipment: 'refrigeration', hours: 12, backup: 'none', alone: 1, mobility: 0, cg: ['Iván', 'Vélez Rosa', '7875550245', 'child'], consents: ['service', 'caregiver', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Pedro', lastP: 'Nieves', lastM: 'Torres', phone: '7875550146', channel: 'sms', address: 'Camino Ficticio 21', barrio: 'Piletas', gps: [18.3388, -67.0062], equipment: 'mobility', hours: 10, backup: 'generator', alone: 0, mobility: 1, cg: ['Sonia', 'Nieves Cruz', '7875550246', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Carmen', lastP: 'Hernández', lastM: 'Ruiz', phone: '7875550147', channel: 'whatsapp', address: 'Calle Ficticia Los Pinos 8', barrio: 'Pozas', gps: [18.3366, -66.9741], equipment: 'breathing', hours: 5, backup: 'solar_battery', alone: 0, mobility: 0, cg: ['Lucía', 'Hernández Vega', '7875550247', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Miguel', lastP: 'Badillo', lastM: 'Rosa', phone: '7875550148', channel: 'sms', address: 'Calle Ficticia 41', barrio: 'Robles', gps: [18.3452, -66.9588], equipment: 'dialysis', hours: 2, backup: 'none', alone: 1, mobility: 1, cg: ['Elena', 'Badillo Font', '7875550248', 'sibling'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Elba', lastP: 'Cardona', lastM: 'Mercado', phone: '7875550149', channel: 'whatsapp', address: 'Camino Ficticio 64', barrio: 'Calabazas', gps: [18.3118, -66.9958], equipment: 'refrigeration', hours: 24, backup: 'generator', alone: 0, mobility: 0, cg: ['Pablo', 'Cardona Lugo', '7875550249', 'child'], consents: ['service', 'caregiver', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Rafael', lastP: 'Torres', lastM: 'Feliciano', phone: '7875550150', channel: 'sms', address: 'Sector Ficticio La Loma', barrio: 'Juncal', gps: [18.3601, -66.9921], equipment: 'breathing', hours: 6, backup: 'none', alone: 0, mobility: 0, cg: ['Nilda', 'Torres Santiago', '7875550250', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Wanda', lastP: 'Cruz', lastM: 'Méndez', phone: '7875550151', channel: 'whatsapp', address: 'Calle Ficticia 3', barrio: 'Guatemala', gps: [18.3451, -67.0098], equipment: 'breathing', hours: 6, backup: 'none', alone: 0, mobility: 0, cg: ['Rubén', 'Cruz Soto', '7875550251', 'child'], consents: ['service', 'caregiver', 'luma'] },
  { town: 'San Sebastián', zip: '00685', first: 'Pedro', lastP: 'Lugo', lastM: 'Arce', phone: '7875550152', channel: 'sms', address: 'Calle Ficticia 9', barrio: 'Hoyamala', gps: [18.3533, -66.9718], equipment: 'dialysis', hours: 4, backup: 'generator', alone: 0, mobility: 0, cg: ['Irma', 'Lugo Vélez', '7875550252', 'spouse'], consents: ['service', 'caregiver'] },
    // --- More San Sebastián residents so the barrio map and aggregates have real volume ---
  { town: 'San Sebastián', zip: '00685', first: 'Nereida', lastP: 'Santiago', lastM: 'Acevedo', phone: '7875550163', channel: 'whatsapp', address: 'Calle Ficticia 31', barrio: 'Guatemala', gps: [18.3436, -67.0135], equipment: 'breathing', hours: 8, backup: 'none', alone: 1, mobility: 1, cg: ['Ángel', 'Santiago Ruiz', '7875550101', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Ernesto', lastP: 'Rivera', lastM: 'Badillo', phone: '7875550164', channel: 'sms', address: 'Camino Ficticio 5', barrio: 'Guatemala', gps: [18.3458, -67.0110], equipment: 'dialysis', hours: 5, backup: 'generator', alone: 0, mobility: 1, cg: ['Yolanda', 'Rivera Cruz', '7875550102', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Iris', lastP: 'Feliciano', lastM: 'Soto', phone: '7875550165', channel: 'whatsapp', address: 'Calle Ficticia 44', barrio: 'Guatemala', gps: [18.3429, -67.0102], equipment: 'refrigeration', hours: 18, backup: 'none', alone: 1, mobility: 0, cg: ['Javier', 'Feliciano Mora', '7875550103', 'neighbor'], consents: ['service', 'caregiver', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Ramón', lastP: 'Quiles', lastM: 'Vargas', phone: '7875550166', channel: 'sms', address: 'Calle Ficticia 52', barrio: 'Hoyamala', gps: [18.3515, -66.9689], equipment: 'breathing', hours: 4, backup: 'none', alone: 1, mobility: 1, cg: ['Teresa', 'Quiles Ortiz', '7875550104', 'sibling'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Margarita', lastP: 'Ortiz', lastM: 'Colón', phone: '7875550167', channel: 'whatsapp', address: 'Sector Ficticio Las Flores', barrio: 'Hoyamala', gps: [18.3540, -66.9725], equipment: 'mobility', hours: 12, backup: 'solar_battery', alone: 0, mobility: 1, cg: ['Daniel', 'Ortiz Rivera', '7875550105', 'grandchild'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Ángel', lastP: 'Morales', lastM: 'Pérez', phone: '7875550168', channel: 'sms', address: 'Calle Ficticia 60', barrio: 'Pueblo', gps: [18.3375, -66.9895], equipment: 'dialysis', hours: 3, backup: 'none', alone: 1, mobility: 1, cg: ['Lourdes', 'Morales Vega', '7875550106', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Gladys', lastP: 'Arce', lastM: 'Rosado', phone: '7875550169', channel: 'whatsapp', address: 'Calle Ficticia 61', barrio: 'Pueblo', gps: [18.3362, -66.9911], equipment: 'breathing', hours: 6, backup: 'generator', alone: 0, mobility: 0, cg: ['Hilda', 'Arce Medina', '7875550107', 'sibling'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Félix', lastP: 'Mercado', lastM: 'Ramos', phone: '7875550170', channel: 'sms', address: 'Calle Ficticia 63', barrio: 'Pueblo', gps: [18.3381, -66.9920], equipment: 'feeding', hours: 10, backup: 'none', alone: 0, mobility: 1, cg: ['Ivelisse', 'Mercado Soto', '7875550108', 'spouse'], consents: ['service', 'caregiver', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Luz', lastP: 'Cordero', lastM: 'Valentín', phone: '7875550171', channel: 'whatsapp', address: 'Calle Ficticia 66', barrio: 'Pueblo', gps: [18.3355, -66.9888], equipment: 'breathing', hours: 3, backup: 'none', alone: 1, mobility: 1, cg: ['Edwin', 'Cordero Lugo', '7875550109', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Juan', lastP: 'Román', lastM: 'Pagán', phone: '7875550172', channel: 'sms', address: 'Calle Ficticia 70', barrio: 'Pueblo', gps: [18.3390, -66.9902], equipment: 'refrigeration', hours: 24, backup: 'generator', alone: 0, mobility: 0, cg: ['Mayra', 'Román Cruz', '7875550110', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Sonia', lastP: 'Valle', lastM: 'Nieves', phone: '7875550173', channel: 'whatsapp', address: 'Camino Ficticio 33', barrio: 'Alto Sano', gps: [18.3192, -66.9641], equipment: 'breathing', hours: 5, backup: 'none', alone: 1, mobility: 0, cg: ['Ricardo', 'Valle Torres', '7875550111', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Víctor', lastP: 'Jiménez', lastM: 'Font', phone: '7875550174', channel: 'sms', address: 'Camino Ficticio 35', barrio: 'Alto Sano', gps: [18.3214, -66.9668], equipment: 'dialysis', hours: 4, backup: 'solar_battery', alone: 0, mobility: 1, cg: ['Norma', 'Jiménez Ruiz', '7875550112', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Carlos', lastP: 'Soto', lastM: 'Maldonado', phone: '7875550175', channel: 'sms', address: 'Sector Ficticio El Valle', barrio: 'Culebrinas', gps: [18.3227, -67.0201], equipment: 'mobility', hours: 8, backup: 'none', alone: 1, mobility: 1, cg: ['Brenda', 'Soto Rivera', '7875550113', 'professional_caregiver'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Aida', lastP: 'Rosario', lastM: 'Pérez', phone: '7875550176', channel: 'whatsapp', address: 'Camino Ficticio 48', barrio: 'Culebrinas', gps: [18.3203, -67.0172], equipment: 'breathing', hours: 6, backup: 'none', alone: 0, mobility: 1, cg: ['Jorge', 'Rosario Vélez', '7875550114', 'grandchild'], consents: ['service', 'caregiver', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Armando', lastP: 'Muñiz', lastM: 'Cardona', phone: '7875550177', channel: 'sms', address: 'Camino Ficticio 23', barrio: 'Piletas', gps: [18.3395, -67.0049], equipment: 'feeding', hours: 6, backup: 'none', alone: 1, mobility: 1, cg: ['Olga', 'Muñiz Ríos', '7875550115', 'sibling'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Zoraida', lastP: 'Pérez', lastM: 'Hernández', phone: '7875550178', channel: 'whatsapp', address: 'Camino Ficticio 26', barrio: 'Piletas', gps: [18.3379, -67.0075], equipment: 'breathing', hours: 4, backup: 'generator', alone: 0, mobility: 0, cg: ['Kevin', 'Pérez Lugo', '7875550116', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Ismael', lastP: 'Vargas', lastM: 'Ortiz', phone: '7875550179', channel: 'sms', address: 'Calle Ficticia Los Pinos 15', barrio: 'Pozas', gps: [18.3358, -66.9730], equipment: 'dialysis', hours: 3, backup: 'none', alone: 1, mobility: 1, cg: ['Wilma', 'Vargas Font', '7875550117', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Lydia', lastP: 'Acevedo', lastM: 'Morales', phone: '7875550180', channel: 'whatsapp', address: 'Calle Ficticia Los Pinos 22', barrio: 'Pozas', gps: [18.3374, -66.9755], equipment: 'refrigeration', hours: 16, backup: 'none', alone: 0, mobility: 0, cg: ['Noel', 'Acevedo Cruz', '7875550118', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Tomás', lastP: 'Nieves', lastM: 'Méndez', phone: '7875550181', channel: 'sms', address: 'Camino Ficticio 70', barrio: 'Calabazas', gps: [18.3109, -66.9971], equipment: 'breathing', hours: 7, backup: 'none', alone: 1, mobility: 1, cg: ['Glenda', 'Nieves Rosa', '7875550119', 'neighbor'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Esther', lastP: 'Galarza', lastM: 'Ruiz', phone: '7875550182', channel: 'whatsapp', address: 'Camino Ficticio 72', barrio: 'Calabazas', gps: [18.3125, -66.9944], equipment: 'mobility', hours: 12, backup: 'generator', alone: 0, mobility: 1, cg: ['Alexis', 'Galarza Vega', '7875550120', 'grandchild'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Gilberto', lastP: 'Lorenzo', lastM: 'Cruz', phone: '7875550183', channel: 'sms', address: 'Sector Ficticio La Cima', barrio: 'Juncal', gps: [18.3612, -66.9934], equipment: 'dialysis', hours: 4, backup: 'none', alone: 0, mobility: 1, cg: ['Migdalia', 'Lorenzo Pérez', '7875550121', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Providencia', lastP: 'Ramos', lastM: 'Avilés', phone: '7875550184', channel: 'whatsapp', address: 'Sector Ficticio La Cima 4', barrio: 'Juncal', gps: [18.3594, -66.9908], equipment: 'breathing', hours: 5, backup: 'none', alone: 1, mobility: 1, cg: ['Efraín', 'Ramos Soto', '7875550122', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Benito', lastP: 'Cabán', lastM: 'Rivera', phone: '7875550185', channel: 'sms', address: 'Camino Ficticio 81', barrio: 'Mirasol', gps: [18.3182, -66.9752], equipment: 'breathing', hours: 6, backup: 'none', alone: 1, mobility: 1, cg: ['Damaris', 'Cabán Ortiz', '7875550123', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Ivonne', lastP: 'Hernández', lastM: 'Lugo', phone: '7875550186', channel: 'whatsapp', address: 'Camino Ficticio 83', barrio: 'Mirasol', gps: [18.3170, -66.9738], equipment: 'feeding', hours: 8, backup: 'solar_battery', alone: 0, mobility: 0, cg: ['Raúl', 'Hernández Díaz', '7875550124', 'spouse'], consents: ['service', 'caregiver', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Julio', lastP: 'Avilés', lastM: 'Méndez', phone: '7875550187', channel: 'sms', address: 'Camino Ficticio 85', barrio: 'Mirasol', gps: [18.3191, -66.9770], equipment: 'dialysis', hours: 3, backup: 'none', alone: 0, mobility: 1, cg: ['Sandra', 'Avilés Ruiz', '7875550125', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Petra', lastP: 'Colón', lastM: 'Vélez', phone: '7875550188', channel: 'whatsapp', address: 'Sector Ficticio El Mirador', barrio: 'Eneas', gps: [18.3058, -66.9581], equipment: 'breathing', hours: 4, backup: 'none', alone: 1, mobility: 1, cg: ['Luis', 'Colón Arce', '7875550126', 'grandchild'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Edgardo', lastP: 'Rosa', lastM: 'Valentín', phone: '7875550189', channel: 'sms', address: 'Sector Ficticio El Mirador 9', barrio: 'Eneas', gps: [18.3045, -66.9566], equipment: 'mobility', hours: 10, backup: 'generator', alone: 0, mobility: 1, cg: ['Maritza', 'Rosa Pérez', '7875550127', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'San Sebastián', zip: '00685', first: 'Celia', lastP: 'Badillo', lastM: 'Torres', phone: '7875550190', channel: 'whatsapp', address: 'Sector Ficticio El Mirador 14', barrio: 'Eneas', gps: [18.3066, -66.9597], equipment: 'refrigeration', hours: 20, backup: 'none', alone: 1, mobility: 0, cg: ['Josué', 'Badillo Font', '7875550128', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'Caguas', zip: '00725', first: 'Gloria', lastP: 'Medina', lastM: 'Ortiz', phone: '7875550161', channel: 'whatsapp', address: 'Calle Ficticia 101', barrio: null, gps: [18.2341, -66.0388], equipment: 'breathing', hours: 4, backup: 'none', alone: 1, mobility: 1, cg: ['Iván', 'Medina Ruiz', '7875550261', 'child'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
  { town: 'Caguas', zip: '00725', first: 'Héctor', lastP: 'Ramos', lastM: 'Cruz', phone: '7875550162', channel: 'sms', address: 'Calle Ficticia 102', barrio: null, gps: [18.2362, -66.0351], equipment: 'mobility', hours: 10, backup: 'solar_battery', alone: 0, mobility: 1, cg: ['Sonia', 'Ramos Díaz', '7875550262', 'spouse'], consents: ['service', 'caregiver', 'luma', 'municipio'] },
];

function seedMunicipios() {
  const upsert = db.prepare(`
    INSERT INTO municipios (name, participating, omme_office, oncall_name, oncall_phone,
                            backup_name, backup_phone, contact_24h_verified_at, joined_at)
    VALUES (@name, @participating, @ommeOffice, @oncallName, @oncallPhone,
            @backupName, @backupPhone, @verifiedAt, @joinedAt)
    ON CONFLICT(name) DO UPDATE SET
      participating = excluded.participating,
      omme_office = excluded.omme_office,
      oncall_name = excluded.oncall_name,
      oncall_phone = excluded.oncall_phone,
      backup_name = excluded.backup_name,
      backup_phone = excluded.backup_phone,
      contact_24h_verified_at = excluded.contact_24h_verified_at,
      joined_at = excluded.joined_at
  `);

  const now = nowIso();
  const run = db.transaction(() => {
    for (const name of ALL_MUNICIPIOS) {
      const p = PARTICIPATING[name];
      upsert.run({
        name,
        participating: p ? 1 : 0,
        ommeOffice: p ? `Oficina Municipal de Manejo de Emergencias de ${name}` : null,
        oncallName: p ? p.oncallName : null,
        oncallPhone: p ? encrypt(p.oncallPhone) : null,
        backupName: p ? p.backupName : null,
        backupPhone: p ? encrypt(p.backupPhone) : null,
        verifiedAt: p ? now : null,
        joinedAt: p ? now : null,
      });
    }
  });
  run();
}

function seedResidents() {
  if (db.prepare('SELECT COUNT(*) AS n FROM residents').get().n > 0) return null;

  const findTown = db.prepare('SELECT id FROM municipios WHERE name = ?');
  const insertResident = db.prepare(`
    INSERT INTO residents (first_name, last_name_paternal, last_name_maternal, phone, address, gps,
      luma_meter, notify_channel, municipio_id, zip_code, barrio, equipment_category,
      survival_window_hours, backup_power, lives_alone, mobility_limited, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCaregiver = db.prepare(`
    INSERT INTO caregivers (resident_id, first_name, last_names, phone, email, relationship, created_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
  `);
  const insertConsent = db.prepare('INSERT INTO consents (resident_id, partner, granted_at) VALUES (?, ?, ?)');

  let demoResidentId = null;
  const now = nowIso();

  db.transaction(() => {
    SEED_RESIDENTS.forEach((r, i) => {
      const town = findTown.get(r.town);
      const { lastInsertRowid } = insertResident.run(
        encrypt(r.first), encrypt(r.lastP), encrypt(r.lastM), encrypt(`+1${r.phone}`),
        encrypt(r.address), encrypt(`${r.gps[0]},${r.gps[1]}`), encrypt(`LUMA-${1000 + i}`),
        r.channel, town.id, r.zip, r.barrio, r.equipment, r.hours, r.backup, r.alone, r.mobility, now
      );
      const id = Number(lastInsertRowid);
      insertCaregiver.run(id, encrypt(r.cg[0]), encrypt(r.cg[1]), encrypt(`+1${r.cg[2]}`), r.cg[3], now);
      r.consents.forEach((partner) => insertConsent.run(id, partner, now));
      if (r.demoLink) demoResidentId = id;
    });
  })();

  // Print the demo resident's personal link so it is ready for the check-in demo.
  return demoResidentId ? checkinUrl(issueToken(demoResidentId)) : null;
}

function seedAll() {
  seedMunicipios();
  const demoLink = seedResidents();
  if (demoLink) console.log(`Seeded ${SEED_RESIDENTS.length} residents. Doña Carmen's link: ${demoLink}`);
}

if (require.main === module) {
  seedAll();
  const { total, participating } = db.prepare(
    'SELECT COUNT(*) AS total, SUM(participating) AS participating FROM municipios'
  ).get();
  console.log(`Seeded municipios: ${total} total, ${participating} participating.`);
}

if (require.main === module) {
  seedAll();
  const { total, participating } = db.prepare(
    'SELECT COUNT(*) AS total, SUM(participating) AS participating FROM municipios'
  ).get();
  console.log(`Seeded municipios: ${total} total, ${participating} participating.`);
}

module.exports = { seedAll };