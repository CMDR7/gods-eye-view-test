<img width="1200" height="630" alt="God's Eye View Web Core" src="https://github.com/user-attachments/assets/21665e58-1e5c-4978-bd47-a485f8a90a91" />

# GOD'S EYE VIEW // WEB CORE

> A browser-first, progressively built Web Core for **God's Eye View**.
>
> The purpose of this branch is to establish a small, stable, usable web application first, then add capabilities one layer at a time without making a backend, authentication system, server-side secrets, or unnecessary infrastructure prerequisites.

**Branch:** `web-core`  
**Deployment:** GitHub Pages  
**Mode:** client-side / browser-first  
**Primary renderer:** CesiumJS  
**Build:** Vite  
**Target:** desktop + mobile browsers

---

## 1. Current Development Focus

The project has reached the point where the basic Web Core is functional: the Cesium globe works, the principal data layers work, targets can be selected and inspected, coordinates and cities can be navigated to, and satellite interaction now works reliably on mobile.

**The main focus at this stage is not adding as many features as possible. It is making the existing core reliable, efficient, mobile-friendly, and economical with external resources.**

Current priorities:

1. **Layer reliability** — refresh behavior, provider failures, stale data, cleanup, and predictable state.
2. **Mobile interaction** — touch picking, target selection, camera navigation, responsive controls, and performance.
3. **Resource discipline** — minimize unnecessary API calls, use caching where appropriate, and avoid consuming paid/limited services when a direct browser source is sufficient.
4. **Satellite reliability** — maintain the working CelesTrak architecture while preparing for a more modern OMM/JSON-based implementation.
5. **Target interaction** — make `SELECT → INSPECT → FLY TO → TRACK → CLEAR` dependable before expanding the intelligence system.
6. **Progressive expansion** — only add new layers after they meet the same browser-first, reliability, and resource requirements.

The current milestone is therefore:

```text
STAGE 2E // CORE RELIABILITY + RESOURCE EFFICIENCY
```

---

## 2. How Web Core Started

The original God's Eye View repository is a much larger application with a substantial server-assisted architecture and many optional systems.

For this version, we deliberately took a different engineering path.

Instead of trying to make every subsystem work immediately, we isolated a **Web Core** and established a minimal browser application around the parts that can operate safely and directly from the client.

The development sequence has been:

```text
Existing GEV repository
        ↓
Isolated WEB CORE branch
        ↓
Minimal browser application
        ↓
Cesium globe
        ↓
Basic map interaction
        ↓
Direct public data sources
        ↓
Layer controls
        ↓
Tactical UI
        ↓
Target selection / inspection
        ↓
Camera navigation
        ↓
Coordinate + city navigation
        ↓
Target intelligence
        ↓
Satellite feed reliability + caching
        ↓
Native mobile satellite picking
        ↓
Core reliability + resource optimization   ← CURRENT STAGE
```

This staged approach is intentional. Each addition is tested against the working core before the next subsystem is introduced.

---

## 3. Web Core Engineering Principle

The Web Core follows one simple rule:

> **Start small. Make the browser application work. Then add capabilities incrementally.**

Where a provider supports direct browser access, Web Core can communicate with it from the client. Where a service requires a server, authentication layer, proxy, or secret credential, that capability is deferred rather than forcing it into the core prematurely.

Every proposed feature is evaluated against four questions:

1. Can it run directly in the browser?
2. Can it be added without breaking the existing globe?
3. Can the provider be used responsibly within its limits?
4. Can it remain usable on a mobile device?

If the answer is no, the capability is deferred.

### Current architecture

```text
GEV WEB CORE
│
├── CesiumJS
│   ├── 3D globe
│   ├── camera/navigation
│   ├── optional World Terrain
│   ├── entity picking
│   └── native satellite point picking
│
├── Tactical UI
│   ├── compact command drawer
│   ├── tactical telemetry HUD
│   ├── target inspection panel
│   └── animated SVG tactical glyphs
│
├── Navigation
│   ├── home
│   ├── decimal coordinates
│   ├── device location
│   ├── city/place navigation
│   └── target fly-to / tracking
│
└── Browser Data Sources
    ├── OpenStreetMap
    ├── ADSB.lol
    ├── CelesTrak
    ├── USGS
    └── Nominatim
```

The architecture is intentionally modular so additional sources can be introduced without rebuilding the entire application.

---

