const AIRPORT_SOURCE_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const CACHE_KEY = 'gev.ourairports.large.v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

function parseAirportsCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('OURAIRPORTS DATASET EMPTY');

  const headers = parseCsvLine(lines[0]);
  const index = new Map(headers.map((header, position) => [header, position]));
  const value = (row, key) => row[index.get(key)] ?? '';
  const airports = [];

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    if (value(row, 'type') !== 'large_airport') continue;

    const latitude = Number(value(row, 'latitude_deg'));
    const longitude = Number(value(row, 'longitude_deg'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const elevationFt = Number(value(row, 'elevation_ft'));
    airports.push({
      ident: value(row, 'ident'),
      iata: value(row, 'iata_code'),
      name: value(row, 'name') || value(row, 'ident') || 'UNKNOWN AIRPORT',
      latitude,
      longitude,
      elevationM: Number.isFinite(elevationFt) ? elevationFt * 0.3048 : 0,
      elevationFt: Number.isFinite(elevationFt) ? elevationFt : null,
      isoCountry: value(row, 'iso_country'),
      isoRegion: value(row, 'iso_region'),
      municipality: value(row, 'municipality'),
      gpsCode: value(row, 'gps_code'),
      localCode: value(row, 'local_code'),
      homeLink: value(row, 'home_link'),
      wikipediaLink: value(row, 'wikipedia_link'),
      type: 'large_airport',
      source: 'OURAIRPORTS // PUBLIC DOMAIN',
    });
  }

  if (!airports.length) throw new Error('NO LARGE AIRPORTS IN DATASET');
  return airports;
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached?.airports?.length && Number.isFinite(Number(cached.timestamp)) && Date.now() - Number(cached.timestamp) < CACHE_TTL_MS) {
      return cached.airports;
    }
  } catch {
    // Ignore malformed or unavailable browser storage.
  }
  return null;
}

function writeCache(airports) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), airports }));
  } catch {
    // Dataset remains usable for the current session when storage is unavailable.
  }
}

export async function loadMajorAirports() {
  const cached = readCache();
  if (cached) return { airports: cached, cached: true };

  const response = await fetch(AIRPORT_SOURCE_URL, {
    mode: 'cors',
    headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8' },
  });
  if (!response.ok) throw new Error(`OURAIRPORTS ${response.status} ${response.statusText}`);

  const airports = parseAirportsCsv(await response.text());
  writeCache(airports);
  return { airports, cached: false };
}
