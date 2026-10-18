import * as Cesium from 'cesium';

const STYLE_ID = 'gev-aircraft-button-colors';
const CIVILIAN = '#00eaff';
const MILITARY = '#ff9f2f';

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .controlStack button[data-layer="civilianAircraft"] {
      border-color: rgba(0,234,255,.55);
      color: ${CIVILIAN};
      box-shadow: inset 0 1px 0 rgba(190,250,255,.18), 0 0 12px rgba(0,234,255,.10);
    }
    .controlStack button[data-layer="civilianAircraft"]::before {
      background: ${CIVILIAN};
      box-shadow: 0 0 8px rgba(0,234,255,.55);
    }
    .controlStack button[data-layer="civilianAircraft"] .gevGlyph {
      color: ${CIVILIAN};
      filter: drop-shadow(0 0 4px rgba(0,234,255,.42));
    }
    .controlStack button[data-layer="civilianAircraft"].active {
      background: rgba(0,170,195,.22);
      border-color: ${CIVILIAN};
      box-shadow: inset 0 1px 0 rgba(220,255,255,.24), 0 0 16px rgba(0,234,255,.22);
    }

    .controlStack button[data-layer="militaryAircraft"] {
      border-color: rgba(255,159,47,.55);
      color: ${MILITARY};
      box-shadow: inset 0 1px 0 rgba(255,225,180,.16), 0 0 12px rgba(255,159,47,.10);
    }
    .controlStack button[data-layer="militaryAircraft"]::before {
      background: ${MILITARY};
      box-shadow: 0 0 8px rgba(255,159,47,.55);
    }
    .controlStack button[data-layer="militaryAircraft"] .gevGlyph {
      color: ${MILITARY};
      filter: drop-shadow(0 0 4px rgba(255,159,47,.42));
    }
    .controlStack button[data-layer="militaryAircraft"].active {
      background: rgba(180,90,10,.22);
      border-color: ${MILITARY};
      box-shadow: inset 0 1px 0 rgba(255,235,205,.24), 0 0 16px rgba(255,159,47,.22);
    }
  `;
  document.head.appendChild(style);
}

function patchAircraftEntity(entity) {
  if (!entity?.gevMeta || entity.gevMeta.type !== 'AIRCRAFT') return;
  if (entity.point) entity.point.disableDepthTestDistance = 0;
  if (entity.label) entity.label.show = false;
}

function install(attempt = 0) {
  installStyles();
  const scene = document.querySelector('#globe canvas')?.__gevScene || null;
  const layers = [
    scene?.__gevWebCoreLayers?.get('civilianAircraft'),
    scene?.__gevWebCoreLayers?.get('militaryAircraft'),
  ].filter(Boolean);

  if (layers.length) {
    for (const layer of layers) {
      for (const entity of layer.dataSource.entities.values) patchAircraftEntity(entity);
      layer.dataSource.entities.collectionChanged.addEventListener((_collection, added) => {
        for (const entity of added) patchAircraftEntity(entity);
      });
    }
    return;
  }
  if (attempt < 600) requestAnimationFrame(() => install(attempt + 1));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
else install();
