const MIN_RADIUS_NM = 10;
const MAX_RADIUS_NM = 250;
const METERS_PER_NAUTICAL_MILE = 1852;
const EARTH_RADIUS_M = 6371008.8;

function requestedScope(req) {
  const url = new URL(req?.url || '/', 'http://localhost');
  const latitude = Number(url.searchParams.get('lat'));
  const longitude = Number(url.searchParams.get('lon'));
  const radiusNm = Number(url.searchParams.get('radius_nm'));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    return null;
  if (!Number.isFinite(radiusNm)) return null;
  return {
    latitude,
    longitude,
    radiusNm: Math.min(MAX_RADIUS_NM, Math.max(MIN_RADIUS_NM, radiusNm)),
  };
}

function angularDistanceNm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const latA = (latitudeA * Math.PI) / 180;
  const latB = (latitudeB * Math.PI) / 180;
  const deltaLat = latB - latA;
  const deltaLon = ((longitudeB - longitudeA) * Math.PI) / 180;
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const a =
    sinLat * sinLat + Math.cos(latA) * Math.cos(latB) * sinLon * sinLon;
  const angular = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(Math.max(0, 1 - a)),
  );
  return (angular * EARTH_RADIUS_M) / METERS_PER_NAUTICAL_MILE;
}

export function scopeFlightPayload(payload, scope) {
  if (!scope || !payload || !Array.isArray(payload.states)) return payload;
  const states = payload.states.filter((state) => {
    const longitude = Number(state?.[5]);
    const latitude = Number(state?.[6]);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    )
      return false;
    return (
      angularDistanceNm(
        scope.latitude,
        scope.longitude,
        latitude,
        longitude,
      ) <= scope.radiusNm
    );
  });
  return { ...payload, states };
}

function adaptiveFlightScopeMiddleware(req, res, next) {
  const scope = requestedScope(req);
  if (!scope) return next();

  res.setHeader('X-Acquisition-Radius-Nm', scope.radiusNm.toFixed(1));
  const originalEnd = res.end.bind(res);
  res.end = (chunk, encoding, callback) => {
    if (chunk == null) return originalEnd(chunk, encoding, callback);
    try {
      const text = Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : String(chunk);
      const payload = JSON.parse(text);
      const scoped = scopeFlightPayload(payload, scope);
      const output = JSON.stringify(scoped);
      return originalEnd(output, encoding, callback);
    } catch {
      return originalEnd(chunk, encoding, callback);
    }
  };
  return next();
}

/**
 * Scope the existing OpenSky/fallback flight response to the viewport-derived
 * acquisition field. The upstream provider keeps its own cache and fallback
 * behavior; this adapter makes the returned aircraft set geographic rather
 * than renderer-wide, without changing provider credentials or polling.
 */
export function adaptiveOpenSkyProxy({ upstream } = {}) {
  const provider = upstream || { configureServer() {} };
  return {
    name: 'adaptive-flight-coverage',
    configureServer(server) {
      server.middlewares.use('/api/flights', adaptiveFlightScopeMiddleware);
      provider.configureServer?.(server);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/flights', adaptiveFlightScopeMiddleware);
      provider.configurePreviewServer?.(server);
    },
  };
}

export { MIN_RADIUS_NM, MAX_RADIUS_NM };
