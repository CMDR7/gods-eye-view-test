# Web Core Aircraft Relay

## Why it exists

The Web Core is deployed as a static GitHub Pages application. The public ADS-B providers used by GEV are not a dependable browser-direct transport: ADSB.lol does not expose the required browser CORS path, and Airplanes.live can reject anonymous browser requests. A tiny same-origin-safe relay is therefore required for reliable live aircraft data.

## Relay

`workers/aircraft-relay.js` is a Cloudflare Worker that:

- accepts `GET /aircraft?lat=<lat>&lon=<lon>&radius=<nm>`;
- clamps the radius to 250 NM;
- queries Airplanes.live first;
- falls back to ADSB.lol;
- returns the upstream `ac` array plus provider metadata;
- adds `Access-Control-Allow-Origin: *` for the Web Core browser;
- does not store aircraft data.

Cloudflare's Workers Free plan currently includes 100,000 requests/day, which is more than sufficient for a single GEV Web Core aircraft layer at a 60-second refresh cadence.

## Configure Web Core

After deploying the Worker, copy its HTTPS URL into the `gev-aircraft-relay` meta tag in `web-core.html`:

```html
<meta name="gev-aircraft-relay" content="https://YOUR-WORKER.workers.dev" />
```

The browser then requests the relay instead of attempting to access the upstream aircraft APIs directly.

## Security boundary

The Worker only accepts GET/OPTIONS requests and only contacts the two explicitly allowlisted ADS-B provider origins. It does not become a general-purpose CORS proxy.

## GEV boundary

The relay is transport infrastructure only. Aircraft normalization, Cesium entities, picking, target inspection, FLY TO, TRACK, and motion remain in the Web Core client.
