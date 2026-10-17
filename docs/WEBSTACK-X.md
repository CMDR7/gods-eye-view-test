# WEBSTACK-X // GEV Web Core Protocol

## Purpose

WEBSTACK-X is the browser/PWA adaptation layer for GOD'S EYE VIEW Web Core. It exists to make the existing Web Core behave correctly as a modern web application without replacing or redefining GEV's core systems.

## Non-override rule

WEBSTACK-X MUST NOT become authoritative over GEV application state.

It must not replace or redefine:

- Cesium scene, camera, clock, terrain, or imagery behavior
- target selection, inspection, FLY TO, or TRACK behavior
- satellite propagation or orbital data
- aircraft, earthquake, or other live-data providers
- layer lifecycle/state
- GEV intelligence/metadata logic
- existing GEV provider semantics

When an adaptation is required, WEBSTACK-X should wrap, observe, or expose the existing behavior rather than duplicate it.

## WEBSTACK-X responsibilities

WEBSTACK-X may own:

- responsive browser presentation
- viewport and safe-area adaptation
- PWA manifest and installability metadata
- service-worker lifecycle
- application-shell caching
- browser lifecycle/recovery behavior
- static asset delivery policy
- deployment-path compatibility
- web/PWA validation

## Cache contract

### Application shell

Same-origin application resources may be cached for offline shell recovery.

### Live intelligence

Cross-origin provider traffic is not cached by the Web Core service worker. Live intelligence remains network-owned by the original GEV providers.

The service worker MUST NOT make stale provider data appear to be live data.

### Device state

User preferences and browser-local state remain client-side and are not moved into the service-worker layer.

## Failure policy

If WEBSTACK-X fails, the GEV application should continue to initialize wherever the browser can otherwise load Web Core.

A PWA registration failure is therefore non-fatal. The application must not depend on service-worker registration for Cesium, targeting, navigation, or intelligence layers.

## Deployment policy

The Web Core Pages build remains the deployment boundary. WEBSTACK-X should work with the existing Vite Web Core build and GitHub Pages artifact rather than creating a second application build pipeline.

## Validation gates

Before declaring Web Core PWA-ready, validate:

1. Normal browser loading.
2. Android Chrome loading in portrait and landscape.
3. Standalone/PWA launch.
4. Offline application-shell recovery.
5. Recovery after returning from background/screen lock.
6. Live providers still use their normal network paths.
7. Cesium camera, terrain, targeting, FLY TO, TRACK, and layer behavior remain unchanged.
8. PWA failures remain non-fatal.

## Architectural rule

> WEBSTACK-X adapts the environment around GEV. It does not become GEV.
