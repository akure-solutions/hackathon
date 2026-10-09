// Seeds reference data. Safe to run repeatedly (upserts by name).
const db = require('../src/db');
const { encrypt } = require('../src/crypto');
const { nowIso } = require('../src/time');
const { ALL_MUNICIPIOS, PARTICIPATING } = require('./municipios');

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

function seedAll() {
  seedMunicipios();
  // Step 9 adds: seedResidents();
}

if (require.main === module) {
  seedAll();
  const { total, participating } = db.prepare(
    'SELECT COUNT(*) AS total, SUM(participating) AS participating FROM municipios'
  ).get();
  console.log(`Seeded municipios: ${total} total, ${participating} participating.`);
}

module.exports = { seedAll };