## 4. What We Have Built So Far

### Phase 1 — Establishing the Web Core

The first step was creating a dedicated build path instead of attempting to activate the entire original application architecture.

Implemented:

- dedicated `web-core` branch
- dedicated `web-core.html` entry point
- Vite Web Core configuration
- dedicated Web Core build script
- separate Web Core source directory
- GitHub Actions build workflow
- GitHub Pages deployment workflow
- responsive browser layout
- CesiumJS globe initialization
- basic camera interaction
- browser-first client architecture

The result was a small application that can build and deploy independently.

### Phase 1A — Cesium Ion + World Terrain

Cesium Ion support was introduced without creating a server-side credential system.

Implemented:

- user-supplied Cesium Ion access token
- browser-local persistent token storage
- session-only token storage
- token clearing
- optional Cesium World Terrain
- terrain connection/error reporting
- restricted public-token model
- GitHub Pages referrer-policy handling

The token is **not hardcoded into the repository** and is not sent to a GEV backend.

Because this is a browser application, a client-side token must still be considered visible to the browser. The security model therefore uses a restricted public token with minimal scopes rather than treating browser storage as a secret vault.

A real deployment issue was also solved: GitHub Pages + a path-restricted Cesium Ion token initially produced terrain HTTP 403 errors because of browser referrer behavior. The deployed Web Core now uses an explicit referrer policy so the restricted Ion configuration works correctly.

---

## 5. Tactical Interface

Once the globe was stable, the next step was building an interface that could support more layers without covering the map.

### Command drawer

The controls were moved into a compact slide-out command panel.

Implemented:

- compact three-line menu control
- smooth open/close animation
- translucent tactical-glass surface
- glowing edge treatment
- compact rounded controls
- active layer states
- close button
- outside-click dismissal
- ESC dismissal
- mobile-responsive behavior

The controls were intentionally reduced in size so future capabilities can be added without turning the command panel into a large vertical menu.

### Tactical glyph system

The navigation controls now use custom animated monochrome SVG glyphs rather than depending on an icon font.

The glyph system provides:

- custom GEV tactical symbols
- monochrome default state
- cyan active/selected state
- subtle hover/focus illumination
- semantic `aria-label` and title values
- icon-first mobile presentation

The current glyph family covers navigation, location, coordinate navigation, aircraft, satellites, earthquakes, Cesium Ion, and terrain.

### Tactical telemetry HUD

A persistent telemetry strip was added above the map content.

It provides camera/scene telemetry including:

- latitude
- longitude
- altitude
- heading
- range

The HUD was moved away from the bottom of the screen after testing showed that it could obscure map objects and targets.

---

## 6. Target Interaction Layer

The next major step was turning the globe from something purely visual into something interactive.

Web Core now supports:

```text
CLICK / TAP TARGET
       ↓
IDENTIFY
       ↓
SELECT
       ↓
INSPECT
       ↓
FLY TO
       ↓
TRACK
       ↓
CLEAR
```

### Current target types

- aircraft
- satellites
- earthquakes

### Target inspection

The target panel provides a common structure including:

- target type
- target name
- identifier
- position
- altitude
- source
- update time

Selected targets receive a stronger visual treatment so they remain distinguishable from surrounding contacts.

### Target lifecycle

Layer refreshes and clears are tied to target state so a stale target does not remain selected after its layer has been replaced.

---

## 7. Mobile Target Picking — The Satellite Problem

Satellite selection became the most important mobile interaction problem encountered so far.

The initial implementation behaved differently on Android than expected:

- tapping the globe could produce valid ground coordinates
- tapping a visible satellite often produced only `GROUND FOCUS`
- the satellite itself appeared visually present but was not selected

The problem was not simply the satellite data.

Several interacting issues had to be resolved:

### 1. Browser/Cesium coordinate systems

Pointer events use browser top-left coordinates while Cesium's screen-space input path uses a different window-coordinate convention. The touch bridge initially passed the wrong vertical coordinate into the picking path.

### 2. Satellites are 3D objects, not surface points

A satellite may be hundreds or thousands of kilometres above the ellipsoid. A ground fallback can therefore succeed even when the actual satellite pick has failed, which made the interaction appear to work while selecting the wrong spatial object.

### 3. Native Cesium picking was the correct architecture

The original God's Eye View architecture uses a `Cesium.PointPrimitiveCollection` for satellites with the satellite identifier attached to the point primitive.

