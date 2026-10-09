// Sign-up page behavior: gate question, municipio list, geolocation, submit, and errors.
// All user-facing text is Spanish; code is English.
(function () {
  'use strict';

  const form = document.getElementById('signup-form');
  const gate = document.getElementById('gate');
  const gateNo = document.getElementById('gate-no');
  const privacy = document.querySelector('.privacy');
  const municipioSelect = document.getElementById('municipioId');
  const municipioWarning = document.getElementById('municipio-not-participating');
  const municipioConsent = document.getElementById('consent-municipio');
  const municipioToggle = form.querySelector('input[name="consents.municipio"]');
  const locationBtn = document.getElementById('btn-location');
  const locationStatus = document.getElementById('location-status');
  const formError = document.getElementById('form-error');
  const submitBtn = document.getElementById('btn-submit');
  const success = document.getElementById('success');
  const demoBox = document.getElementById('demo-box');
  const demoLink = document.getElementById('demo-link');
  const CHANNEL_LABELS = { sms: 'mensaje de texto', whatsapp: 'WhatsApp' };
  const copyBtn = document.getElementById('btn-copy-link');

  const municipiosById = new Map();
  let coords = null; // { lat, lng } when the person shares their location

  // ---------- Gate question ----------

  gate.querySelectorAll('[data-gate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const answer = btn.dataset.gate;
      gate.querySelectorAll('[data-gate]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      gate.classList.add('is-answered');

      if (answer === 'yes') {
        gateNo.hidden = true;
        form.hidden = false;
        form.querySelector('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        form.hidden = true;
        gateNo.hidden = false;
      }
    });
  });

  // ---------- Municipios ----------

  async function loadMunicipios() {
    try {
      const res = await fetch('/api/municipios', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const municipios = await res.json();
      for (const m of municipios) {
        municipiosById.set(String(m.id), m);
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name;
        municipioSelect.appendChild(option);
      }
    } catch (err) {
      showFormError('No pudimos cargar la lista de pueblos. Recarga la página e intenta de nuevo.');
    }
  }

  municipioSelect.addEventListener('change', () => {
    const m = municipiosById.get(municipioSelect.value);
    const notParticipating = Boolean(m) && !m.participating;
    municipioWarning.hidden = !notParticipating;
    municipioToggle.disabled = notParticipating;
    if (notParticipating) municipioToggle.checked = false;
    municipioConsent.classList.toggle('consent--disabled', notParticipating);
  });

    // ---------- Barrio: list for San Sebastián (matches the dashboard map), free text elsewhere ----------

  const BARRIOS_BY_TOWN = {
    'San Sebastián': ['Alto Sano', 'Calabazas', 'Culebrinas', 'Eneas', 'Guatemala', 'Hoyamala',
      'Juncal', 'Mirasol', 'Piletas', 'Pozas', 'Pueblo', 'Robles'],
  };
  const barrioSelect = document.getElementById('barrioSelect');
  const barrioText = document.getElementById('barrioText');
  const barrioLabel = document.getElementById('barrio-label');

  function updateBarrioField() {
    const m = municipiosById.get(municipioSelect.value);
    const list = m ? BARRIOS_BY_TOWN[m.name] : null;
    barrioSelect.replaceChildren(new Option('Selecciona el barrio', ''));
    if (list) {
      list.forEach((b) => barrioSelect.append(new Option(b, b)));
      barrioSelect.append(new Option('Otro', '__other'));
    }
    barrioSelect.hidden = !list;
    barrioText.hidden = Boolean(list);
    barrioText.value = '';
    barrioLabel.htmlFor = list ? 'barrioSelect' : 'barrioText';
  }

  barrioSelect.addEventListener('change', () => {
    const other = barrioSelect.value === '__other';
    barrioText.hidden = !other;
    if (other) barrioText.focus();
  });
  municipioSelect.addEventListener('change', updateBarrioField);

  function barrioValue() {
    if (!barrioSelect.hidden && barrioSelect.value && barrioSelect.value !== '__other') return barrioSelect.value;
    return barrioText.value.trim() || null;
  }

  // ---------- Location (optional) ----------

  locationBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      locationStatus.textContent = 'Este dispositivo no permite compartir la ubicación. Puedes continuar sin ella.';
      return;
    }
    locationBtn.disabled = true;
    locationStatus.textContent = 'Buscando tu ubicación…';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        locationStatus.textContent = '✓ Ubicación guardada.';
        locationBtn.disabled = false;
        clearError('gps');
      },
      () => {
        coords = null;
        locationStatus.textContent = 'No pudimos obtener la ubicación. Puedes continuar sin ella.';
        locationBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ---------- Phone formatting: 787-555-0123, max 10 digits ----------

  function formatPhone(input) {
    const digits = input.value.replace(/\D/g, '').replace(/^1/, '').slice(0, 10);
    input.value = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join('-');
  }
  ['phone', 'caregiver.phone'].forEach((name) => {
    form.elements.namedItem(name).addEventListener('input', (e) => formatPhone(e.target));
  });

  // ---------- Build payload ----------

  function radioValue(name) {
    const checked = form.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
  }

  function textValue(name) {
    const el = form.elements.namedItem(name);
    return el ? el.value.trim() : '';
  }

  function yesNo(name) {
    const v = radioValue(name);
    return v === null ? null : v === 'yes';
  }

  function isChecked(name) {
    const el = form.elements.namedItem(name);
    return Boolean(el && el.checked && !el.disabled);
  }

  function buildPayload() {
    return {
      hasElectricDevice: true,
      firstName: textValue('firstName'),
      lastNamePaternal: textValue('lastNamePaternal'),
      lastNameMaternal: textValue('lastNameMaternal'),
      phone: textValue('phone'),
      notifyChannel: radioValue('notifyChannel'),
      address: textValue('address'),
      gps: coords,
      lumaMeter: textValue('lumaMeter'),
      municipioId: Number(municipioSelect.value) || null,
      zipCode: textValue('zipCode'),
      barrio: barrioValue(),
      equipmentCategory: radioValue('equipmentCategory'),
      survivalWindowHours: textValue('survivalWindowHours') === '' ? null : Number(textValue('survivalWindowHours')),
      backupPower: radioValue('backupPower'),
      livesAlone: yesNo('livesAlone'),
      mobilityLimited: yesNo('mobilityLimited'),
      caregiver: {
        firstName: textValue('caregiver.firstName'),
        lastNames: textValue('caregiver.lastNames'),
        phone: textValue('caregiver.phone'),
        email: textValue('caregiver.email'),
        relationship: textValue('caregiver.relationship'),
      },
      consents: {
        service: isChecked('consents.service'),
        caregiver: isChecked('consents.caregiver'),
        luma: isChecked('consents.luma'),
        municipio: isChecked('consents.municipio'),
      },
    };
  }

  // ---------- Errors ----------

  function errorSlot(field) {
    return form.querySelector(`[data-error-for="${field}"]`);
  }

  function clearError(field) {
    const slot = errorSlot(field);
    if (!slot) return;
    slot.textContent = '';
    const wrapper = slot.closest('.field, .consent');
    if (wrapper) wrapper.classList.remove('field--error');
  }

  function clearAllErrors() {
    form.querySelectorAll('[data-error-for]').forEach((slot) => clearError(slot.dataset.errorFor));
    formError.hidden = true;
    formError.textContent = '';
  }

  function showFieldError(field, message) {
    const slot = errorSlot(field);
    if (!slot) {
      showFormError(message);
      return;
    }
    slot.textContent = message;
    const wrapper = slot.closest('.field, .consent');
    if (wrapper) wrapper.classList.add('field--error');

    const input = form.querySelector(`[name="${field}"]`) || municipioSelect;
    (wrapper || slot).scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (input && typeof input.focus === 'function') input.focus({ preventScroll: true });
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
    formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Clear a field's error as soon as the person changes it.
  form.addEventListener('input', (e) => { if (e.target.name) clearError(e.target.name); });
  form.addEventListener('change', (e) => { if (e.target.name) clearError(e.target.name); });

  // ---------- Submit ----------

  const submitLabel = submitBtn.innerHTML;

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.textContent = isSubmitting ? 'Enviando…' : '';
    if (!isSubmitting) submitBtn.innerHTML = submitLabel;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();
    setSubmitting(true);

    try {
      const payload = buildPayload();
      const res = await fetch('/api/residents', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201) {
        showSuccess(payload, data.checkinUrl);
        return;
      }
      if (res.status === 400 && data.field) {
        showFieldError(data.field, data.error);
      } else {
        showFormError(data.error || 'Ocurrió un error. Intenta de nuevo.');
      }
    } catch (err) {
      showFormError('No pudimos conectar. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  });

  // ---------- Success ----------

   // ---------- Success ----------

  function showSuccess(payload, checkinUrl) {
    const municipio = municipiosById.get(String(payload.municipioId));
    const townName = municipio ? municipio.name : 'tu pueblo';
    const channel = CHANNEL_LABELS[payload.notifyChannel] || 'mensaje';

    // textContent only: never inject user input as HTML.
    document.getElementById('success-title').textContent = `● ¡Listo, ${payload.firstName}! El registro está completo.`;
    document.getElementById('step-notify').textContent =
      `Si se va la luz en ${townName}, te enviaremos un ${channel} para saber cómo estás.`;

    const who = [];
    if (payload.consents.caregiver) who.push(payload.caregiver.firstName);
    if (payload.consents.municipio) who.push(`la Oficina de Manejo de Emergencias de ${townName}`);
    document.getElementById('step-escalate').textContent = who.length
      ? `Si no hay respuesta, avisamos a ${who.join(' y a ')}.`
      : 'Si no hay respuesta, volveremos a escribirte.';

    if (checkinUrl) {
      demoLink.href = checkinUrl;
      demoBox.hidden = false;
    }

    form.hidden = true;
    gate.hidden = true;
    privacy.hidden = true;
    success.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  loadMunicipios();
})();