const GLYPHS = {
  home: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle class="glyph-ring glyph-ring--outer" cx="24" cy="24" r="15" />
      <circle class="glyph-core" cx="24" cy="24" r="3.2" />
      <path class="glyph-brackets" d="M7 17v-5h5 M36 12h5v5 M41 31v5h-5 M12 36H7v-5" />
      <path class="glyph-sweep" d="M24 5a19 19 0 0 1 17 11" />
    </svg>`,
  locate: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle class="glyph-ring glyph-ring--outer" cx="24" cy="24" r="12" />
      <circle class="glyph-core" cx="24" cy="24" r="3" />
      <path class="glyph-brackets" d="M18 7h-7v7 M30 7h7v7 M37 30v7h-7 M18 37h-7v-7" />
      <path class="glyph-cross" d="M24 4v9 M24 35v9 M4 24h9 M35 24h9" />
      <circle class="glyph-pulse" cx="24" cy="24" r="18" />
    </svg>`,
  coordinate: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect class="glyph-grid" x="9" y="9" width="30" height="30" rx="2" />
      <path class="glyph-grid" d="M9 19h30M9 29h30M19 9v30M29 9v30" />
      <circle class="glyph-core" cx="24" cy="24" r="4" />
      <path class="glyph-cross" d="M24 4v7 M24 37v7 M4 24h7 M37 24h7" />
    </svg>`,
  aircraft: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path class="glyph-airframe" d="M24 6l3 14 12 7-1.5 3-10.5-3.5v11L32 42h-3l-5-4-5 4h-3l5-4.5v-11L10.5 30 9 27l12-7z" />
      <path class="glyph-vector" d="M24 3v8" />
      <circle class="glyph-pulse" cx="24" cy="24" r="18" />
    </svg>`,
  satellites: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <ellipse class="glyph-orbit glyph-orbit--one" cx="24" cy="24" rx="19" ry="8" transform="rotate(-28 24 24)" />
      <ellipse class="glyph-orbit glyph-orbit--two" cx="24" cy="24" rx="19" ry="8" transform="rotate(28 24 24)" />
      <rect class="glyph-sat" x="20" y="20" width="8" height="8" rx="1" />
      <path class="glyph-sweep" d="M8 15a19 19 0 0 1 12-9" />
    </svg>`,
  earthquakes: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path class="glyph-seismic" d="M4 27h8l4-14 6 25 5-18 4 7h13" />
      <path class="glyph-seismic glyph-seismic--echo" d="M4 34h7l4-7 5 8 4-5 4 4h15" />
      <circle class="glyph-pulse" cx="24" cy="24" r="20" />
    </svg>`,
  ion: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path class="glyph-hex" d="M24 5l16 9v20l-16 9-16-9V14z" />
      <circle class="glyph-core" cx="24" cy="24" r="6" />
      <path class="glyph-orbit glyph-orbit--one" d="M7 24a17 7 0 1 0 34 0a17 7 0 1 0-34 0" />
      <path class="glyph-orbit glyph-orbit--two" d="M24 7a7 17 0 1 0 0 34a7 17 0 1 0 0-34" />
    </svg>`,
  terrain: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path class="glyph-contour" d="M6 34c5-8 10-8 15-1s10 7 21-5" />
      <path class="glyph-contour" d="M6 28c5-8 10-8 15-1s10 7 21-5" />
      <path class="glyph-contour" d="M6 22c5-8 10-8 15-1s10 7 21-5" />
      <path class="glyph-scan" d="M8 11h32" />
    </svg>`,
  visuals: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle class="glyph-ring" cx="24" cy="24" r="17" />
      <circle class="glyph-ring" cx="24" cy="24" r="11" />
      <circle class="glyph-core" cx="24" cy="24" r="3" />
      <path class="glyph-scan" d="M24 4v9 M24 35v9 M4 24h9 M35 24h9" />
      <path class="glyph-sweep" d="M24 7a17 17 0 0 1 15 9" />
    </svg>`,
};

const BUTTON_GLYPHS = [
  ['home', '#home', 'HOME // VIEW'],
  ['locate', '#locate', 'MY LOCATION'],
  ['coordinate', '#coordinateNav', 'COORDINATE NAV'],
  ['aircraft', '[data-layer="aircraft"]', 'AIRCRAFT'],
  ['satellites', '[data-layer="satellites"]', 'SATELLITES'],
  ['earthquakes', '[data-layer="earthquakes"]', 'EARTHQUAKES'],
  ['visuals', '#visualSettings', 'VISUAL MODES'],
  ['ion', '#ionSettings', 'CESIUM ION'],
  ['terrain', '#ionTerrain', 'ION TERRAIN'],
];

function installTacticalGlyphs() {
  for (const [glyphId, selector, label] of BUTTON_GLYPHS) {
    const button = document.querySelector(selector);
    if (!button || button.querySelector('.gevGlyph')) continue;

    const svg = GLYPHS[glyphId];
    if (!svg) continue;

    button.dataset.glyph = glyphId;
    button.dataset.glyphLabel = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.innerHTML = `<span class="gevGlyph" aria-hidden="true">${svg}</span>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installTacticalGlyphs, { once: true });
} else {
  installTacticalGlyphs();
}

console.info('[GEV] Tactical SVG glyph system ready');
