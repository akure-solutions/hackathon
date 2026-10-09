// Panel de Respuesta: polls the API every 5 s and renders by role.
// All user data is inserted with textContent (never innerHTML).
(function () {
  'use strict';

  const REFRESH_MS = 5000;
  const TZ = 'America/Puerto_Rico'; // always show Puerto Rico time (AST), whatever the laptop's setting
  const ICONS = { help: '/img/status/help.svg', awaiting: '/img/status/awaiting.svg', ok: '/img/status/ok.svg' };
  const $ = (id) => document.getElementById(id);

  // ---------- Labels (UI is Spanish; codes stay English) ----------

  const EQUIPMENT = { breathing: 'Respiración', dialysis: 'Diálisis', feeding: 'Alimentación / infusión', refrigeration: 'Refrigeración de medicamentos', mobility: 'Movilidad' };
  const BACKUP = { generator: 'Generador', solar_battery: 'Solar con batería', none: 'Sin respaldo' };
  const STATUS = {
    help: ['■', 'Pidió ayuda'], awaiting: ['▲', 'Esperando check-in'], ok: ['●', 'Está bien'], no_outage: ['○', 'Sin apagón'],
  };
  const CASE = {
    pending: 'Pendiente de respondedor', monitor: 'En monitoreo', attempted: 'Contacto intentado',
    coordinated: 'Asistencia coordinada', followup: 'Seguimiento requerido', resolved: 'Resuelto',
  };
  const POWER = { confirmed: 'Apagón confirmado', area: 'Posiblemente afectada', none: 'Con servicio' };
  const RELATIONSHIP = {
    child: 'hijo/a', spouse: 'pareja', parent: 'padre/madre', sibling: 'hermano/a', grandchild: 'nieto/a',
    other_family: 'familiar', neighbor: 'vecino/a', friend: 'amigo/a', professional_caregiver: 'cuidador/a',
  };
  const FEED_KIND = {
    checkin: ['→', 'Check-in'], outage: ['⚡', 'Reporte de apagón'], ok: ['●', 'Respuesta'], help: ['■', 'Pidió ayuda'],
    escalated: ['⬆', 'Escalado'], cg_notified: ['◇', 'Contacto notificado'], responder: ['✓', 'Respondedor'],
  };

  // ---------- State ----------

  const state = {
    session: null,
    personas: [],
    sanSebastianId: null,
    clock: null,          // last /api/demo/clock response
    clockFetchedAt: 0,
    rows: [],
    filters: { equip: 'all', battery: 'all', caseState: 'all', status: null },
    prevStatus: new Map(),
    flash: new Set(),
    seenFeed: null,       // Set of feed keys already shown (null until first render)
    openCaseId: null,
    inFlight: false,
  };

  // ---------- Helpers ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(message) {
    const t = $('toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  }

  function fmtDuration(ms) {
    const totalMin = Math.max(0, Math.floor(ms / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  function fmtPhone(phone) {
    const d = String(phone || '').replace(/\D/g, '').replace(/^1/, '');
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : '—';
  }

  function telHref(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    return d ? `tel:+${d.length === 10 ? '1' + d : d}` : '#';
  }

  function barrioText(barrio, town) {
    const b = barrio ? (barrio === 'Pueblo' ? 'Pueblo' : `Bo. ${barrio}`) : null;
    return [b, town].filter(Boolean).join(' · ');
  }

  function batteryInfo(hours) {
    if (hours === null || hours === undefined) return { text: '—', cls: 'bat' };
    if (hours <= 0) return { text: 'Agotada (est.)', cls: 'bat bat--red' };
    const text = hours < 1
      ? `~${Math.max(5, Math.round((hours * 60) / 5) * 5)} min restantes (est.)`
      : `~${Math.round(hours)} h restantes (est.)`;
    return { text, cls: hours <= 1 ? 'bat bat--red' : hours <= 3 ? 'bat bat--amber' : 'bat' };
  }

  function iconNode(kind, className, fallback) {
    if (ICONS[kind]) {
      const img = el('img', className);
      img.src = ICONS[kind];
      img.alt = '';
      return img;
    }
    return el('span', null, fallback);
  }

  function statusChip(status) {
    const [glyph, label] = STATUS[status] || STATUS.no_outage;
    const chip = el('span', `status status--${status}`);
    chip.append(iconNode(status, 'status__img', glyph), document.createTextNode(label));
    return chip;
  }

  function caregiverLine(row) {
    const c = row.caregiverContact;
    if (!c) return 'Sin contacto registrado';
    const who = `${c.firstName} (${RELATIONSHIP[c.relationship] || c.relationship})`;
    return row.caregiverNotifiedAt ? `${who} · notificado ${fmtTime(row.caregiverNotifiedAt)}` : `${who} · sin notificar`;
  }

  function townName() {
    return (state.session && state.session.municipioName) || 'San Sebastián';
  }

  // ---------- Session + persona menu ----------

  async function ensureSession() {
    state.session = await api('GET', '/api/session');
    if (!state.session) {
      // Demo convenience: start as the San Sebastián responder.
      await api('POST', '/api/demo/role', { personaId: 'omme_ss' });
      state.session = await api('GET', '/api/session');
    }
  }

  function renderPersona() {
    const s = state.session;
    const avatar = $('persona-avatar');
    avatar.className = `avatar avatar--${s.avatar}`;
    avatar.textContent = s.initials;
    $('persona-name').textContent = s.name;
    $('persona-role').textContent = `${s.roleLabel} · ${s.org}`;
    $('header-scope').textContent = s.role === 'luma'
      ? 'LUMA · Operaciones'
      : s.role === 'analyst' ? `Análisis · ${s.municipioName}` : `Respuesta a Emergencias · ${s.municipioName}`;

    const list = $('persona-list');
    list.replaceChildren();
    for (const p of state.personas) {
      const btn = el('button', `persona__option${p.id === s.personaId ? ' is-current' : ''}`);
      btn.type = 'button';
      const av = el('span', `avatar avatar--${p.avatar}`, p.initials);
      const text = el('span', 'persona__option-text');
      text.append(el('strong', null, `${p.name} · ${p.roleLabel}`), el('span', null, `${p.org} · ${p.can}`));
      btn.append(av, text, el('span', 'persona__check', p.id === s.personaId ? '✓' : ''));
      btn.addEventListener('click', () => switchPersona(p.id));
      list.append(btn);
    }
  }

  async function switchPersona(personaId) {
    $('persona-menu').hidden = true;
    $('persona-btn').setAttribute('aria-expanded', 'false');
    closeDrawer();
    try {
      await api('POST', '/api/demo/role', { personaId });
      state.session = await api('GET', '/api/session');
      state.prevStatus.clear();
      state.flash.clear();
      state.seenFeed = null;
      state.filters = { equip: 'all', battery: 'all', caseState: 'all', status: null };
      syncFilterControls();
      renderPersona();
      applyRoleLayout();
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  }

  $('persona-btn').addEventListener('click', () => {
    const menu = $('persona-menu');
    menu.hidden = !menu.hidden;
    $('persona-btn').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.persona')) $('persona-menu').hidden = true;
  });

  function applyRoleLayout() {
    const role = state.session.role;
    $('cases-card').hidden = role !== 'municipio';
    $('luma-card').hidden = role !== 'luma';
    $('analyst-card').hidden = role !== 'analyst';
    $('access-card').hidden = role === 'analyst';
    $('feed-card').hidden = role === 'luma';
  }

  // ---------- Clock banner ----------

  function renderClock() {
    const c = state.clock;
    if (!c) return;
    const drift = Date.now() - state.clockFetchedAt;
    const now = new Date(Date.parse(c.simNow) + drift);

    $('clock-time').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: TZ });
    $('clock-date').textContent = now.toLocaleDateString('es-PR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });

    const o = c.outage;
    $('btn-simulate').hidden = Boolean(o);
    document.querySelectorAll('[data-ff]').forEach((b) => { b.disabled = !o; });

    if (!o) {
      $('outage-title').textContent = 'Sin apagón activo';
      $('outage-elapsed').textContent = 'Usa «Simular apagón» para empezar la demostración';
      $('next-wrap').hidden = true;
      return;
    }

    const elapsed = o.elapsedMs + drift;
    $('outage-title').textContent = `Apagón en ${o.municipioName} desde las ${fmtTime(o.startedAt)}`;
    $('outage-elapsed').textContent = `Lleva ${fmtDuration(elapsed)}`;

    const wrap = $('next-wrap');
    wrap.hidden = false;
    if (o.next) {
      const remaining = Math.max(0, o.next.inMs - drift);
      const label = o.next.step === 'alert_caregivers'
        ? `Aviso a contactos en ${fmtDuration(remaining)}`
        : `Alerta a guardia OMME de ${o.municipioName} en ${fmtDuration(remaining)}`;
      $('next-text').textContent = label;
      const span = o.next.step === 'alert_caregivers' ? 3600000 : 3 * 3600000;
      const progress = 1 - remaining / span;
      $('next-bar').style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
      wrap.classList.remove('is-fired');
    } else {
      $('next-text').textContent = `■ Guardia OMME de ${o.municipioName} alertada`;
      $('next-bar').style.width = '100%';
      wrap.classList.add('is-fired');
    }
  }

  document.querySelectorAll('[data-ff]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api('POST', '/api/demo/fast-forward', { minutes: Number(btn.dataset.ff) });
        await refresh();
      } catch (err) { toast(err.message); }
    });
  });

  $('btn-simulate').addEventListener('click', async () => {
    const municipioId = (state.session.role !== 'luma' && state.session.municipioId) || state.sanSebastianId;
    try {
      await api('POST', '/api/outages', { municipioId });
      toast('Apagón simulado. Check-ins enviados.');
      await refresh();
    } catch (err) { toast(err.message); }
  });



  $('btn-reset').addEventListener('click', async () => {
    try {
      await api('POST', '/api/demo/reset');
      state.prevStatus.clear();
      state.flash.clear();
      state.seenFeed = null;
      closeDrawer();
      toast('Demostración reiniciada.');
      await refresh();
    } catch (err) { toast(err.message); }
  });

    const scenarioBtn = document.getElementById('btn-scenario');
  if (scenarioBtn) {
    scenarioBtn.addEventListener('click', () => {
      api('POST', '/api/demo/scenario', {})
        .then((d) => {
          toast(`Simulado: ${d.reported} reportes de apagón · ${d.ok} están bien · ${d.help} piden ayuda`);
          refresh();
        })
        .catch((err) => toast(err.message));
    });
  }

  // ---------- Overview: permissions + KPIs ----------

  function renderOverview(o) {

    document.querySelectorAll('.kpi').forEach((tile) => {
      const n = o.kpis[tile.dataset.kpi];
      tile.querySelector('[data-n]').textContent = n ?? 0;
      tile.classList.toggle('is-active', Boolean(tile.dataset.filter) && state.filters.status === tile.dataset.filter);
    });
    document.querySelector('.kpi--help').classList.toggle('has-help', o.kpis.help > 0);
  }

  document.querySelectorAll('.kpi').forEach((tile) => {
    tile.addEventListener('click', () => {
      const f = tile.dataset.filter || null;
      state.filters.status = state.filters.status === f ? null : f;
      syncFilterControls();
      renderCases(state.rows);
      document.querySelectorAll('.kpi').forEach((t) => {
        t.classList.toggle('is-active', Boolean(t.dataset.filter) && state.filters.status === t.dataset.filter);
      });
    });
  });

  // ---------- Cases (responder) ----------

  function passesFilters(r) {
    const f = state.filters;
    if (f.status && r.status !== f.status) return false;
    if (f.equip !== 'all' && r.equipmentCategory !== f.equip) return false;
    if (f.caseState !== 'all' && r.caseState !== f.caseState) return false;
    if (f.battery !== 'all' && !(r.batteryRemainingHours !== null && r.batteryRemainingHours <= Number(f.battery))) return false;
    return true;
  }

  function trackFlash(rows) {
    for (const r of rows) {
      const prev = state.prevStatus.get(r.id);
      if (prev && prev !== r.status) {
        state.flash.add(r.id);
        setTimeout(() => { state.flash.delete(r.id); renderCases(state.rows); }, 6000);
      }
      state.prevStatus.set(r.id, r.status);
    }
  }

  function logCall(id, kind) {
    api('POST', `/api/dashboard/cases/${id}/actions`, { kind }).catch(() => {});
  }

  function renderCases(rows) {
    const body = $('cases-body');
    const visible = rows.filter(passesFilters);
    const town = townName();

    body.replaceChildren(...visible.map((r) => {
      const row = el('div', `row row--click${state.flash.has(r.id) ? ' is-flash' : ''}`);
      row.addEventListener('click', () => openCase(r.id));

      const c1 = el('span', 'cell');
      c1.append(el('strong', 'cell__name', r.name), el('span', 'cell__muted', barrioText(r.barrio, town)), el('span', 'cell__mono', fmtPhone(r.phone)));

      const bat = batteryInfo(r.batteryRemainingHours);
      const c2 = el('span', 'cell');
      c2.append(
        el('span', 'cell__strong', EQUIPMENT[r.equipmentCategory] || '—'),
        el('span', bat.cls, bat.text),
        el('span', 'cell__muted', `${BACKUP[r.backupPower] || '—'}${r.mobilityLimited ? ' · ♿ movilidad reducida' : ''}`)
      );

      const c3 = el('span', 'cell');
      c3.append(
        el('span', `power power--${r.power}`, POWER[r.power]),
        el('span', 'cell__muted', r.lastCheckinAt ? `Último check-in ${fmtTime(r.lastCheckinAt)}` : (r.inOutage ? 'Sin respuesta' : '—'))
      );

      const c4 = el('span', 'cell');
      const line = el('span', 'status-line');
      line.append(statusChip(r.status));
      if (state.flash.has(r.id)) line.append(el('span', 'changed', 'CAMBIÓ'));
      c4.append(line, el('span', 'cell__muted', caregiverLine(r)), el('span', `case-label case-label--${r.caseState}`, CASE[r.caseState]));

      const c5 = el('span', 'cell__actions');
      const call = el('a', 'btn-sm btn-sm--call', 'Llamar');
      call.href = telHref(r.phone);
      call.addEventListener('click', (e) => { e.stopPropagation(); logCall(r.id, 'call_resident'); });
      const open = el('button', 'btn-sm btn-sm--open', 'Abrir caso');
      open.type = 'button';
      open.addEventListener('click', (e) => { e.stopPropagation(); openCase(r.id); });
      c5.append(call, open);

      row.append(c1, c2, c3, c4, c5);
      return row;
    }));

    $('cases-empty').hidden = visible.length > 0;
    $('cases-count').textContent = `${visible.length} de ${rows.length} residentes · ordenados por urgencia`;
  }

  function syncFilterControls() {
    const f = state.filters;
    $('f-equip').value = f.equip;
    $('f-battery').value = f.battery;
    $('f-case').value = f.caseState;
    $('f-help').setAttribute('aria-pressed', String(f.status === 'help'));
    $('f-clear').hidden = !(f.status || f.equip !== 'all' || f.battery !== 'all' || f.caseState !== 'all');
  }

  [['f-equip', 'equip'], ['f-battery', 'battery'], ['f-case', 'caseState']].forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => {
      state.filters[key] = e.target.value;
      syncFilterControls();
      renderCases(state.rows);
    });
  });
  $('f-help').addEventListener('click', () => {
    state.filters.status = state.filters.status === 'help' ? null : 'help';
    syncFilterControls();
    renderCases(state.rows);
  });
  $('f-clear').addEventListener('click', () => {
    state.filters = { equip: 'all', battery: 'all', caseState: 'all', status: null };
    syncFilterControls();
    renderCases(state.rows);
  });

  // ---------- LUMA list ----------

  function renderLuma(data) {
    const body = $('luma-body');
    body.replaceChildren(...data.rows.map((r) => {
      const row = el('div', 'row');
      const c1 = el('span', 'cell');
      c1.append(el('strong', 'cell__name', r.name), el('span', 'cell__muted', r.address || ''), el('span', 'cell__mono', fmtPhone(r.phone)));
      const c2 = el('span', 'cell');
      c2.append(el('span', 'cell__mono', r.lumaMeter || '—'), el('span', 'cell__muted', BACKUP[r.backupPower] || '—'));
      const bat = batteryInfo(r.batteryRemainingHours);
      const c3 = el('span', 'cell');
      c3.append(el('span', bat.cls, bat.text), statusChip(r.status));
      const c4 = el('span', 'cell');
      c4.append(el('span', 'locked', '🔒 No autorizado'));
      row.append(c1, c2, c3, c4);
      return row;
    }));
    $('luma-count').textContent = `${data.rows.length} hogares autorizaron compartir con LUMA`;
    $('luma-hidden').textContent = data.hiddenCount ? `🔒 ${data.hiddenCount} no autorizaron` : '';
  }

  // ---------- Analyst ----------

  function renderAnalytics(data) {
    $('analyst-note').textContent = data.note;
    $('analyst-body').replaceChildren(...data.rows.map((b) => {
      const row = el('div', 'row row--analyst');
      row.append(
        el('strong', null, b.label), el('span', null, String(b.n)), el('span', null, String(b.help)),
        el('span', null, String(b.awaiting)), el('span', null, String(b.ok)), el('span', 'cell__strong', b.power)
      );
      return row;
    }));
  }

  // ---------- Feed ----------

  function renderFeed(items) {
    const first = state.seenFeed === null;
    const seen = state.seenFeed || new Set();
    $('feed').replaceChildren(...items.map((item) => {
      const isNew = !first && !seen.has(item.key);
      const [icon, label] = FEED_KIND[item.kind] || ['•', item.kind];
      const li = el('li', `feed__item${isNew ? ' is-new' : ''}`);
      const meta = el('span', 'feed__meta');
      meta.append(el('span', `feed__label k-${item.kind}`, label));
      if (isNew) meta.append(el('span', 'feed__new', 'NUEVO'));
      const body = el('span', 'feed__body');
      body.append(meta, el('span', 'feed__text', item.text));
      const iconWrap = el('span', `feed__icon k-${item.kind}`);
      iconWrap.append(iconNode(item.kind, 'feed__img', icon));
      li.append(el('span', 'feed__time', fmtTime(item.at)), iconWrap, body);
      return li;
    }));
    state.seenFeed = new Set(items.map((i) => i.key));
    $('feed-empty').hidden = items.length > 0;
  }

  // ---------- Access log ----------

  function renderAccess(items) {
    $('access-list').replaceChildren(...items.map((a) => {
      const li = el('li', 'access__item');
      const who = el('span', 'access__who');
      who.append(el('span', `access__badge access__badge--${a.badge}`, a.badge), document.createTextNode(a.who));
      const body = el('span', 'access__body');
      body.append(who, el('span', 'access__action', a.action));
      if (a.fields.length) body.append(el('span', 'access__fields', `Campos: ${a.fields.join(', ')}`));
      li.append(el('span', 'access__time', fmtTime(a.at)), body);
      return li;
    }));
    $('access-empty').hidden = items.length > 0;
  }

  // ---------- LUMA regional tiles (8.7 adds /api/luma/regions) ----------

  async function renderLumaTiles() {
    const pill = $('luma-source');
    try {
      const q = state.session.municipioId ? `?municipioId=${state.session.municipioId}` : '';
      const d = await api('GET', `/api/luma/regions${q}`);
      pill.className = `source-pill ${d.status === 'live' ? 'is-live' : d.status === 'stale' ? 'is-stale' : ''}`;
      $('luma-source-text').textContent = d.status === 'live' ? 'En vivo (no oficial)' : d.status === 'stale' ? 'Retrasado' : 'No disponible';
      $('luma-updated').textContent = d.lumaTimestamp || '—';
      $('luma-customers').textContent = d.region ? `${d.region.withoutService.toLocaleString('en-US')} (${d.region.pct}%)` : '—';
      $('luma-region').textContent = d.region ? d.region.name : 'Región no disponible';
    } catch (err) {
      pill.className = 'source-pill';
      $('luma-source-text').textContent = 'Datos no disponibles';
    }
  }

  // ---------- Drawer ----------

  async function openCase(id) {
    state.openCaseId = id;
    try {
      const c = await api('GET', `/api/dashboard/cases/${id}`);
      fillDrawer(c);
      $('drawer-overlay').hidden = false;
      $('drawer').hidden = false;
    } catch (err) {
      toast(err.message);
    }
  }

  function fillDrawer(c) {
    $('d-name').textContent = c.name;
    $('d-addr').textContent = [c.address, barrioText(c.barrio, townName())].filter(Boolean).join(' · ');
    $('d-status').replaceWith(Object.assign(statusChip(c.status), { id: 'd-status' }));
    const caseLabel = $('d-case');
    caseLabel.className = `case-label case-label--${c.caseState}`;
    caseLabel.textContent = CASE[c.caseState];

    $('d-phone').textContent = fmtPhone(c.phone);
    $('d-call').href = telHref(c.phone);

    const cg = c.caregiverContact;
    $('d-cg-wrap').hidden = !cg;
    if (cg) {
      $('d-cg-name').textContent = `Contacto: ${cg.name} (${RELATIONSHIP[cg.relationship] || cg.relationship})`;
      $('d-cg-phone').textContent = fmtPhone(cg.phone);
      $('d-cg-call').href = telHref(cg.phone);
    }

    $('d-equip').textContent = EQUIPMENT[c.equipmentCategory] || '—';
    const bat = batteryInfo(c.batteryRemainingHours);
    $('d-battery').textContent = bat.text;
    $('d-battery').className = bat.cls;
    $('d-power').textContent = POWER[c.power];
    $('d-backup').textContent = `${BACKUP[c.backupPower] || '—'}${c.mobilityLimited ? ' · ♿' : ''}${c.livesAlone ? ' · vive solo/a' : ''}`;

    document.querySelectorAll('.case-action').forEach((b) => {
      b.classList.toggle('is-current', b.dataset.action === c.caseState);
    });

    $('d-history').replaceChildren(...c.history.map((h) => {
      const [icon] = FEED_KIND[h.kind] || ['•'];
      const li = el('li', 'history__item');
      const iconWrap = el('span', `history__icon k-${h.kind}`);
      iconWrap.append(iconNode(h.kind, 'history__img', icon));
      li.append(el('span', 'history__time', fmtTime(h.at)), iconWrap, el('span', 'history__text', h.text));
      return li;
    }));
  }

  function closeDrawer() {
    state.openCaseId = null;
    $('drawer').hidden = true;
    $('drawer-overlay').hidden = true;
    $('d-note').value = '';
  }

  async function caseAction(kind, note) {
    const id = state.openCaseId;
    if (!id) return;
    try {
      await api('POST', `/api/dashboard/cases/${id}/actions`, note ? { kind, note } : { kind });
      if (kind === 'note') $('d-note').value = '';
      await openCase(id);
      await refresh();
      toast('Caso actualizado.');
    } catch (err) { toast(err.message); }
  }

  $('d-close').addEventListener('click', closeDrawer);
  $('drawer-overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  document.querySelectorAll('.case-action').forEach((b) => b.addEventListener('click', () => caseAction(b.dataset.action)));
  $('d-save-note').addEventListener('click', () => {
    const note = $('d-note').value.trim();
    if (!note) { toast('Escribe la nota antes de guardar.'); return; }
    caseAction('note', note);
  });
  $('d-call').addEventListener('click', () => { if (state.openCaseId) logCall(state.openCaseId, 'call_resident'); });
  $('d-cg-call').addEventListener('click', () => { if (state.openCaseId) logCall(state.openCaseId, 'call_caregiver'); });

  // ---------- Refresh loop ----------

  async function refresh() {
    if (state.inFlight || !state.session) return;
    state.inFlight = true;
    const role = state.session.role;
    try {
      const clockQ = role !== 'luma' && state.session.municipioId ? `?municipioId=${state.session.municipioId}` : '';
      const [clock, overview] = await Promise.all([
        api('GET', `/api/demo/clock${clockQ}`),
        api('GET', '/api/dashboard/overview'),
      ]);
      state.clock = clock;
      state.clockFetchedAt = Date.now();
      renderClock();
      renderOverview(overview);

      const jobs = [];
      if (role === 'municipio') {
        jobs.push(api('GET', '/api/dashboard/cases').then((d) => {
          $('cases-hidden').textContent = d.hiddenCount
            ? `🔒 Solo residentes que autorizaron compartir con OMME · ${d.hiddenCount} no autorizaron`
            : '';
          state.rows = d.rows;
          renderCases(d.rows);
        }));
      }
      if (role === 'luma') jobs.push(api('GET', '/api/dashboard/luma').then((d) => { state.rows = d.rows; renderLuma(d); }));
      if (role === 'analyst') jobs.push(api('GET', '/api/dashboard/analytics').then((d) => { state.analytics = d; renderAnalytics(d); }));
      if (role !== 'luma') jobs.push(api('GET', '/api/dashboard/feed').then(renderFeed));
      if (role !== 'analyst') jobs.push(api('GET', '/api/dashboard/access-log').then(renderAccess));
      jobs.push(renderLumaTiles());
      await Promise.all(jobs);

      if (window.EVMap) {
        window.EVMap.render({
          role, rows: role === 'municipio' ? state.rows : [], analytics: state.analytics,
          outage: clock.outage, town: townName(), onOpen: openCase,
        });
      }
    } catch (err) {
      if (err.status === 401) { await ensureSession(); renderPersona(); applyRoleLayout(); }
      else toast(err.message);
    } finally {
      state.inFlight = false;
    }
  }

  // ---------- Start ----------

  async function start() {
    try {
      await ensureSession();
      const [personas, municipios] = await Promise.all([api('GET', '/api/demo/personas'), api('GET', '/api/municipios')]);
      state.personas = personas;
      const ss = municipios.find((m) => m.name === 'San Sebastián');
      state.sanSebastianId = ss ? ss.id : null;
      renderPersona();
      applyRoleLayout();
      syncFilterControls();
      await refresh();
      setInterval(refresh, REFRESH_MS);
      setInterval(renderClock, 1000); // smooth seconds between polls
    } catch (err) {
      toast('No pudimos cargar el panel. Verifica que el servidor esté corriendo.');
    }
  }

  start();
})();