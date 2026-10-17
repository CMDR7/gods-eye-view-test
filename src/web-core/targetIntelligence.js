import * as satellite from 'satellite.js';

const AIRCRAFT_CACHE_TTL_MS = 60_000;
const SATELLITE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
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

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

async function fetchJson(url) {
  const response = await fetch(url, { mode: 'cors', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function normalizedAircraftDetails(hex) {
  const snapshot = window.__gevAircraftSnapshot;
  const aircraft = snapshot?.aircraft?.find((item) => String(item.identity?.icaoHex || '').toUpperCase() === String(hex || '').toUpperCase());
  if (!aircraft) return null;

  const speed = aircraft.motion?.groundSpeedKnots;
  const track = aircraft.motion?.trackDeg;
  const verticalRate = aircraft.motion?.verticalRateFeetPerMinute;
  const altitude = aircraft.position?.altitudeBarometricM;
  const geometricAltitude = aircraft.position?.altitudeGeometricM;

  return {
    callsign: aircraft.identity?.callsign || '—',
    hex: aircraft.identity?.icaoHex || hex || '—',
    registration: aircraft.identity?.registration || '—',
    type: aircraft.identity?.typeCode || '—',
    typeDescription: aircraft.identity?.typeDescription || '—',
    squawk: aircraft.transponder?.squawk || '—',
    category: aircraft.identity?.category || '—',
    speed: Number.isFinite(Number(speed)) ? `${formatNumber(speed, 0)} KT` : '—',
    track: Number.isFinite(Number(track)) ? `${formatNumber(track, 1)}°` : '—',
    verticalRate: Number.isFinite(Number(verticalRate)) ? `${formatNumber(verticalRate, 0)} FT/MIN` : '—',
    altitude: Number.isFinite(Number(altitude)) ? `${formatNumber(Number(altitude) / 0.3048, 0)} FT` : '—',
    geometricAltitude: Number.isFinite(Number(geometricAltitude)) ? `${formatNumber(Number(geometricAltitude) / 0.3048, 0)} FT` : '—',
    source: aircraft.signal?.source || '—',
    positionAge: Number.isFinite(Number(aircraft.signal?.positionAgeSec)) ? `${formatNumber(aircraft.signal.positionAgeSec, 1)} S` : '—',
    military: aircraft.flags?.military ? 'YES' : 'NO',
    pia: aircraft.flags?.pia ? 'YES' : 'NO',
  };
}

async function aircraftDetails(hex) {
  const key = `aircraft:${hex}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < AIRCRAFT_CACHE_TTL_MS) return cached.data;

  const normalized = normalizedAircraftDetails(hex);
  if (normalized) {
    cache.set(key, { time: Date.now(), data: normalized });
    return normalized;
  }

  const payload = await fetchJson(`https://api.adsb.lol/v2/hex/${encodeURIComponent(hex)}`);
  const aircraft = payload?.ac?.[0];
  if (!aircraft) throw new Error('AIRCRAFT RECORD NOT FOUND');

  const data = {
    callsign: aircraft.flight?.trim() || '—',
    hex: aircraft.hex || hex || '—',
    registration: aircraft.r || aircraft.reg || '—',
    type: aircraft.t || '—',
    typeDescription: aircraft.desc || '—',
    squawk: aircraft.squawk || '—',
    category: aircraft.category || '—',
    speed: Number.isFinite(Number(aircraft.gs)) ? `${formatNumber(aircraft.gs, 0)} KT` : '—',
    track: Number.isFinite(Number(aircraft.track)) ? `${formatNumber(aircraft.track, 1)}°` : '—',
    verticalRate: Number.isFinite(Number(aircraft.baro_rate ?? aircraft.vert_rate)) ? `${formatNumber(aircraft.baro_rate ?? aircraft.vert_rate, 0)} FT/MIN` : '—',
    altitude: Number.isFinite(Number(aircraft.alt_baro)) ? `${formatNumber(aircraft.alt_baro, 0)} FT` : '—',
    geometricAltitude: Number.isFinite(Number(aircraft.alt_geom)) ? `${formatNumber(aircraft.alt_geom, 0)} FT` : '—',
    source: aircraft.src || aircraft.source || '—',
    positionAge: Number.isFinite(Number(aircraft.seen_pos)) ? `${formatNumber(aircraft.seen_pos, 1)} S` : '—',
    military: aircraft.mil ? 'YES' : 'NO',
    pia: aircraft.pia ? 'YES' : 'NO',
  };
  cache.set(key, { time: Date.now(), data });
  return data;
}

async function satelliteDetails(norad) {
  const key = `satellite:${norad}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < SATELLITE_CACHE_TTL_MS) return cached.data;

  const response = await fetchJson(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${encodeURIComponent(norad)}&FORMAT=JSON`);
  const omm = Array.isArray(response) ? response[0] : response;
  if (!omm || !omm.NORAD_CAT_ID) throw new Error('SATELLITE RECORD NOT FOUND');

  const satrec = satellite.json2satrec(omm);
  const now = new Date();
  const position = satellite.propagate(satrec, now);
  const gmst = satellite.gstime(now);
  const geo = position?.position && typeof position.position !== 'boolean'
    ? satellite.eciToGeodetic(position.position, gmst)
    : null;

  const data = {
    name: omm.OBJECT_NAME || 'UNKNOWN SATELLITE',
    norad: String(omm.NORAD_CAT_ID),
    altitude: geo ? `${formatNumber(geo.height, 0)} KM` : '—',
    inclination: Number.isFinite(Number(omm.INCLINATION)) ? `${formatNumber(omm.INCLINATION, 2)}°` : '—',
    eccentricity: Number.isFinite(Number(omm.ECCENTRICITY)) ? Number(omm.ECCENTRICITY).toFixed(6) : '—',
    period: Number.isFinite(Number(omm.MEAN_MOTION)) && Number(omm.MEAN_MOTION) > 0
      ? `${formatNumber(1440 / Number(omm.MEAN_MOTION), 1)} MIN` : '—',
    epoch: formatTimestamp(omm.EPOCH),
  };
  cache.set(key, { time: Date.now(), data });
  return data;
}

function earthquakeDetails() {
  const raw = $('targetDetailValue')?.textContent || '';
  const magnitude = raw.match(/M\s*([\d.]+)/i)?.[1];
  const depth = raw.match(/\/\s*([\d.]+)\s*KM/i)?.[1];
  return {
    magnitude: magnitude ? `M${magnitude}` : '—',
    depth: depth ? `${depth} KM` : '—',
    eventId: $('targetId')?.textContent?.trim() || '—',
    location: $('targetName')?.textContent?.trim() || '—',
    updated: $('targetUpdated')?.textContent?.trim() || '—',
    source: $('targetSource')?.textContent?.trim() || 'USGS',
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
        { label: 'ICAO HEX', value: data.hex },
        { label: 'REGISTRATION', value: data.registration },
        { label: 'TYPE', value: data.typeDescription !== '—' ? `${data.type} // ${data.typeDescription}` : data.type },
        { label: 'GROUND SPEED', value: data.speed },
        { label: 'TRACK', value: data.track },
        { label: 'VERT RATE', value: data.verticalRate },
        { label: 'POSITION AGE', value: data.positionAge },
      ]);
    } else if (type === 'SATELLITE') {
      const data = await satelliteDetails(id);
      if (serial !== requestSerial) return;
      renderDetails([
        { label: 'NORAD', value: data.norad || id },
        { label: 'OBJECT', value: data.name },
        { label: 'ORBIT ALT', value: data.altitude },
        { label: 'INCLINATION', value: data.inclination },
        { label: 'ECCENTRICITY', value: data.eccentricity },
        { label: 'ORBIT PERIOD', value: data.period },
        { label: 'ELEMENT EPOCH', value: data.epoch },
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
