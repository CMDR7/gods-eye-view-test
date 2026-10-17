import * as Cesium from 'cesium';

const MOTION_CAP_SECONDS = 75;
const EARTH_RADIUS_M = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function destinationFromVector(latitudeDeg, longitudeDeg, altitudeM, distanceM, bearingDeg, verticalRateMps, elapsedSeconds) {
  const latitude = latitudeDeg * DEG_TO_RAD;
  const longitude = longitudeDeg * DEG_TO_RAD;
  const bearing = bearingDeg * DEG_TO_RAD;
  const angularDistance = distanceM / EARTH_RADIUS_M;
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinAngular = Math.sin(angularDistance);
  const cosAngular = Math.cos(angularDistance);

  const nextLatitude = Math.asin(
    Math.max(-1, Math.min(1, sinLat * cosAngular + cosLat * sinAngular * Math.cos(bearing)))
  );
  const nextLongitude = longitude + Math.atan2(
    Math.sin(bearing) * sinAngular * cosLat,
    cosAngular - sinLat * Math.sin(nextLatitude)
  );
  const nextAltitude = altitudeM + (verticalRateMps || 0) * elapsedSeconds;

  return Cesium.Cartesian3.fromDegrees(
    nextLongitude * RAD_TO_DEG,
    nextLatitude * RAD_TO_DEG,
    Math.max(0, nextAltitude),
  );
}

export function attachAircraftMotion(entity) {
  const meta = entity?.gevMeta;
  const position = meta?.position;
  const motion = meta?.motion;
  if (!entity || meta?.type !== 'AIRCRAFT' || !position || !motion || entity.__gevAircraftMotion) return;
  if (![position.latitude, position.longitude, position.altitudeBarometricM, motion.groundSpeedMps, motion.trackDeg]
    .every((value) => Number.isFinite(Number(value)))) return;

  const observedAt = new Date(position.observedAt || meta.updated || Date.now()).getTime();
  if (!Number.isFinite(observedAt)) return;

  entity.__gevAircraftMotion = true;
  entity.position = new Cesium.CallbackPositionProperty((time, result) => {
    const now = Cesium.JulianDate.toDate(time).getTime();
    const elapsed = Math.max(0, Math.min(MOTION_CAP_SECONDS, (now - observedAt) / 1000));
    const distance = Number(motion.groundSpeedMps) * elapsed;
    const altitude = Number(position.altitudeBarometricM ?? position.altitudeGeometricM ?? 0);
    const predicted = destinationFromVector(
      Number(position.latitude),
      Number(position.longitude),
      altitude,
      distance,
      Number(motion.trackDeg),
      Number(motion.verticalRateMps || 0),
      elapsed,
    );
    if (result) return Cesium.Cartesian3.clone(predicted, result);
    return predicted;
  }, false);
}

function install(attempt = 0) {
  const scene = document.querySelector('#globe canvas')?.__gevScene || null;
  const aircraftLayer = scene?.__gevWebCoreLayers?.get('aircraft');

  if (aircraftLayer) {
    for (const entity of aircraftLayer.dataSource.entities.values) attachAircraftMotion(entity);
    aircraftLayer.dataSource.entities.collectionChanged.addEventListener((_collection, added) => {
      for (const entity of added) attachAircraftMotion(entity);
    });
    return;
  }

  if (attempt < 600) requestAnimationFrame(() => install(attempt + 1));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => install(), { once: true });
} else {
  install();
}
