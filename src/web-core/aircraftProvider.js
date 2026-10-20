const ADSB_API_BASE = 'https://api.adsb.lol/v2';
const AIRPLANES_LIVE_API_BASE = 'https://api.airplanes.live/v2';
const FEET_TO_METERS = 0.3048;
const KNOTS_TO_MPS = 0.5144444444;
const FEET_PER_MIN_TO_MPS = FEET_TO_METERS / 60;
const EARTH_RADIUS_KM = 6371;
const NM_TO_KM = 1.852;

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

function distanceNm(lat1, lon1, lat2, lon2) {
  const phi1 = Number(lat1) * Math.PI / 180;
  const phi2 = Number(lat2) * Math.PI / 180;
  const deltaPhi = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const deltaLambda = (Number(lon2) - Number(lon1)) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return (EARTH_RADIUS_KM * c) / NM_TO_KM;
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

/**
 * The configured GEV relay already fans out to browser-blocked providers.
 * A valid empty relay snapshot is still a successful acquisition result.
 */
export function shouldAcceptAircraftResult(provider, aircraftCount, lastProvider) {
  return aircraftCount > 0 || provider === 'GEV RELAY' || provider === lastProvider;
}

export function formatAircraftProviderErrors(errors) {
  return errors
    .map(({ provider, message }) => `${provider}: ${message}`)
    .join(' | ');
}

export function normalizeAircraft(raw, observedAt = new Date().toISOString(), classification = 'civilian') {
  const latitude = finiteNumber(raw?.lat);
  const longitude = finiteNumber(raw?.lon);
  const barometricFeet = finiteNumber(raw?.alt_baro);
  const geometricFeet = finiteNumber(raw?.alt_geom);
  const groundSpeedKnots = finiteNumber(raw?.gs);
  const verticalRateFeetPerMinute = finiteNumber(raw?.baro_rate ?? raw?.geom_rate ?? raw?.vert_rate);
  const track = finiteNumber(raw?.track ?? raw?.track_deg ?? raw?.calc_track);
  const seen = finiteNumber(raw?.seen);
  const seenPosition = finiteNumber(raw?.seen_pos);
  const positionEpoch = finiteNumber(raw?.pos_epoch);
  const lastPosition = positionEpoch !== null ? new Date(positionEpoch * 1000).toISOString() : observedAt;
  const military = classification === 'military' || booleanFlag(raw?.mil) || booleanFlag(raw?.military);

  return {
    type: 'AIRCRAFT',
    classification: military ? 'military' : 'civilian',
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
      military,
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

function normalizePayload(payload, provider, observedAt, latitude, longitude, radius, classification) {
  const aircraft = (payload?.ac ?? [])
    .map((raw) => normalizeAircraft(raw, observedAt, classification))
    .filter((item) => Number.isFinite(item.position.latitude) && Number.isFinite(item.position.longitude))
    .filter((item) => distanceNm(latitude, longitude, item.position.latitude, item.position.longitude) <= radius)
    .filter((item) => classification === 'military' || !item.flags.military);
  return { observedAt, latitude, longitude, radiusNm: radius, provider, classification, aircraft };
}

export async function fetchAircraftSnapshot(latitude, longitude, radiusNm = 250, classification = 'civilian') {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const radius = Math.min(250, Math.max(1, Number(radiusNm) || 250));
  const mode = classification === 'military' ? 'military' : 'civilian';
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('INVALID AIRCRAFT QUERY LATITUDE');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('INVALID AIRCRAFT QUERY LONGITUDE');

  const observedAt = new Date().toISOString();
  const pointPath = `/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radius}`;
  const relayBase = getRelayBase();
  const providers = [];

  if (relayBase) {
    providers.push(['GEV RELAY', `${relayBase}/aircraft?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&radius=${radius}&mode=${mode}`]);
  }

  if (mode === 'military') {
    providers.push(['ADSB.LOL // MILITARY', `${ADSB_API_BASE}/mil`]);
  } else {
    providers.push(
      ['ADSB.LOL', `${ADSB_API_BASE}${pointPath}`],
      ['AIRPLANES.LIVE', `${AIRPLANES_LIVE_API_BASE}${pointPath}`],
    );
  }

  const providerErrors = [];
  const lastProvider = providers[providers.length - 1]?.[0];

  for (const [provider, url] of providers) {
    try {
      const payload = await requestAircraftPayload(url);
      const result = normalizePayload(payload, payload?.provider || provider, observedAt, lat, lon, radius, mode);
      if (shouldAcceptAircraftResult(provider, result.aircraft.length, lastProvider)) {
        return result;
      }
    } catch (error) {
      const message = String(error?.message || error || 'request failed');
      providerErrors.push({ provider, message });
      console.warn(`[GEV] ${provider} ${mode} aircraft request failed`, error);
    }
  }

  const detail = formatAircraftProviderErrors(providerErrors);
  if (detail) throw new Error(detail);
  if (relayBase) throw new Error(`AIRCRAFT ${mode.toUpperCase()} RELAY UNAVAILABLE`);
  throw new Error('AIRCRAFT RELAY NOT CONFIGURED // DIRECT PROVIDERS ARE BROWSER-BLOCKED');
}
