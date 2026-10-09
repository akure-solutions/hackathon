// POST /api/residents: resident sign-up with caregiver and per-partner consents.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { encrypt } = require('../crypto');
const { nowIso } = require('../time');
const { audit } = require('../audit');
const { issueToken, checkinUrl } = require('../tokens');
const { demoMode } = require('../config');

const router = express.Router();

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

const EQUIPMENT = ['breathing', 'dialysis', 'feeding', 'refrigeration', 'mobility'];
const BACKUP = ['generator', 'solar_battery', 'none'];
const CHANNELS = ['sms', 'whatsapp'];
const RELATIONSHIPS = [
  'child', 'spouse', 'parent', 'sibling', 'grandchild',
  'other_family', 'neighbor', 'friend', 'professional_caregiver',
];
const NAME_RE = /^[\p{L}][\p{L}\s'.-]{0,59}$/u;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// ---------- Validation helpers (messages are user-facing, in Spanish) ----------

class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function fail(field, message) {
  throw new ValidationError(field, message);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function name(value, field, { required = true } = {}) {
  const v = cleanText(value);
  if (!v) {
    if (required) fail(field, 'Este campo es requerido.');
    return null;
  }
  if (!NAME_RE.test(v)) fail(field, 'Usa solo letras, espacios, guiones o apóstrofes.');
  return v;
}

function phone(value, field) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (!/^[2-9]\d{9}$/.test(local)) {
    fail(field, 'Escribe un teléfono de 10 dígitos, por ejemplo 787-555-0123.');
  }
  return `+1${local}`;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) fail(field, 'Selecciona una opción.');
  return value;
}

function bool(value, field) {
  if (typeof value !== 'boolean') fail(field, 'Selecciona Sí o No.');
  return value;
}

function gps(value) {
  if (value === undefined || value === null || value === '') return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!(lat >= 17.8 && lat <= 18.6 && lng >= -67.4 && lng <= -65.2)) {
    fail('gps', 'La ubicación debe estar en Puerto Rico.');
  }
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

const findMunicipio = db.prepare('SELECT id, participating FROM municipios WHERE id = ?');

function validateSignup(body) {
  if (body.hasElectricDevice !== true) {
    fail('hasElectricDevice', 'Este registro es para personas que dependen de equipo médico eléctrico.');
  }

  const address = cleanText(body.address);
  if (address.length < 5 || address.length > 200) fail('address', 'Escribe tu dirección física completa.');

  const lumaMeter = cleanText(body.lumaMeter) || null;
  if (lumaMeter && !/^[A-Za-z0-9-]{4,20}$/.test(lumaMeter)) {
    fail('lumaMeter', 'El número de contador solo lleva letras y números.');
  }

  const municipio = findMunicipio.get(Number(body.municipioId));
  if (!municipio) fail('municipioId', 'Selecciona tu pueblo.');

  const zipCode = cleanText(body.zipCode);
  if (!/^00[6-9]\d{2}$/.test(zipCode)) fail('zipCode', 'Escribe un código postal de Puerto Rico, por ejemplo 00685.');

  const survivalWindowHours = Number(body.survivalWindowHours);
  if (!(survivalWindowHours >= 0.5 && survivalWindowHours <= 168)) {
    fail('survivalWindowHours', 'Escribe cuántas horas dura tu equipo sin luz (entre 0.5 y 168).');
  }

  const cg = body.caregiver || {};
  const caregiverEmail = cleanText(cg.email) || null;
  if (caregiverEmail && !EMAIL_RE.test(caregiverEmail)) fail('caregiver.email', 'Escribe un correo electrónico válido.');

  const consents = body.consents || {};
  if (consents.service !== true) {
    fail('consents.service', 'Necesitamos tu autorización para comunicarnos contigo durante una emergencia.');
  }

  return {
    firstName: name(body.firstName, 'firstName'),
    lastNamePaternal: name(body.lastNamePaternal, 'lastNamePaternal'),
    lastNameMaternal: name(body.lastNameMaternal, 'lastNameMaternal', { required: false }),
    phone: phone(body.phone, 'phone'),
    notifyChannel: oneOf(body.notifyChannel, CHANNELS, 'notifyChannel'),
    address,
    gps: gps(body.gps),
    lumaMeter,
    municipioId: municipio.id,
    municipioParticipating: municipio.participating === 1,
    zipCode,
    equipmentCategory: oneOf(body.equipmentCategory, EQUIPMENT, 'equipmentCategory'),
    survivalWindowHours,
    backupPower: oneOf(body.backupPower, BACKUP, 'backupPower'),
    livesAlone: bool(body.livesAlone, 'livesAlone'),
    mobilityLimited: bool(body.mobilityLimited, 'mobilityLimited'),
    caregiver: {
      firstName: name(cg.firstName, 'caregiver.firstName'),
      lastNames: name(cg.lastNames, 'caregiver.lastNames'),
      phone: phone(cg.phone, 'caregiver.phone'),
      email: caregiverEmail,
      relationship: oneOf(cg.relationship, RELATIONSHIPS, 'caregiver.relationship'),
    },
    consents: {
      service: true,
      caregiver: consents.caregiver === true,
      luma: consents.luma === true,
      // Municipio consent only applies where the municipio participates.
      municipio: consents.municipio === true && municipio.participating === 1,
    },
  };
}