Web Core adopted the same fundamental approach:

```text
CelesTrak data
      ↓
Satellite.js propagation
      ↓
GEV target Entity
      ↓
Native Cesium PointPrimitive
      ↓
PointPrimitive.id → Entity
      ↓
Cesium screen-space picking
```

A mobile-safe screen-space fallback was then added using the actual rendered point positions and a controlled touch radius.

The result is that satellite tapping now works on the Android test device and opens the normal target inspection panel.

This was an important architectural lesson: **when a visual object is rendered as a native Cesium primitive, interaction should remain as close as possible to Cesium's native picking model.**

---

## 8. Camera Navigation

### Coordinate navigation

The **NAVIGATION // COORDINATES** interface supports:

- decimal latitude
- decimal longitude
- optional altitude
- validation
- `FLY TO`
- `MY LOCATION`
- `COPY`
- Enter-key submission
- status/error reporting

The default navigation altitude is **15,000 metres** when no altitude is supplied.

Invalid values are rejected before being passed to the Cesium camera.

### City / place navigation

The coordinate interface was extended with a city/place field.

The sequence is:

```text
CITY / PLACE
     ↓
NOMINATIM
     ↓
LAT / LON
     ↓
EXISTING COORDINATE NAVIGATION
     ↓
CESIUM FLY-TO
```

The implementation deliberately does **not** perform continuous autocomplete.

It only sends a geocoding request when the user explicitly submits a city/place. Results are cached locally for 24 hours and requests are throttled to avoid unnecessary traffic.

### Target `FLY TO`

Target navigation uses the selected target's current 3D position and a calculated camera range rather than attempting to place the camera directly on a point primitive.

For satellites in particular, the range is derived from orbital altitude and constrained to a practical viewing distance.

---

## 9. Target Intelligence

After target selection and navigation were stable, additional target information was added.

### Aircraft

Selected aircraft can request:

- callsign
- registration
- aircraft type
- squawk
- category
- ground speed
- track
- vertical rate

The detailed request is performed after selection instead of downloading unnecessary intelligence for every contact.

### Satellites

Selected satellites can request:

- NORAD catalog number
- object name
- orbital altitude
- inclination
- eccentricity
- orbital period
- element epoch

The intelligence request is scoped to the selected satellite rather than repeatedly downloading a large catalog.

### Earthquakes

Earthquake targets expose:

- magnitude
- depth
- event ID
- location
- update time
- source

---

## 10. Satellite Data Reliability and Caching

The satellite layer exposed an important provider-rate-limit problem during development.

The first implementation repeatedly requested a large CelesTrak `GROUP=active` dataset. During repeated testing this resulted in CelesTrak HTTP 403 responses.

The fix was to treat CelesTrak as a data source with a refresh policy rather than a dataset that can be downloaded every time the user opens the layer.

### Current satellite architecture

```text
CelesTrak VISUAL GROUP
        ↓
Browser localStorage cache
        ↓
2-hour cache lifetime
        ↓
Satellite.js / SGP4 propagation
        ↓
Current browser-time position
        ↓
Cesium entities + native points
```

Current behavior:

- smaller `GROUP=visual` feed instead of the large active catalog
- local browser cache
- two-hour refresh interval
- no aggressive retry loop
- visible `LIVE` / `CACHE` state
- satellite positions propagated to the current browser time
- selected-object intelligence fetched separately

This means the application is using **real CelesTrak orbital data**, not simulated satellites. The element set is cached, while the displayed position is calculated from the orbital elements for the current time.

### Future satellite format work

The current layer is intentionally a reliable Web Core implementation, not the final satellite data architecture.

The next satellite data improvement should move the main feed toward modern CelesTrak OMM/JSON/CSV formats. This is important because traditional five-digit TLE catalog identifiers cannot represent modern catalog numbers above `99999`.

---

## 11. Resource and Quota Discipline

Resource usage is now a first-class development concern.

The current Cesium Ion Community / Individual account provides multiple quotas, but Web Core is intentionally using only the Ion capability that currently provides a meaningful benefit: **World Terrain streaming**.

### Cesium Ion usage in Web Core

