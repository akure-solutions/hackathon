// Check-in page: reads the personal token from the URL and lets the resident respond.
(function () {
  'use strict';

  const token = window.location.pathname.split('/').filter(Boolean).pop() || '';
  const POLL_MS = 30000;

  const el = (id) => document.getElementById(id);
  const states = {
    loading: el('state-loading'),
    invalid: el('state-invalid'),
    calm: el('state-calm'),
    outage: el('state-outage'),
  };
  const errorBox = el('checkin-error');
  const reportBtn = el('btn-report');
  const responseBtns = document.querySelectorAll('[data-response]');

  let pollTimer = null;
  let lastResult = null; // 'ok' | 'help' | 'report' after an action on this visit

  function show(name) {
    Object.entries(states).forEach(([key, node]) => { node.hidden = key !== name; });
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function setBusy(isBusy) {
    reportBtn.disabled = isBusy;
    responseBtns.forEach((b) => { b.disabled = isBusy; });
  }

  // ---------- Rendering ----------

  const RESULTS = {
    ok: {
      cls: 'result--ok', icon: '/img/status/ok.svg',
      title: (s) => `Gracias, ${s.firstName}.`,
      body: () => 'Recibimos tu respuesta. Si algo cambia, vuelve a este enlace.',
    },
    help: {
      cls: 'result--help', icon: '/img/status/help.svg',
      title: () => 'Ya avisamos.',
      body: () => 'Tus contactos y las oficinas que autorizaste recibieron tu pedido de ayuda.',
    },
    report: {
      cls: 'result--report', icon: '/img/status/awaiting.svg',
      title: () => 'Gracias por avisar.',
      body: () => 'Registramos el apagón en tu casa. ¿Cómo estás ahora?',
    },
  };

  function renderResult(state) {
    const kind = lastResult || (state.status === 'ok' || state.status === 'help' ? state.status : null);
    const box = el('result');
    if (!kind) {
      box.hidden = true;
      return;
    }
    const r = RESULTS[kind];
    box.className = `result ${r.cls}`;
    const img = document.createElement('img');
    img.src = r.icon;
    img.alt = '';
    el('result-icon').replaceChildren(img);
    el('result-title').textContent = r.title(state);
    el('result-body').textContent = r.body(state);
    box.hidden = false;
  }

  function render(state) {
    clearError();
    const town = state.town || 'tu pueblo';

    if (!state.outageActive) {
      el('calm-greeting').textContent = `Hola, ${state.firstName}.`;
      el('calm-text').textContent = `No tenemos apagones reportados en ${town}.`;
      show('calm');
      return;
    }

    el('outage-label').textContent = state.outageSource === 'resident_report'
      ? '▲ Apagón reportado en tu casa'
      : `▲ Apagón en ${town}`;
    el('outage-greeting').textContent = `Hola, ${state.firstName}. ¿Estás bien?`;
    el('outage-intro').textContent = state.status === 'awaiting'
      ? 'Toca un botón para decirnos cómo estás.'
      : 'Si algo cambia, puedes responder otra vez.';
    renderResult(state);
    show('outage');
  }

  // ---------- API ----------

  async function request(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function load() {
    try {
      const { res, data } = await request('GET', `/api/checkin/${encodeURIComponent(token)}`);
      if (res.status === 404) {
        show('invalid');
        stopPolling();
        return;
      }
      if (!res.ok) throw new Error(data.error);
      render(data);
    } catch (err) {
      showError('No pudimos conectar. Verifica tu conexión e intenta de nuevo.');
    }
  }

  async function respond(response) {
    setBusy(true);
    try {
      const { res, data } = await request('POST', `/api/checkin/${encodeURIComponent(token)}`, { response });
      if (!res.ok) {
        showError(data.error || 'Ocurrió un error. Intenta de nuevo.');
        return;
      }
      lastResult = response;
      render(data);
    } catch (err) {
      showError('No pudimos enviar tu respuesta. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function reportOutage() {
    setBusy(true);
    try {
      const { res, data } = await request('POST', `/api/report-outage/${encodeURIComponent(token)}`);
      if (!res.ok) {
        showError(data.error || 'Ocurrió un error. Intenta de nuevo.');
        return;
      }
      lastResult = 'report';
      render(data);
    } catch (err) {
      showError('No pudimos enviar tu aviso. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  // ---------- Polling: notice an outage that starts while the page is open ----------

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // ---------- Events ----------

  responseBtns.forEach((btn) => {
    btn.addEventListener('click', () => respond(btn.dataset.response));
  });
  reportBtn.addEventListener('click', reportOutage);

  load();
  startPolling();
})();