// LUMA regional outage feed (unofficial public endpoint). Server-side only: polled every 5 min,
// cached, validated, and labeled stale/unavailable. It is an indicator, never an escalation trigger.
const SOURCE_URL = 'https://api.miluma.lumapr.com/miluma-outage-api/outage/regionsWithoutService';
const POLL_MS = 5 * 60 * 1000;
const STALE_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 8000;

// Municipio -> LUMA region (names as LUMA spells them). Unmapped towns show "Región no disponible".
// San Sebastián -> Mayagüez: verify against LUMA's official region map before presenting.
const REGION_BY_MUNICIPIO = Object.freeze({
  'San Sebastián': 'Mayaguez',
  Caguas: 'Caguas',
  Carolina: 'Carolina',
});
const DISPLAY_NAMES = Object.freeze({ Mayaguez: 'Mayagüez', Bayamon: 'Bayamón' });

const cache = { data: null, fetchedAt: 0, error: null };
let timer = null;

function isValid(data) {
  return data && Array.isArray(data.regions) && data.regions.every((r) =>
    typeof r.name === 'string' && Number.isFinite(r.totalClients) && Number.isFinite(r.totalClientsWithoutService));
}

async function poll() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SOURCE_URL, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!isValid(data)) throw new Error('Unexpected response shape');
    cache.data = data;
    cache.fetchedAt = Date.now();
    cache.error = null;
  } catch (err) {
    cache.error = err.message;
    console.warn('[luma] feed unavailable:', err.message);
  } finally {
    clearTimeout(t);
  }
}

function start() {
  if (timer) return;
  poll();
  timer = setInterval(poll, POLL_MS);
}

// "10/09/2026 07:50 AM" -> "7:50 AM" (LUMA reports Puerto Rico local time).
function shortTime(lumaTimestamp) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(lumaTimestamp || '');
  return m ? `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}` : null;
}

// Summary for one municipio (or island totals when municipioName is null).
function summaryFor(municipioName) {
  if (!cache.data) return { status: 'unavailable', region: null, lumaTimestamp: null, fetchedAt: null };

  const status = Date.now() - cache.fetchedAt > STALE_MS ? 'stale' : 'live';
  const base = { status, lumaTimestamp: shortTime(cache.data.timestamp), fetchedAt: new Date(cache.fetchedAt).toISOString() };

  if (!municipioName) {
    const t = cache.data.totals || {};
    return { ...base, region: {
      name: 'Puerto Rico (total)', withoutService: t.totalClientsWithoutService ?? 0,
      total: t.totalClients ?? 0, pct: t.totalPercentageWithoutService ?? 0,
    } };
  }

  const regionKey = REGION_BY_MUNICIPIO[municipioName];
  const r = regionKey && cache.data.regions.find((x) => x.name === regionKey);
  if (!r) return { ...base, region: null };
  return { ...base, region: {
    name: `${DISPLAY_NAMES[r.name] || r.name} (incluye ${municipioName})`,
    withoutService: r.totalClientsWithoutService, total: r.totalClients, pct: r.percentageClientsWithoutService,
  } };
}

module.exports = { start, summaryFor };