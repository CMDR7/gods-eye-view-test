import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/web-core/main.js';
let text = await readFile(path, 'utf8');

if (!text.includes('function addTelemetryHud()')) {
  const marker = 'async function boot() {';
  const telemetry = `function addTelemetryHud() {
  const hud = document.createElement('section');
  hud.className = 'telemetryHud';
  hud.setAttribute('aria-label', 'Camera telemetry');

  const labels = ['LAT', 'LON', 'ALT', 'HDG', 'RNG'];
  labels.forEach((label) => {
    const item = document.createElement('div');
    item.className = 'telemetryReadout';
    const title = document.createElement('span');
    title.textContent = label;
    const value = document.createElement('strong');
    value.dataset.telemetry = label;
    value.textContent = '—';
    item.append(title, value);
    hud.appendChild(item);
  });
  document.body.appendChild(hud);

  const style = document.createElement('style');
  style.textContent = [
    '.telemetryHud {',
    '  position: fixed;',
    '  z-index: 20;',
    '  left: 50%;',
    '  bottom: calc(12px + env(safe-area-inset-bottom));',
    '  transform: translateX(-50%);',
    '  width: min(620px, calc(100vw - 24px));',
    '  display: grid;',
    '  grid-template-columns: repeat(5, minmax(0, 1fr));',
    '  gap: 5px;',
    '  padding: 5px;',
    '  border: 1px solid rgba(80, 210, 255, .2);',
    '  border-radius: 8px;',
    '  background: rgba(3, 9, 13, .64);',
    '  box-shadow: 0 8px 28px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(130, 235, 255, .12);',
    '  backdrop-filter: blur(12px) saturate(120%);',
    '  -webkit-backdrop-filter: blur(12px) saturate(120%);',
    '  pointer-events: none;',
    '  user-select: none;',
    '}',
    '.telemetryReadout {',
    '  min-width: 0;',
    '  padding: 5px 6px 4px;',
    '  border: 1px solid rgba(100, 220, 255, .09);',
    '  border-radius: 5px;',
    '  background: rgba(0, 0, 0, .22);',
    '  box-shadow: inset 0 1px 0 rgba(120, 230, 255, .07);',
    '}',
    '.telemetryReadout span {',
    '  display: block;',
    '  margin-bottom: 3px;',
    '  font: 600 7px/1 Orbitron, sans-serif;',
    '  letter-spacing: .12em;',
    '  color: #647b86;',
    '}',
    '.telemetryReadout strong {',
    '  display: block;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '  font: 600 9px/1.1 Orbitron, sans-serif;',
    '  letter-spacing: .02em;',
    '  color: #dffaff;',
    '  text-shadow: 0 0 8px rgba(90, 220, 255, .18);',
    '}',
    '@media (max-width: 520px) {',
    '  .telemetryHud { bottom: calc(8px + env(safe-area-inset-bottom)); width: calc(100vw - 16px); gap: 3px; padding: 4px; }',
    '  .telemetryReadout { padding: 4px 4px 3px; }',
    '  .telemetryReadout span { font-size: 6px; }',
    '  .telemetryReadout strong { font-size: 7px; }',
    '}',
  ].join('\\n');
  document.head.appendChild(style);

  const fields = Object.fromEntries(
    labels.map((key) => [key, hud.querySelector('[data-telemetry="' + key + '"]')]),
  );
  const formatTelemetry = (value, digits = 1) => Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
    : '—';

  const update = () => {
    const camera = state.viewer?.camera;
    const scene = state.viewer?.scene;
    if (!camera || !scene) return;

    const cartographic = camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const heading = Cesium.Math.toDegrees(Cesium.Math.zeroToTwoPi(camera.heading));
    const altitude = cartographic.height;

    fields.LAT.textContent = Math.abs(lat).toFixed(4) + '° ' + (lat >= 0 ? 'N' : 'S');
    fields.LON.textContent = Math.abs(lon).toFixed(4) + '° ' + (lon >= 0 ? 'E' : 'W');
    fields.ALT.textContent = formatTelemetry(altitude, 0) + ' M';
    fields.HDG.textContent = formatTelemetry(heading, 0) + '°';

    let range = Number.NaN;
    try {
      const center = new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
      const ray = camera.getPickRay(center);
      const surface = ray ? scene.globe.pick(ray, scene) : undefined;
      if (surface) range = Cesium.Cartesian3.distance(camera.position, surface);
    } catch {
      range = Number.NaN;
    }
    fields.RNG.textContent = Number.isFinite(range)
      ? formatTelemetry(range / 1000, range >= 100000 ? 0 : 1) + ' KM'
      : '—';
  };

  let queued = false;
  const queueUpdate = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };

  state.viewer.camera.changed.addEventListener(queueUpdate);
  state.viewer.camera.moveEnd.addEventListener(queueUpdate);
  state.viewer.scene.postRender.addEventListener(update);
  update();
}

`;

  if (!text.includes(marker)) throw new Error('Boot marker not found.');
  text = text.replace(marker, telemetry + marker, 1);
}

const metaMarker = "  entity.gevMeta = {\n    type: metadata.type || layer.name,";
if (text.includes(metaMarker) && !text.includes('    layerId: layer.id,')) {
  text = text.replace(metaMarker, "  entity.gevMeta = {\n    layerId: layer.id,\n    type: metadata.type || layer.name,", 1);
}

const bootMarker = "  state.viewer.scene.requestRender();\n\n  addLayer('aircraft'";
if (!text.includes(bootMarker)) throw new Error('Boot render marker not found.');
if (!text.includes("  addTelemetryHud();\n\n  addLayer('aircraft'")) {
  text = text.replace(bootMarker, "  state.viewer.scene.requestRender();\n  addTelemetryHud();\n\n  addLayer('aircraft'", 1);
}

await writeFile(path, text);
console.log('Stage 2B telemetry HUD patch applied.');
