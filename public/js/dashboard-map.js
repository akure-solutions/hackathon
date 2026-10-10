// Schematic map of San Sebastián barrios (approximate positions, not real geography).
// Responder: one pin per consented resident, colored by status. Analyst: aggregate bubbles.
// Exposes window.EVMap.render(...) for dashboard.js.
(function () {
  'use strict';

  const MAP_TOWN = 'San Sebastián';
  // Percent positions inside the map box (from the Panel de Respuesta design).
  const BARRIOS = {
    Juncal: [48, 15], Guatemala: [21, 25], Hoyamala: [71, 21], Robles: [88, 38], Piletas: [32, 45],
    Pueblo: [51, 49], Pozas: [66, 50], Culebrinas: [15, 66], 'Alto Sano': [82, 68], Calabazas: [42, 80],
    Mirasol: [64, 86], Eneas: [90, 88],
  };
  const OFFSETS = [[0, 0], [5, -3], [-5, -3], [0, -6], [5, 3], [-5, 3]];
  const ICONS = { help: '/img/status/help.svg', awaiting: '/img/status/awaiting.svg', ok: '/img/status/ok.svg' };
  const STATUS_LABEL = { help: 'Pidió ayuda', awaiting: 'Esperando check-in', ok: 'Está bien', no_outage: 'Sin apagón' };

  const layers = { zones: true, residents: true };
  let last = null;

  const map = () => document.getElementById('map');

  function place(node, x, y) {
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear() {
    const box = map();
    [...box.children].forEach((child) => { if (child.id !== 'map-note') child.remove(); });
  }

  function render(opts) {
    last = opts;
    const box = map();
    if (!box) return;
    clear();

    if (opts.town !== MAP_TOWN) {
      box.append(el('div', 'map__empty', `Mapa esquemático disponible para ${MAP_TOWN}.`));
      return;
    }

    document.getElementById('map-note').textContent = opts.role === 'analyst'
      ? 'Esquema · totales agregados por barrio'
      : 'Esquema · ubicación aproximada por barrio';

    // Outage zones: a municipio-wide outage covers every barrio.
    if (layers.zones && opts.outage) {
      for (const [name, [x, y]] of Object.entries(BARRIOS)) {
        const zone = el('span', 'map__zone');
        zone.title = `${name}: área con apagón`;
        place(zone, x, y);
        box.append(zone);
      }
    }

    for (const [name, [x, y]] of Object.entries(BARRIOS)) {
      const label = el('span', 'map__label', name);
      place(label, x, y + 5);
      box.append(label);
    }

    if (!layers.residents) return;

    if (opts.role === 'analyst') {
      for (const b of (opts.analytics && opts.analytics.rows) || []) {
        const pos = BARRIOS[b.barrio];
        if (!pos) continue;
        const bubble = el('div', 'map__bubble');
        bubble.title = `${b.label}: ${b.n} registrados`;
        bubble.append(el('span', 'map__bubble-n', String(b.n)));
        place(bubble, pos[0], pos[1]);
        box.append(bubble);
      }
      return;
    }

    const slots = {};
    for (const r of opts.rows || []) {
      const pos = BARRIOS[r.barrio];
      if (!pos) continue;
      const n = (slots[r.barrio] = (slots[r.barrio] || 0) + 1);
      const [ox, oy] = OFFSETS[(n - 1) % OFFSETS.length];

      const pin = el('button', `map__pin map__pin--${r.status}${r.power === 'confirmed' ? ' is-confirmed' : ''}`);
      pin.type = 'button';
      pin.title = `${r.name} · ${STATUS_LABEL[r.status] || ''}`;
      pin.setAttribute('aria-label', pin.title);
      if (ICONS[r.status]) {
        const img = el('img');
        img.src = ICONS[r.status];
        img.alt = '';
        pin.append(img);
      }
      pin.addEventListener('click', () => opts.onOpen(r.id));
      place(pin, pos[0] + ox, pos[1] + oy);
      box.append(pin);
    }
  }

  function bindToggle(id, key) {
    const btn = document.getElementById(id);
    btn.addEventListener('click', () => {
      layers[key] = !layers[key];
      btn.classList.toggle('is-on', layers[key]);
      btn.setAttribute('aria-pressed', String(layers[key]));
      if (last) render(last);
    });
  }

  bindToggle('toggle-zones', 'zones');
  bindToggle('toggle-residents', 'residents');

  window.EVMap = { render };
})();