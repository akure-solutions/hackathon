// Builds outbound messages (Spanish, brand voice) and delivers them.
// NOTIFY_CHANNEL=log: nothing leaves the server. Messages are printed, kept in a small
// in-memory buffer for the demo dashboard, and audited without content or PII.
const { notifyChannel, resendApiKey, demoNotifyEmail } = require('./config');

const { audit } = require('./audit');
const { nowSimIso } = require('./clock');

const EQUIPMENT_LABELS = {
  breathing: 'respiración',
  dialysis: 'diálisis',
  feeding: 'alimentación',
  refrigeration: 'refrigeración de medicamentos',
  mobility: 'movilidad',
};
const CHANNEL_LABELS = { sms: 'Mensaje de texto', whatsapp: 'WhatsApp', call: 'Llamada' };

const MAX_BUFFER = 50;
const recentMessages = [];

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} minutos`;
  if (m === 0) return h === 1 ? '1 hora' : `${h} horas`;
  return `${h} h ${m} min`;
}

function hoursLeft(record, elapsedMs) {
  const left = record.survivalWindowHours - elapsedMs / 3600000;
  return left > 0 ? `unas ${Math.max(1, Math.round(left))} horas` : 'poco o nada';
}

// Returns { recipientType, recipientName, channel, text } for one escalation step.
function buildMessage(step, ctx) {
  const { record, town, elapsedMs, response, link, caregiver, oncallName } = ctx;
  const equipment = EQUIPMENT_LABELS[record.equipmentCategory] || 'equipo médico';
  const askedHelp = response === 'help';

  if (step === 'notify_resident') {
    return {
      recipientType: 'resident',
      recipientName: record.firstName,
      channel: CHANNEL_LABELS[record.notifyChannel],
      text: `Hola ${record.firstName}, es Energía Vital. Detectamos un apagón en ${town}. ¿Estás bien? Toca aquí para responder: ${link}`,
    };
  }

  if (step === 'alert_caregivers') {
    const text = askedHelp
      ? `${record.firstName} pidió ayuda durante el apagón en ${town}. ¿Puedes llamarle o pasar por su casa ahora?`
      : `${record.firstName} no ha respondido en ${formatDuration(elapsedMs)}. Su equipo de ${equipment} tiene ${hoursLeft(record, elapsedMs)} de batería. ¿Puedes llamarle o pasar por su casa?`;
    return {
      recipientType: 'caregiver',
      recipientName: caregiver ? caregiver.firstName : 'Contacto',
      channel: CHANNEL_LABELS.sms,
      text,
    };
  }

  // alert_oncall and contact_attempt_N go to the municipio's 24/7 on-call contact.
  const prefix = step.startsWith('contact_attempt') ? 'Recordatorio: ' : '';
  const situation = askedHelp
    ? 'pidió ayuda'
    : `no ha respondido tras ${formatDuration(elapsedMs)} de apagón`;
  return {
    recipientType: 'oncall',
    recipientName: oncallName || 'Guardia OMME',
    channel: CHANNEL_LABELS.call,
    text: `${prefix}Energía Vital: ${record.name} (${equipment}, ventana de ${record.survivalWindowHours} h) ${situation}. Dirección: ${record.address}. Requiere contacto individual.`,
  };
}

// ---------- Real email for the demo (Resend) ----------
// Only the demo resident (Doña Carmen), only these steps, and only to DEMO_NOTIFY_EMAIL
// (the developer's own inbox) leave the server. Everyone else stays simulated.
const DEMO_RESIDENT_ID = 1;
const EMAIL_SUBJECTS = {
  notify_resident: 'Energía Vital: ¿Estás bien?',
  alert_caregivers: 'Energía Vital: aviso para cuidadores',
};

function shouldEmail(step, ctx) {
  return Boolean(resendApiKey && demoNotifyEmail)
    && ctx.record.id === DEMO_RESIDENT_ID
    && Boolean(EMAIL_SUBJECTS[step]);
}

async function sendDemoEmail(step, msg, residentId) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Energía Vital <onboarding@resend.dev>',
        to: [demoNotifyEmail],
        subject: EMAIL_SUBJECTS[step],
        text: `${msg.text}\n\n— Demostración de Energía Vital PR. Todos los datos son ficticios.`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    console.log(`[notify:${step}] ✉ correo real enviado (demo)`);
    audit('NOTIFY_SENT', { residentId, details: { step, channel: 'email' } });
  } catch (err) {
    console.warn(`[notify:${step}] correo no enviado: ${err.message}`);
    audit('NOTIFY_FAILED', { residentId, details: { step, channel: 'email' } });
  }
}

function deliver(step, ctx) {
  const msg = buildMessage(step, ctx);
  const entry = { ...msg, step, residentId: ctx.record.id, simAt: nowSimIso() };

  if (notifyChannel === 'log') {
    console.log(`[notify:${step}] → ${msg.recipientName} (${msg.channel}): ${msg.text}`);
    recentMessages.unshift(entry);
    if (recentMessages.length > MAX_BUFFER) recentMessages.pop();
  }
  if (shouldEmail(step, ctx)) {
    entry.realChannel = 'email';
    sendDemoEmail(step, msg, ctx.record.id); // fire-and-forget: never blocks the engine tick
  }
  // SMS/WhatsApp providers plug in here once A2P carrier registration is approved.

  audit('NOTIFY_SIMULATED', {
    residentId: ctx.record.id,
    details: { step, recipientType: msg.recipientType, channel: notifyChannel },
  });
  return entry;
}

function getRecentMessages() {
  return recentMessages.slice();
}

function clearMessages() {
  recentMessages.length = 0;
}

module.exports = { deliver, buildMessage, getRecentMessages, clearMessages, formatDuration, EQUIPMENT_LABELS };