| Ion capability | Currently used? | Reason |
|---|---:|---|
| Data Streaming | **YES** | Optional Cesium World Terrain |
| Storage | No | Web Core uploads no assets |
| Bing Maps sessions | No | Base imagery is OpenStreetMap |
| Ion geocoding | No | City search uses Nominatim |
| Reality Modeling | No | Not required |
| Reality Analysis | No | Not required |
| BIM/CAD tiler | No | Not required |
| Google Photorealistic 3D Tiles | No | Not required |
| Clips / Asset Depot data | No | Not required |
| Team features | No | Individual Web Core project |

The exact quotas displayed by Cesium can change with plan updates, so this README documents **what Web Core consumes**, not a permanent promise about account limits.

### Current external resource strategy

| Capability | Provider | Current strategy |
|---|---|---|
| Base imagery | OpenStreetMap | Direct browser tiles |
| Terrain | Cesium Ion | Optional; only when Ion token is configured |
| Aircraft | ADSB.lol via Cloudflare Worker | Browser calls dedicated relay; relay handles provider acquisition |
| Satellites | CelesTrak | Direct browser request + 2h cache |
| Earthquakes | USGS | Direct browser request + refresh interval |
| City/place search | Nominatim | Explicit request + 24h cache + throttling |

The goal is to avoid using a metered or restricted service when a suitable direct/free source is available, while using a small dedicated relay where browser-direct access is not reliable for the required aircraft feeds.

---

## 12. Cesium Ion Security Model

Web Core deliberately avoids server-side secrets.

The Ion token is entered by the user and stored in either:

- browser `localStorage` when persistence is enabled
- browser `sessionStorage` for session-only use

The token is not committed to GitHub.

The current intended token configuration uses only public browser-safe scopes and URL restrictions appropriate for the Web Core deployment.

Important: a browser token is inherently accessible to browser code/devtools. It should therefore be treated as a restricted public application credential, not as a secret key.

Official Cesium guidance: https://cesium.com/learn/ion/cesium-ion-access-tokens/

---

## 13. Current Direct Data Sources

| Capability | Source | Browser Core | Current role |
|---|---|---:|---|
| 3D globe | CesiumJS | Yes | Rendering engine |
| Terrain | Cesium Ion | Optional | Elevation / terrain |
| Base imagery | OpenStreetMap | Yes | Map imagery |
| Aircraft | ADSB.lol + Cloudflare relay | Yes, via relay | Civilian + military aircraft contacts |
| Satellites | CelesTrak | Yes | Orbital contacts |
| Earthquakes | USGS | Yes | Seismic events |
| City/place geocoding | Nominatim | Yes | Navigation |

The Web Core remains browser-first. Aircraft are the deliberate exception to a purely direct-provider path: a dedicated Cloudflare Worker provides the relay required to make the civilian and military aircraft feeds reliable from the browser.

---

## 14. Aircraft Data Architecture — Civilian + Military

Aircraft are now a two-path acquisition system. **Both paths are required for the globe to populate correctly.**

### Architecture

```text
                    GEV WEB CORE
                         │
                         │ /aircraft?lat=...&lon=...&radius=...&mode=...
                         ▼
              Cloudflare Worker Relay
                `gev-aircraft-relay`
                         │
              ┌──────────┴──────────┐
              │                     │
      mode=civilian          mode=military
              │                     │
              ▼                     ▼
       ADSB.LOL /point          ADSB.LOL /mil
       point around view        military feed
              │                     │
              ▼                     ▼
       radius filtering       same geographic
                              radius filtering
              │                     │
              └──────────┬──────────┘
                         ▼
                normalized aircraft
                         │
              ┌──────────┴──────────┐
              │                     │
       CIVILIAN layer        MILITARY layer
          cyan points             orange points
```

### Civilian aircraft

For `mode=civilian`, the relay requests the ADSB.LOL point feed around the requested camera position and radius. The Web Core uses the normalized result to populate the cyan civilian aircraft layer.

The current production path is:

```text
ADSB.LOL /v2/point/{lat}/{lon}/{radius}
        ↓
Cloudflare relay
        ↓
Web Core aircraft provider
        ↓
CIVILIAN Cesium layer
```

### Military aircraft

For `mode=military`, the relay requests ADSB.LOL's military feed (`/v2/mil`) rather than reusing the civilian point endpoint. The relay then filters the military result to the same geographic radius used by Web Core.

The current production path is:

```text
ADSB.LOL /v2/mil
        ↓
Cloudflare relay
        ↓
same geographic radius filter
        ↓
Web Core aircraft provider
        ↓
MILITARY Cesium layer
```