// ---------- Persistence ----------

const insertResident = db.prepare(`
  INSERT INTO residents (first_name, last_name_paternal, last_name_maternal, phone, address, gps,
    luma_meter, notify_channel, municipio_id, zip_code, equipment_category, survival_window_hours,
    backup_power, lives_alone, mobility_limited, created_at)
  VALUES (@firstName, @lastNamePaternal, @lastNameMaternal, @phone, @address, @gps,
    @lumaMeter, @notifyChannel, @municipioId, @zipCode, @equipmentCategory, @survivalWindowHours,
    @backupPower, @livesAlone, @mobilityLimited, @createdAt)
`);

const insertCaregiver = db.prepare(`
  INSERT INTO caregivers (resident_id, first_name, last_names, phone, email, relationship, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertConsent = db.prepare(`
  INSERT INTO consents (resident_id, partner, granted_at) VALUES (?, ?, ?)
`);

const createResident = db.transaction((data) => {
  const now = nowIso();

  const { lastInsertRowid } = insertResident.run({
    firstName: encrypt(data.firstName),
    lastNamePaternal: encrypt(data.lastNamePaternal),
    lastNameMaternal: encrypt(data.lastNameMaternal),
    phone: encrypt(data.phone),
    address: encrypt(data.address),
    gps: encrypt(data.gps),
    lumaMeter: encrypt(data.lumaMeter),
    notifyChannel: data.notifyChannel,
    municipioId: data.municipioId,
    zipCode: data.zipCode,
    equipmentCategory: data.equipmentCategory,
    survivalWindowHours: data.survivalWindowHours,
    backupPower: data.backupPower,
    livesAlone: data.livesAlone ? 1 : 0,
    mobilityLimited: data.mobilityLimited ? 1 : 0,
    createdAt: now,
  });
  const residentId = Number(lastInsertRowid);
  const auditCtx = { actorRole: 'resident', residentId };

  audit('RESIDENT_CREATED', {
    ...auditCtx,
    details: { municipioId: data.municipioId, equipmentCategory: data.equipmentCategory },
  });

  const cg = data.caregiver;
  insertCaregiver.run(
    residentId,
    encrypt(cg.firstName),
    encrypt(cg.lastNames),
    encrypt(cg.phone),
    encrypt(cg.email),
    cg.relationship,
    now
  );
  audit('CAREGIVER_ADDED', auditCtx);

  const granted = Object.keys(data.consents).filter((partner) => data.consents[partner]);
  for (const partner of granted) {
    insertConsent.run(residentId, partner, now);
    audit('CONSENT_GRANTED', { ...auditCtx, details: { partner } });
  }

  const token = issueToken(residentId);
  audit('CHECKIN_LINK_ISSUED', auditCtx);

  return { residentId, checkinUrl: checkinUrl(token), consents: granted };
});

// ---------- Route ----------

router.post('/', signupLimiter, (req, res) => {
  let data;
  try {
    data = validateSignup(req.body || {});
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message, field: err.field });
    }
    throw err;
  }
  const result = createResident(data);
  // In production the personal link is delivered by message, never shown on screen.
  if (!demoMode) delete result.checkinUrl;
  res.status(201).json(result);
});

module.exports = router;