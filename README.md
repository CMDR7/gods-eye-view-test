# GOD'S EYE VIEW // WEB CORE

> A browser-first, progressively built Web Core for **God's Eye View**.
>
> The goal of this branch is deliberately different from trying to activate the entire original application at once: establish a small, stable, usable web application first, then add capabilities one layer at a time without introducing a backend, authentication system, server-side secrets, or unnecessary infrastructure.

**Branch:** `web-core`  
**Deployment:** GitHub Pages  
**Mode:** client-side / browser-only  
**Primary renderer:** CesiumJS  
**Build:** Vite  
**Target:** desktop + mobile browsers

---

## 1. How Web Core Started

The original God's Eye View repository is a much larger application with a substantial server-assisted architecture and many optional systems.

For this version, we took a different engineering path.

Instead of trying to make every subsystem work immediately, we isolated a **Web Core** and established a minimal browser application around the parts that could operate safely and directly from the client.

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
Further layers and reliability work
```

This staged approach is intentional. Each addition is tested against the working core before the next subsystem is introduced.

---

## 2. The Web Core Principle

The Web Core is built around one simple rule:

> **Start small. Make the browser application work. Then add capabilities incrementally.**

There is no requirement for a backend to sit between the browser and every public data source.

Where a provider supports browser access directly, Web Core can communicate with it from the client. Where a service requires a server, authentication layer, proxy, or secret credential, that capability is deferred rather than forcing it into the core prematurely.

### Current architecture

```text
GEV WEB CORE
│
├── CesiumJS
│   ├── 3D globe
│   ├── camera
│   ├── terrain
│   └── entity picking
│
├── Tactical UI
│   ├── command drawer
│   ├── telemetry HUD
│   └── target inspection
│
├── Navigation
│   ├── home
│   ├── coordinates
│   ├── city/place geocoding
│   └── camera fly-to
│
└── Browser Data Sources
    ├── OpenStreetMap
    ├── ADSB.lol
    ├── CelesTrak
    └── USGS
```

The architecture is intentionally modular so that additional sources can be introduced without rebuilding the entire application.

---

## 3. What We Have Added So Far

### Phase 1 — Establishing the Web Core

The first step was creating a dedicated build path rather than modifying the original application architecture.

Added:

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
- browser-safe client architecture

The result was a small application that could actually build and deploy independently.

### Phase 1A — Cesium Ion + World Terrain

We then introduced Cesium Ion support without creating a server-side credential system.

The application now supports:

- Cesium Ion access-token entry
- browser-local token storage
- session-only token storage
- token clearing
- World Terrain activation
- terrain connection/error reporting
- restricted Cesium Ion token configuration

The token is deliberately **not hardcoded into the repository** and is not sent to a GEV backend.

Because this is a browser application, a client-side token must still be considered exposed to the browser. The security model therefore relies on a restricted public token rather than pretending browser storage is a secret vault.

We also solved a real-world referrer problem with GitHub Pages + Cesium Ion by explicitly setting the document referrer policy. This allowed the restricted Ion URL configuration to work correctly from the deployed application.

---

## 4. The Tactical Interface

Once the globe was stable, the next step was building an interface that could support more layers without covering the map.

### Command drawer

The controls were moved into a compact slide-out command panel.

The drawer provides:

- compact three-line menu control
- smooth open/close animation
- translucent tactical-glass styling
- glowing edge treatment
- compact rounded controls
- active layer states
- close button
- outside-click dismissal
- ESC dismissal
- mobile-responsive behavior

The buttons were deliberately reduced in size so that future capabilities can be added without turning the command panel into a large vertical menu.

### Tactical telemetry HUD

A persistent telemetry strip was added above the map content.

It currently provides camera/scene telemetry such as:

- latitude
- longitude
- altitude
- heading
- range

The HUD was moved from the bottom of the screen after testing showed that it could obscure map objects and targets.

---

## 5. Target Interaction Layer

The next major step was turning the map from something purely visual into something interactive.

Web Core now supports the basic target interaction sequence:

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

The target panel provides a common telemetry structure including:

- target type
- target name
- identifier
- position
- altitude
- source
- update time

A visual selection state enlarges the selected point and gives it a high-contrast outline so it can be distinguished from surrounding contacts.

### Tracking

The selected entity can be tracked by the Cesium camera, with the control changing between `TRACK` and `UNTRACK` as appropriate.

Layer clearing also clears an active target belonging to that layer, preventing stale selections from surviving a data refresh.

---

## 6. Coordinate Navigation

After target interaction was working, navigation was expanded so the user could move to an exact location without manually manipulating the globe.

The **NAVIGATION // COORDINATES** interface supports:

- decimal latitude
- decimal longitude
- optional altitude
- validation
- `FLY TO`
- `MY LOCATION`
- `COPY`
- Enter-key submission
- navigation status/error reporting

The default navigation altitude is **15,000 metres** when no altitude is supplied.

Invalid values are rejected rather than being passed to the Cesium camera.

Example:

```text
LATITUDE   49.4875
LONGITUDE   8.4660
ALTITUDE   15000

             [ FLY TO ]
