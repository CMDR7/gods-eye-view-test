const ADSB_API_BASE = 'https://api.adsb.lol/v2';
const AIRPLANES_LIVE_API_BASE = 'https://api.airplanes.live/v2';
const FEET_TO_METERS = 0.3048;
const KNOTS_TO_MPS = 0.5144444444;
const FEET_PER_MIN_TO_MPS = FEET_TO_METERS / 60;

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function booleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return /^(true|1|yes|military|pia|ladd)$/i.test(value.trim());
  return false;
}

function getRelayBase() {
  const meta = document.querySelector('meta[name="gev-aircraft-relay"]');
  const value = meta?.content?.trim();
  if (!value) return '';
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol !== 'https:' && url.origin !== window.location.origin) return '';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function normalizeAircraft(raw, observedAt = new Date().toISOString()) {
  const latitude = finiteNumber(raw?.lat);
  const longitude = finiteNumber(raw?.lon);
  const barometricFeet = finiteNumber(raw?.alt_baro);
  const geometricFeet = finiteNumber(raw?.alt_geom);
  const groundSpeedKnots = finiteNumber(raw?.gs);
  const verticalRateFeetPerMinute = finiteNumber(raw?.baro_rate ?? raw?.geom_rate ?? raw?.vert_rate);
  const track = finiteNumber(raw?.track ?? raw?.track_deg);
  const seen = finiteNumber(raw?.seen);
  const seenPosition = finiteNumber(raw?.seen_pos);
  const positionEpoch = finiteNumber(raw?.pos_epoch);
  const lastPosition = positionEpoch !== null ? new Date(positionEpoch * 1000).toISOString() : observedAt;

  return {
    type: 'AIRCRAFT',
    identity: {
      icaoHex: cleanString(raw?.hex),
      callsign: cleanString(raw?.flight),
      registration: cleanString(raw?.r ?? raw?.reg),
      typeCode: cleanString(raw?.t),
      typeDescription: cleanString(raw?.desc),
      category: cleanString(raw?.category),
      airline: cleanString(raw?.airline),
      route: cleanString(raw?.route),
    },
    position: {
      latitude,
      longitude,
      altitudeBarometricM: barometricFeet !== null ? barometricFeet * FEET_TO_METERS : null,
      altitudeGeometricM: geometricFeet !== null ? geometricFeet * FEET_TO_METERS : null,
      observedAt: lastPosition,
    },
    motion: {
      groundSpeedMps: groundSpeedKnots !== null ? groundSpeedKnots * KNOTS_TO_MPS : null,
      groundSpeedKnots,
      trackDeg: track,
      verticalRateMps: verticalRateFeetPerMinute !== null ? verticalRateFeetPerMinute * FEET_PER_MIN_TO_MPS : null,
      verticalRateFeetPerMinute,
      trueHeadingDeg: finiteNumber(raw?.true_heading ?? raw?.heading),
      magneticHeadingDeg: finiteNumber(raw?.mag_heading),
      trackRateDegPerSecond: finiteNumber(raw?.track_rate),
      rollDeg: finiteNumber(raw?.roll),
    },
    navigation: {
      selectedAltitudeMcpM: finiteNumber(raw?.nav_altitude_mcp) !== null ? finiteNumber(raw?.nav_altitude_mcp) * FEET_TO_METERS : null,
      selectedAltitudeFmsM: finiteNumber(raw?.nav_altitude_fms) !== null ? finiteNumber(raw?.nav_altitude_fms) * FEET_TO_METERS : null,
      selectedHeadingDeg: finiteNumber(raw?.nav_heading),
      modes: Array.isArray(raw?.nav_modes) ? [...raw.nav_modes] : [],
    },
    signal: {
      source: cleanString(raw?.src ?? raw?.source),
      rssi: finiteNumber(raw?.rssi),
      messageCount: finiteNumber(raw?.messages),
      lastSeenSec: seen,
      positionAgeSec: seenPosition,
      lastSeenAt: seen !== null ? new Date(Date.now() - seen * 1000).toISOString() : observedAt,
    },
    integrity: {
      nacP: finiteNumber(raw?.nac_p),
      nacV: finiteNumber(raw?.nac_v),
      nicBaro: finiteNumber(raw?.nic_baro),
      sil: finiteNumber(raw?.sil),
      rcM: finiteNumber(raw?.rc),
    },
    flags: {
      military: booleanFlag(raw?.mil) || booleanFlag(raw?.military),
      pia: booleanFlag(raw?.pia),
      ladd: booleanFlag(raw?.ladd),
    },
    transponder: {
      squawk: cleanString(raw?.squawk),
      adsbVersion: cleanString(raw?.version ?? raw?.adsb_version),
      emergency: cleanString(raw?.emergency),
    },
    environment: {
      qnhHpa: finiteNumber(raw?.nav_qnh),
      windSpeedKnots: finiteNumber(raw?.wd),
      windDirectionDeg: finiteNumber(raw?.ws),
      outsideAirTemperatureC: finiteNumber(raw?.oat),
      trueAirTemperatureC: finiteNumber(raw?.tat),
    },
    sourceRecord: {
      updatedAt: observedAt,
      rawPositionEpoch: positionEpoch,
    },
  };
}

async function requestAircraftPayload(url) {
  const response = await fetch(url, {
    mode: 'cors',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function normalizePayload(payload, provider, observedAt, latitude, longitude, radius) {
  const aircraft = (payload?.ac ?? [])
    .map((raw) => normalizeAircraft(raw, observedAt))
    .filter((item) => Number.isFinite(item.position.latitude) && Number.isFinite(item.position.longitude));
  return { observedAt, latitude, longitude, radiusNm: radius, provider, aircraft };
}

export async function fetchAircraftSnapshot(latitude, longitude, radiusNm = 250) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const radius = Math.min(250, Math.max(1, Number(radiusNm) || 250));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('INVALID AIRCRAFT QUERY LATITUDE');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('INVALID AIRCRAFT QUERY LONGITUDE');

  const observedAt = new Date().toISOString();
  const path = `/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radius}`;
  const relayBase = getRelayBase();
  const providers = [];

  if (relayBase) providers.push(['GEV RELAY', `${relayBase}/aircraft?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&radius=${radius}`]);
  providers.push(
    ['ADSB.LOL', `${ADSB_API_BASE}${path}`],
    ['AIRPLANES.LIVE', `${AIRPLANES_LIVE_API_BASE}${path}`],
  );

  let lastError = null;

  for (const [provider, url] of providers) {
    try {
      const payload = await requestAircraftPayload(url);
      const result = normalizePayload(payload, payload?.provider || provider, observedAt, lat, lon, radius);
      if (result.aircraft.length > 0 || provider === providers[providers.length - 1][0]) return result;
    } catch (error) {
      lastError = error;
      console.warn(`[GEV] ${provider} aircraft request failed`, error);
    }
  }

  if (relayBase) throw lastError || new Error('AIRCRAFT RELAY UNAVAILABLE');
  throw new Error('AIRCRAFT RELAY NOT CONFIGURED // DIRECT PROVIDERS ARE BROWSER-BLOCKED');
}
