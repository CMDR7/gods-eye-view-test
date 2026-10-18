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

function getAircraftLayers(scene) {
  return (scene?.dataSources?.values || []).filter((dataSource) =>
    dataSource?.name === 'civilianAircraft' || dataSource?.name === 'militaryAircraft'
  );
}

function getSelectedTargetId() {
  const panel = document.getElementById('targetPanel');
  if (!panel || panel.hidden) return null;
  const value = document.getElementById('targetId')?.textContent?.trim();
  return value || null;
}

function patchAircraftEntity(entity) {
  if (!entity?.gevMeta || entity.gevMeta.type !== 'AIRCRAFT') return;
  if (entity.point) entity.point.disableDepthTestDistance = 0;
  if (!entity.label) return;

  const classification = entity.gevMeta.classification === 'military' ? 'military' : 'civilian';
  entity.label.show = false;
  entity.label.text = entity.gevMeta.callsign || entity.gevMeta.name || entity.gevMeta.hex || 'AIR';
  entity.label.font = '11px monospace';
  entity.label.fillColor = classification === 'military' ? Cesium.Color.ORANGE : Cesium.Color.CYAN;
  entity.label.showBackground = true;
  entity.label.backgroundColor = Cesium.Color.BLACK.withAlpha(0.72);
  entity.label.backgroundPadding = new Cesium.Cartesian2(5, 3);
  entity.label.pixelOffset = new Cesium.Cartesian2(8, 0);
  entity.label.disableDepthTestDistance = 0;
}

function syncAircraftLabels(layers) {
  const selectedId = getSelectedTargetId();
  for (const layer of layers) {
    for (const entity of layer.entities.values) {
      if (!entity?.gevMeta || entity.gevMeta.type !== 'AIRCRAFT') continue;
      patchAircraftEntity(entity);
      const id = String(entity.gevMeta.id ?? entity.id ?? '');
      if (entity.label && selectedId && id === selectedId) {
        entity.label.show = true;
      }
    }
  }
}

function install(attempt = 0) {
  installStyles();
  const scene = document.querySelector('#globe canvas')?.__gevScene || null;
  const layers = getAircraftLayers(scene);

  if (layers.length) {
    syncAircraftLabels(layers);
    for (const layer of layers) {
      layer.entities.collectionChanged.addEventListener(() => syncAircraftLabels(layers));
    }

    const panel = document.getElementById('targetPanel');
    const observer = panel
      ? new MutationObserver(() => syncAircraftLabels(layers))
      : null;
    if (observer && panel) observer.observe(panel, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });

    return;
  }

  if (attempt < 600) requestAnimationFrame(() => install(attempt + 1));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
else install();