```

---

## 7. City / Place Navigation

Coordinate navigation was then extended with a human-readable place field.

The city navigation module uses direct Nominatim geocoding and feeds the returned coordinates into the existing coordinate navigation system.

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

The implementation intentionally does **not** perform continuous autocomplete.

Instead it uses explicit user actions only:

- enter a city/place
- press `FLY TO`
- or press Enter

A local 24-hour geocode cache and request throttling were added so the application does not repeatedly query the geocoder unnecessarily.

---

## 8. Target Intelligence

Once selection and navigation were stable, we added a second layer of information on top of the basic target metadata.

### Aircraft intelligence

Aircraft targets can request additional information such as:

- callsign
- registration
- aircraft type
- squawk
- category
- ground speed
- track
- vertical rate

The detailed request is performed only after a target has been selected rather than downloading unnecessary information for every aircraft on the map.

### Satellite intelligence

Satellite targets can request:

- NORAD catalog number
- object name
- orbital altitude
- inclination
- eccentricity
- orbital period
- element epoch

Satellite intelligence uses a **single-object CelesTrak request** instead of downloading a complete active-satellite dataset for one selected object.

### Earthquake intelligence

Earthquake targets expose additional event information such as:

- magnitude
- depth
- event ID
- location
- update time
- source

---

## 9. The Satellite Reliability Problem — And the Fix

Satellite data gave us an important example of why the incremental approach matters.

The first implementation downloaded CelesTrak's large `GROUP=active` dataset whenever the satellite layer was enabled.

It worked — until repeated testing caused CelesTrak to return HTTP 403 responses.

This was not a Cesium failure.

CelesTrak's current usage policy explicitly enforces download limits for large GP datasets. GP data updates every two hours, and repeated downloads before an update can produce a temporary 403 response. https://celestrak.org/usage-policy.php

### Web Core response

We changed the satellite architecture to:

```text
CelesTrak VISUAL GROUP
        ↓
Browser localStorage cache
        ↓
2-hour cache lifetime
        ↓
Satellite.js propagation
        ↓
Cesium entities
```

The layer now:

- uses the smaller CelesTrak **Visual** group
- caches the downloaded dataset locally
- avoids unnecessary repeated downloads
- stops on provider errors instead of retrying aggressively
- displays whether the current dataset is `LIVE` or `CACHE`
- uses larger 7px satellite points for easier mobile interaction

For individual satellite intelligence, Web Core requests only the selected satellite's GP JSON record.

### Important future consideration

CelesTrak has now exhausted the traditional five-digit NORAD catalog-number range. TLE format cannot represent catalog numbers above `99999`; modern CelesTrak JSON/CSV/OMM formats remove that limitation. https://celestrak.org/NORAD/documentation/gp-data-formats.php

The current Visual layer is therefore a deliberate **Web Core reliability step**, not the final satellite architecture. A future iteration should migrate the main satellite feed from TLE parsing toward OMM/JSON so that the application can support modern catalog identifiers correctly.

---

## 10. Current Direct Data Sources

| Capability | Source | Browser Core |
|---|---|---|
| 3D globe / terrain | CesiumJS + Cesium Ion | Yes |
| Base imagery | OpenStreetMap | Yes |
| Aircraft | ADSB.lol | Yes |
| Satellites | CelesTrak | Yes |
| Earthquakes | USGS | Yes |
| City/place geocoding | Nominatim | Yes |

These sources are accessed directly by the browser where the provider permits it.

No GEV server proxy is required for the current Web Core data path.

---

## 11. Build and Deployment

Web Core has its own Vite build configuration:

```text
vite.web-core.config.js
```

The dedicated build command is:

```bash
node scripts/web-core.mjs
```

Development mode:

```bash
node scripts/web-core.mjs dev
```

The production output is written to:

```text
dist-web-core/
```

The build script creates a GitHub Pages entry point at:

```text
dist-web-core/index.html
```

### GitHub Actions

Two dedicated workflows handle the Web Core branch:

```text
.github/workflows/web-core-build.yml
.github/workflows/web-core-pages.yml
```

The Pages workflow builds the Web Core application and deploys the resulting `dist-web-core` directory to GitHub Pages.

This means the development loop is now:

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
```

---