The military upstream feed is broader than the civilian point query, so the radius filter is important. The result is then rendered independently as orange military contacts.

### Required Cloudflare Worker

Current Worker:

- **Name:** `gev-aircraft-relay`
- **URL:** `https://gev-aircraft-relay.7cmdr7.workers.dev`
- **Termux project:** `/root/gev-aircraft-relay`
- **Deployment:** Wrangler
- **Current validated deployed version:** `6ea95b38-73e3-43b4-ab8b-60b87c4950a3`

The Web Core relay URL is configured in `web-core.html` through the `gev-aircraft-relay` metadata value.

### Critical maintenance rule

> **The Cloudflare Worker is part of the live aircraft architecture.**

If aircraft acquisition behavior changes, do **not** change only `src/web-core/aircraftProvider.js` and assume the live system follows it.

Always review:

```text
src/web-core/aircraftProvider.js
workers/aircraft-relay.js
wrangler.jsonc
web-core.html
```

If the Worker behavior changes, redeploy the Worker with Wrangler and verify both modes independently before testing Android.

### Minimum aircraft verification

Before considering an aircraft change complete:

1. Test the relay with `mode=civilian`.
2. Confirm the civilian response contains aircraft records.
3. Test the relay with `mode=military`.
4. Confirm the military response is using the military acquisition path rather than the civilian point path.
5. Open Android Web Core.
6. Verify CIVILIAN alone.
7. Verify MILITARY alone.
8. Verify CIVILIAN + MILITARY together.
9. Toggle each layer off and confirm the other layer remains independent.

The Android validation performed for this stage confirmed approximately 1,045–1,055 civilian objects and 6–7 military objects in the tested view, with the two datasets rendering independently. The exact counts are dynamic and should not be treated as fixed expected values.

### Important implementation note

Do not collapse the two modes back into a single ADSB.LOL `/point` request. That was the source of the original civilian/military duplication behavior. The relay must preserve explicit civilian versus military acquisition paths.

---

## 15. What Web Core Does Not Currently Depend On

The Web Core intentionally does **not** require:

- GEV backend services
- user accounts
- GEV authentication
- server-side API keys
- OpenAI services
- voice control
- a general-purpose GEV server proxy
- Google Maps
- Google Photorealistic 3D Tiles
- AISStream
- private provider credentials
- a database

**Exception:** the aircraft layer intentionally uses the dedicated `gev-aircraft-relay` Cloudflare Worker described above. This is a narrow provider relay, not a general GEV backend.

These systems can be considered later without making them prerequisites for the core application.

---

## 16. Current Status

### Implemented and working

- [x] Cesium 3D globe
- [x] basic camera navigation
- [x] OpenStreetMap imagery
- [x] optional Cesium Ion token handling
- [x] optional Cesium World Terrain
- [x] GitHub Pages deployment
- [x] responsive mobile UI
- [x] compact tactical command drawer
- [x] animated tactical SVG glyphs
- [x] tactical telemetry HUD
- [x] aircraft layer
- [x] separate civilian aircraft acquisition
- [x] separate military aircraft acquisition
- [x] Cloudflare aircraft relay
- [x] independent civilian/military layer toggles
- [x] cyan civilian aircraft presentation
- [x] orange military aircraft presentation
- [x] satellite layer
- [x] earthquake layer
- [x] mobile target selection
- [x] satellite native Cesium picking
- [x] target inspection
- [x] target visual highlighting
- [x] target tracking
- [x] target clearing
- [x] target fly-to navigation
- [x] aircraft intelligence
- [x] satellite intelligence
- [x] earthquake intelligence
- [x] decimal coordinate navigation
- [x] device-location coordinate population
- [x] city/place navigation
- [x] geocoder caching/throttling
- [x] CelesTrak satellite caching
- [x] two-hour satellite refresh strategy

### Candidates for later phases

These are intentionally **not current dependencies**:

- [ ] weather
- [ ] wildfire / fire feeds
- [ ] additional military/public datasets
- [ ] vessel tracking
- [ ] traffic
- [ ] CCTV
- [ ] radio
- [ ] voice control
- [ ] AI/LLM integration
- [ ] server-side aggregation
- [ ] advanced satellite OMM/JSON architecture
- [ ] advanced 3D imagery / photorealistic tiles

A feature is only marked complete after it is actually implemented and tested in Web Core.

---

## 17. Current Roadmap

