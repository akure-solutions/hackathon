// Pure rules: tier and due escalation steps for one resident during one outage.
// No database, no clock: callers pass in the data and the current simulated time.
// Demo rules, not clinical guidance. Timers modeled on SB 1432 (pending bill).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const CAREGIVER_DELAY = 60 * MINUTE;
const ONCALL_DELAY = 4 * HOUR;
const REPEAT_EVERY = 12 * HOUR;

const TIERS = Object.freeze({ VERDE: 'verde', AMARILLO: 'amarillo', ROJO: 'rojo' });

function tierFor(ratio, response) {
  if (response === 'help') return TIERS.ROJO;
  if (ratio >= 1) return TIERS.ROJO;
  if (ratio >= 0.5) return TIERS.AMARILLO;
  return TIERS.VERDE;
}

function statusFor(response) {
  if (response === 'help') return 'help';
  if (response === 'ok') return 'ok';
  return 'awaiting';
}

/**
 * @param {object} input
 * @param {{survivalWindowHours:number}} input.resident
 * @param {{startedAtMs:number}|null} input.outage   active outage affecting this resident
 * @param {{response:'ok'|'help', atMs:number}|null} input.checkin   latest check-in in this outage
 * @param {string[]} input.consents        active partner names
 * @param {boolean} input.municipioParticipating
 * @param {number} nowMs                   simulated now
 */
function evaluate({ resident, outage, checkin, consents, municipioParticipating }, nowMs) {
  if (!outage) {
    return { elapsedMs: 0, ratio: 0, tier: null, status: 'no_outage', dueSteps: [] };
  }

  const elapsedMs = Math.max(0, nowMs - outage.startedAtMs);
  const ratio = elapsedMs / (resident.survivalWindowHours * HOUR);
  const response = checkin ? checkin.response : null;

  const canAlertCaregivers = consents.includes('caregiver');
  const canAlertOncall = consents.includes('municipio') && municipioParticipating;

  const dueSteps = ['notify_resident'];

  if (response === 'help') {
    if (canAlertCaregivers) dueSteps.push('alert_caregivers');
    if (canAlertOncall) dueSteps.push('alert_oncall');
  } else if (response !== 'ok') {
    if (canAlertCaregivers && elapsedMs >= CAREGIVER_DELAY) dueSteps.push('alert_caregivers');
    if (canAlertOncall && elapsedMs >= ONCALL_DELAY) {
      dueSteps.push('alert_oncall');
      const repeats = Math.floor((elapsedMs - ONCALL_DELAY) / REPEAT_EVERY);
      for (let n = 1; n <= repeats; n++) dueSteps.push(`contact_attempt_${n + 1}`);
    }
  }

  return {
    elapsedMs,
    ratio,
    tier: tierFor(ratio, response),
    status: statusFor(response),
    dueSteps,
  };
}

// Next scheduled escalation for the clock banner, or null once the on-call alert has fired.
function nextEscalation(elapsedMs) {
  if (elapsedMs < CAREGIVER_DELAY) return { step: 'alert_caregivers', inMs: CAREGIVER_DELAY - elapsedMs };
  if (elapsedMs < ONCALL_DELAY) return { step: 'alert_oncall', inMs: ONCALL_DELAY - elapsedMs };
  return null;
}

module.exports = { evaluate, nextEscalation, tierFor, TIERS, HOUR, MINUTE };