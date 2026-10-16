import * as satellite from 'satellite.js';

const CACHE_TTL_MS = 30_000;
const cache = new Map();
let requestSerial = 0;
let lastTargetKey = '';

const $ = (id) => document.getElementById(id);

function renderDetails(items) {
  const detail = $('targetDetail');
  if (!detail) return;
  const slots = detail.querySelectorAll('.targetDetailItem');
  slots.forEach((slot, index) => {
    const item = items[index];
    slot.hidden = !item;
    if (!item) return;
    const label = slot.querySelector('[data-detail-label]');
    const value = slot.querySelector('[data-detail-value]');
    if (label) label.textContent = item.label;
    if (value) value.textContent = item.value ?? '—';
  });
  detail.hidden = items.length === 0;
}

function formatNumber(value, digits = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString(undefined, { maximumFractionDigits: digits })
    : '—';
}

async function fetchJson(url) {
  const response = await fetch(url, { mode: 'cors', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function aircraftDetails(hex) {
  const key = `aircraft:${hex}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.data;

  const payload = await fetchJson(`https://api.adsb.lol/v2/hex/${encodeURIComponent(hex)}`);
  const aircraft = payload?.ac?.[0];
  if (!aircraft) throw new Error('AIRCRAFT RECORD NOT FOUND');

  const data = {
    callsign: aircraft.flight?.trim() || '—',
    registration: aircraft.r || aircraft.reg || '—',
    type: aircraft.t || '—',
    squawk: aircraft.squawk || '—',
    category: aircraft.category || '—',
    speed: Number.isFinite(Number(aircraft.gs)) ? `${formatNumber(aircraft.gs, 0)} KT` : '—',
    track: Number.isFinite(Number(aircraft.track)) ? `${formatNumber(aircraft.track, 1)}°` : '—',
    verticalRate: Number.isFinite(Number(aircraft.baro_rate)) ? `${formatNumber(aircraft.baro_rate * 0.00508, 1)} M/S` : '—',
  };
  cache.set(key, { time: Date.now(), data });
  return data;
}

async function satelliteDetails(norad) {
  const key = `satellite:${norad}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.data;

  const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', {
    mode: 'cors',
    headers: { Accept: 'text/plain' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const lines = (await response.text()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let match;
  for (let i = 0; i + 2 < lines.length; i += 3) {
    if (!lines[i + 1]?.startsWith('1 ') || !lines[i + 2]?.startsWith('2 ')) continue;
    const currentNorad = lines[i + 1].slice(2, 7).trim();
    if (currentNorad === String(norad)) {
      match = [lines[i], lines[i + 1], lines[i + 2]];
      break;
    }
  }
  if (!match) throw new Error('TLE RECORD NOT FOUND');

  const satrec = satellite.twoline2satrec(match[1], match[2]);
  const now = new Date();
  const position = satellite.propagate(satrec, now);
  const gmst = satellite.gstime(now);
  const geo = position?.position && typeof position.position !== 'boolean'
    ? satellite.eciToGeodetic(position.position, gmst)
    : null;

  const data = {
    name: match[0],
    altitude: geo ? `${formatNumber(geo.height, 0)} KM` : '—',
    inclination: Number.isFinite(Number(satrec.inclo)) ? `${formatNumber(satrec.inclo * 180 / Math.PI, 2)}°` : '—',
    eccentricity: Number.isFinite(Number(satrec.ecco)) ? Number(satrec.ecco).toFixed(6) : '—',
    period: Number.isFinite(Number(satrec.no)) && satrec.no > 0 ? `${formatNumber((2 * Math.PI / satrec.no) / 60, 1)} MIN` : '—',
  };
  cache.set(key, { time: Date.now(), data });
  return data;
}

function earthquakeDetails() {
  const raw = $('targetDetailValue')?.textContent || '';
  const match = raw.match(/M\s*([\d.]+)\s*\/\s*([\d.]+)\s*KM/i);
  return {
    magnitude: match ? `M${match[1]}` : '—',
    depth: match ? `${match[2]} KM` : '—',
    eventId: $('targetId')?.textContent || '—',
    location: $('targetName')?.textContent || '—',
    updated: $('targetUpdated')?.textContent || '—',
    source: $('targetSource')?.textContent || 'USGS',
  };
}

function getTargetKey() {
  const panel = $('targetPanel');
  if (!panel || panel.hidden) return '';
  const type = $('targetType')?.textContent?.trim() || '';
  const id = $('targetId')?.textContent?.trim() || '';
  return type && id && id !== '—' ? `${type}:${id}` : '';
}

async function enrichTarget(targetKey) {
  const panel = $('targetPanel');
  if (!panel || panel.hidden) return;
  const [type, ...idParts] = targetKey.split(':');
  const id = idParts.join(':');
  const serial = ++requestSerial;

  if (type === 'EARTHQUAKE') {
    const eq = earthquakeDetails();
    renderDetails([
      { label: 'MAGNITUDE', value: eq.magnitude },
      { label: 'DEPTH', value: eq.depth },
      { label: 'EVENT ID', value: eq.eventId },
      { label: 'LOCATION', value: eq.location },
      { label: 'UPDATED', value: eq.updated },
      { label: 'SOURCE', value: eq.source },
    ]);
    return;
  }

  renderDetails([{ label: 'INTELLIGENCE', value: 'LOADING…' }]);
  try {
    if (type === 'AIRCRAFT') {
      const data = await aircraftDetails(id);
      if (serial !== requestSerial) return;
      renderDetails([
        { label: 'CALLSIGN', value: data.callsign },
        { label: 'REGISTRATION', value: data.registration },
        { label: 'TYPE', value: data.type },
        { label: 'SQUAWK', value: data.squawk },
        { label: 'CATEGORY', value: data.category },
        { label: 'GROUND SPEED', value: data.speed },
        { label: 'TRACK', value: data.track },
        { label: 'VERT RATE', value: data.verticalRate },
      ]);
    } else if (type === 'SATELLITE') {
      const data = await satelliteDetails(id);
      if (serial !== requestSerial) return;
      renderDetails([
        { label: 'NORAD', value: id },
        { label: 'OBJECT', value: data.name },
        { label: 'ORBIT ALT', value: data.altitude },
        { label: 'INCLINATION', value: data.inclination },
        { label: 'ECCENTRICITY', value: data.eccentricity },
        { label: 'ORBIT PERIOD', value: data.period },
      ]);
    }
  } catch (error) {
    if (serial !== requestSerial) return;
    console.warn('[GEV] Target intelligence unavailable', error);
    renderDetails([{ label: 'INTELLIGENCE', value: 'LIVE DETAIL UNAVAILABLE' }]);
  }
}

function observeTargetPanel() {
  const panel = $('targetPanel');
  if (!panel) return;

  const check = () => {
    const key = getTargetKey();
    if (!key) {
      lastTargetKey = '';
      return;
    }
    if (key === lastTargetKey) return;
    lastTargetKey = key;
    window.clearTimeout(observeTargetPanel.timer);
    observeTargetPanel.timer = window.setTimeout(() => enrichTarget(key), 50);
  };

  const observer = new MutationObserver(check);
  observer.observe(panel, { attributes: true, childList: true, subtree: true, characterData: true });
  check();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeTargetPanel, { once: true });
} else {
  observeTargetPanel();
}