### Stage 2E — Core Reliability + Resource Efficiency **← CURRENT**

Before expanding the number of layers, improve the systems already in the application:

- provider failure handling
- refresh-state visibility
- stale-data handling
- cache consistency
- mobile performance
- target-picking reliability
- target lifecycle cleanup
- camera navigation reliability
- external request minimization
- clearer source/status telemetry

### Stage 3 — Additional Browser-Safe Intelligence

After the existing core is stable, add new capabilities one at a time:

- weather
- fires
- additional public aviation data
- selected public/military datasets
- improved satellite formats

Every new provider must first pass the same browser-access, reliability, resource, and mobile tests.

### Stage 4 — Advanced Visualization

Only after the data layer is dependable:

- richer target symbology
- trails
- better target labels
- expanded telemetry
- additional tactical visualization
- more sophisticated camera behavior

The guiding rule remains:

> **Function first. Reliability second. Expansion third.**

---

## 18. Repository Structure

The Web Core additions are intentionally separated from the larger application:

```text
web-core.html
vite.web-core.config.js
wrangler.jsonc

workers/
└── aircraft-relay.js

scripts/
└── web-core.mjs

src/web-core/
├── main.js
├── style.css
├── ionToken.js
├── cityNav.js
├── targetIntelligence.js
├── aircraftProvider.js
├── aircraftPresentation.js
├── pickSupport.js
├── screenTargetResolver.js
├── nativeSatelliteLayer.js
└── tacticalGlyphs.js

src/maps/
└── imagery.js

.github/workflows/
├── web-core-build.yml
└── web-core-pages.yml
```

The exact repository will continue to evolve as modules are extracted and responsibilities are separated further.

---

## 19. Build and Deployment

The Web Core has its own Vite configuration:

```text
vite.web-core.config.js
```

Build:

```bash
node scripts/web-core.mjs
```

Development:

```bash
node scripts/web-core.mjs dev
```

Production output:

```text
dist-web-core/
```

The build script creates the GitHub Pages entry point:

```text
dist-web-core/index.html
```

### GitHub Actions

The branch uses dedicated workflows:

```text
.github/workflows/web-core-build.yml
.github/workflows/web-core-pages.yml
```

The deployment loop is:

```text
EDIT
 ↓
COMMIT
 ↓
PUSH web-core
 ↓
GitHub Actions
 ↓
Vite build
 ↓
Pages artifact
 ↓
GitHub Pages
 ↓
MOBILE / DESKTOP TEST
 ↓
VERIFY
```

The Web Core build and Pages deployment have been repeatedly validated through GitHub Actions during development.

---

## 20. Development Philosophy

Web Core is deliberately being developed as a **progressive capability system** rather than a feature dump.

Each addition must preserve:

- the working globe
- mobile usability
- browser compatibility
- predictable provider behavior
- resource discipline
- security boundaries
- simple deployment

The application should remain useful even if an optional provider is unavailable.

That means the target architecture is not:

```text
EVERYTHING DEPENDS ON EVERYTHING
```

It is:

```text
              CORE GLOBE
                  │
        ┌─────────┼─────────┐
        │         │         │
     AIRCRAFT  SATELLITES  QUAKES
        │         │         │
        └─────────┼─────────┘
                  │
           TARGET SYSTEM
                  │
       ┌──────────┼──────────┐
       │          │          │
    INSPECT     FLY TO     TRACK
```

Optional services should extend the core, not become prerequisites for it.

---

## 21. Current Objective

The immediate objective is simple:

> **Make the existing Web Core feel like a dependable application before making it a larger application.**

That means the next development work should concentrate on reliability, performance, mobile interaction, caching, provider limits, and clean layer lifecycle behavior.

Once that foundation is solid, additional intelligence layers can be introduced without destabilizing what already works.

---

## License / Third-Party Data

This repository combines open-source software and externally provided data/services. Individual providers retain their own terms, licenses, attribution requirements, and usage limits.

Relevant provider documentation should always be checked before expanding a data source or changing its usage pattern.

- Cesium: https://cesium.com/
- Cesium Ion: https://ion.cesium.com/
- OpenStreetMap: https://www.openstreetmap.org/
- CelesTrak: https://celestrak.org/
- USGS Earthquake Hazards Program: https://earthquake.usgs.gov/
- Nominatim: https://nominatim.org/
- ADSB.lol: https://adsb.lol/
