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