## 12. Security Model

Web Core deliberately avoids server-side secrets.

### Cesium Ion

The Ion token is entered by the user and stored in either:

- browser `localStorage` when persistence is enabled
- browser `sessionStorage` for session-only use

The token is not committed to GitHub.

For production use, the Cesium Ion token should remain restricted to the intended application URLs and should use only the public scopes actually required by Web Core.

### What Web Core does not currently use

The Web Core architecture does not depend on:

- user accounts
- GEV authentication
- a GEV backend
- server-side API keys
- OpenAI services
- voice control
- server proxies
- Google Maps
- Google 3D Tiles
- AISStream
- private provider credentials

Those systems can be considered separately later without making them prerequisites for the core application.

---

## 13. Why We Are Building It This Way

The purpose of Web Core is not simply to make a smaller version of the original application.

It is an engineering experiment in **progressive capability**.

Every new subsystem has to answer four questions:

1. **Can it run directly in the browser?**
2. **Can it be added without breaking the existing globe?**
3. **Can the provider be used responsibly within its limits?**
4. **Can it remain usable on a mobile device?**

If the answer is no, that capability is deferred rather than forcing additional infrastructure into the Web Core.

This keeps the application understandable, testable, and deployable.

---

## 14. Current Status

### Working / implemented

- [x] Cesium 3D globe
- [x] Basic camera navigation
- [x] OpenStreetMap imagery
- [x] Cesium Ion token handling
- [x] Cesium World Terrain
- [x] GitHub Pages deployment
- [x] Responsive mobile UI
- [x] Tactical command drawer
- [x] Tactical telemetry HUD
- [x] Aircraft layer
- [x] Satellite layer
- [x] Earthquake layer
- [x] Target selection
- [x] Target inspection
- [x] Target visual highlighting
- [x] Target tracking
- [x] Target clearing
- [x] Aircraft intelligence
- [x] Satellite intelligence
- [x] Earthquake intelligence
- [x] Decimal coordinate navigation
- [x] My-location coordinate population
- [x] City/place navigation
- [x] Geocoder caching/throttling
- [x] Satellite caching
- [x] Two-hour CelesTrak refresh strategy

### Not yet part of the Web Core

These remain candidates for later phases rather than current dependencies:

- [ ] weather
- [ ] wildfire/fire detection feeds
- [ ] additional military datasets
- [ ] vessel tracking
- [ ] traffic
- [ ] CCTV
- [ ] radio
- [ ] voice control
- [ ] AI/LLM integration
- [ ] server-side data aggregation
- [ ] advanced satellite OMM/JSON architecture

The list is intentionally conservative. A capability is only marked complete after it is actually implemented and tested in the Web Core.

---

## 15. Development Roadmap

The next stages follow the same incremental model.

### Stage 2E — Layer Reliability

Improve the existing layers before adding large numbers of new ones:

- provider failure handling
- refresh-state visibility
- stale-data handling
- cache consistency
- mobile performance
- target-picking reliability
- layer lifecycle cleanup

### Stage 3 — Additional Browser-Safe Intelligence

Potential additions can then be introduced one at a time:

- weather
- fires
- additional public aviation data
- selected military/public datasets
- improved satellite formats

### Stage 4 — Advanced Visualization

Only after the data layer is stable:

- richer target symbology
- trails
- better target labels
- expanded telemetry
- additional tactical visualization
- more sophisticated camera behavior

The guiding rule remains the same: **function first, expansion second.**

---

## 16. Repository Structure

The Web Core additions are intentionally separated from the larger application:

```text
web-core.html
vite.web-core.config.js

scripts/
└── web-core.mjs

src/web-core/
├── main.js
├── style.css
├── ionToken.js
├── cityNav.js
└── targetIntelligence.js

.github/workflows/
├── web-core-build.yml
└── web-core-pages.yml
```

This makes the Web Core easier to reason about and gives us a clear boundary for future work.

---

## 17. Philosophy

Web Core is being built as a **working system, not a feature checklist**.

The objective is to reach a point where every layer we add is:

- usable
- inspectable
- browser-compatible
- mobile-aware
- responsibly sourced
- independently testable
- removable without destabilizing the core

We started with a globe.

Then we made the globe useful.

Then we made the objects selectable.

Then we made the objects inspectable.

Then we made the camera navigable.

Then we added intelligence around selected targets.

And when a real provider limitation broke the first satellite implementation, we adapted the architecture instead of hiding the failure.

That is the Web Core approach going forward.

---

## License / Upstream

This Web Core branch is built within the `gods-eye-view-test` repository and is maintained as a focused browser-first development path.

The upstream project and its original documentation remain available in the repository history and on the original project branch.
