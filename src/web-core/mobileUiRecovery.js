const STYLE_ID = 'gev-mobile-ui-recovery';

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Mobile UI recovery: presentation/layout only. Cesium and GEV data state are untouched. */
    [hidden] { display: none !important; }

    #hud { z-index: 40; }
    #brand, #gevTimeHud, .menuToggle { z-index: 41; }

    #coordinatePanel,
    #ionPanel,
    #visualPanel {
      position: fixed;
      top: calc(max(14px, env(safe-area-inset-top)) + 104px) !important;
      left: max(14px, env(safe-area-inset-left)) !important;
      right: auto !important;
      bottom: auto !important;
      z-index: 45 !important;
      width: min(420px, calc(100vw - 28px)) !important;
      max-height: calc(100vh - max(14px, env(safe-area-inset-top)) - 122px);
      box-sizing: border-box;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 14px;
      color: var(--gev-text, #dffaff);
      background: rgba(4, 10, 15, .88);
      border: 1px solid rgba(0, 220, 255, .38);
      border-radius: 8px;
      box-shadow: 0 14px 38px rgba(0, 0, 0, .42), inset 0 1px 0 rgba(160, 235, 255, .10);
      backdrop-filter: blur(14px) saturate(120%);
      -webkit-backdrop-filter: blur(14px) saturate(120%);
    }

    #visualPanel { width: min(300px, calc(100vw - 28px)) !important; }

    #coordinatePanel .panelHeader,
    #ionPanel .panelHeader,
    #visualPanel .panelHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 24px;
      padding: 0 0 9px;
      border-bottom: 1px solid rgba(120, 220, 255, .18);
    }

    #coordinatePanel .panelHeader > div,
    #ionPanel .panelHeader > div,
    #visualPanel .panelHeader > div {
      min-width: 0;
    }

    #coordinatePanel .panelText,
    #ionPanel .panelText {
      margin: 10px 0 12px;
      font: 500 9px/1.45 'Rajdhani', sans-serif;
      letter-spacing: .03em;
      color: rgba(210, 235, 242, .78);
    }

    #coordinatePanel .fieldLabel,
    #ionPanel .fieldLabel {
      display: block;
      margin: 9px 0 5px;
      font: 600 7px/1 'Orbitron', sans-serif;
      letter-spacing: .12em;
      color: rgba(116, 234, 255, .82);
    }

    #coordinatePanel .coordinateInput,
    #ionPanel .tokenInput {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      min-height: 34px;
      padding: 8px 9px;
      border: 1px solid rgba(120, 220, 255, .24);
      border-radius: 6px;
      outline: none;
      background: rgba(2, 7, 11, .78);
      color: #e8fcff;
      font: 500 10px/1.1 'Orbitron', sans-serif;
      letter-spacing: .04em;
    }

    #coordinatePanel .coordinateInput:focus,
    #ionPanel .tokenInput:focus {
      border-color: rgba(0, 220, 255, .76);
      box-shadow: 0 0 10px rgba(0, 220, 255, .12);
    }

    #coordinatePanel .coordinateGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
    }

    #coordinatePanel .panelActions,
    #ionPanel .panelActions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }

    #coordinatePanel .panelActions button,
    #ionPanel .panelActions button {
      flex: 1 1 0;
      min-width: 0;
    }

    #coordinatePanel .cityActions { margin-top: 8px; }
    #coordinatePanel .cityActions button { flex: 0 0 auto; }

    #coordinatePanel .panelState,
    #ionPanel .panelState {
      margin-top: 9px;
      padding-top: 8px;
      border-top: 1px solid rgba(120, 220, 255, .10);
      font: 500 7px/1.25 'Orbitron', sans-serif;
      letter-spacing: .07em;
      color: rgba(159, 178, 189, .82);
    }

    #ionPanel .rememberRow {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 9px;
      font: 500 8px/1.2 'Rajdhani', sans-serif;
      color: rgba(210, 235, 242, .72);
    }

    #ionPanel .rememberRow input { accent-color: #5de5ff; }

    @media (max-width: 560px) {
      #coordinatePanel,
      #ionPanel,
      #visualPanel {
        top: calc(max(14px, env(safe-area-inset-top)) + 94px) !important;
        left: max(11px, env(safe-area-inset-left)) !important;
        width: calc(100vw - max(22px, calc(env(safe-area-inset-left) + env(safe-area-inset-right) + 22px))) !important;
        max-height: calc(100vh - max(14px, env(safe-area-inset-top)) - 108px);
        padding: 12px;
      }

      #visualPanel { width: min(300px, calc(100vw - 22px)) !important; }
      #coordinatePanel .panelText { font-size: 8px; }
      #coordinatePanel .coordinateGrid { gap: 7px; }
      #coordinatePanel .panelActions button,
      #ionPanel .panelActions button { min-height: 32px; padding: 7px 8px; }
    }
  `;
  document.head.appendChild(style);
}
