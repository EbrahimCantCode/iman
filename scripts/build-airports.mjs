// Builds data/airports.json from OurAirports (public domain, https://ourairports.com/data/).
//
//   1. Download https://davidmegginson.github.io/ourairports-data/airports.csv
//      (the same file as https://ourairports.com/data/airports.csv) into an empty folder.
//   2. node scripts/build-airports.mjs <path/to/airports.csv>
//
// Keeps large and medium airports that have an IATA code. OurAirports has no
// time zone column, so each airport gets the IANA zone of the nearest city
// in the same country from data/cities.json (GeoNames).

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TYPES = ['large_airport', 'medium_airport'];

/** Parse CSV (RFC 4180: quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/** Decode data/cities.json rows into { cc, lat, lon, tz }. */
function decodeCityTz(payload) {
  return payload.rows.map((r) => ({ cc: r[2], lat: r[4], lon: r[5], tz: payload.tz[r[6]] }));
}

function nearest(lat, lon, list) {
  let best = null;
  let bestD = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const c of list) {
    const dx = (c.lon - lon) * cosLat;
    const dy = c.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Build the compact airports payload.
 * @param {string[][]} csvRows parsed CSV including the header row
 * @param {object} citiesPayload the data/cities.json object
 */
export function buildAirports(csvRows, citiesPayload) {
  const [header, ...rows] = csvRows;
  const col = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const name of [
    'type',
    'name',
    'latitude_deg',
    'longitude_deg',
    'iso_country',
    'municipality',
    'iata_code',
  ]) {
    if (!(name in col)) throw new Error(`airports.csv: missing column ${name}`);
  }
  const cities = decodeCityTz(citiesPayload);
  const byCountry = new Map();
  for (const c of cities) {
    if (!byCountry.has(c.cc)) byCountry.set(c.cc, []);
    byCountry.get(c.cc).push(c);
  }

  const chosen = new Map(); // IATA -> airport (large wins over medium)
  for (const r of rows) {
    const type = r[col.type];
    const iata = (r[col.iata_code] || '').trim();
    if (!TYPES.includes(type) || !/^[A-Z]{3}$/.test(iata)) continue;
    const lat = Number(r[col.latitude_deg]);
    const lon = Number(r[col.longitude_deg]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      continue;
    const cc = r[col.iso_country];
    const city = nearest(lat, lon, byCountry.get(cc) ?? cities);
    if (!city?.tz) continue;
    const prev = chosen.get(iata);
    if (prev && prev.type === 'large_airport') continue;
    chosen.set(iata, {
      type,
      iata,
      name: r[col.name].trim(),
      city: (r[col.municipality] || '').trim(),
      cc,
      lat: Number(lat.toFixed(3)),
      lon: Number(lon.toFixed(3)),
      tz: city.tz,
    });
  }

  const list = [...chosen.values()].sort((a, b) => a.iata.localeCompare(b.iata));
  const zones = [...new Set(list.map((a) => a.tz))].sort();
  const zoneIndex = new Map(zones.map((z, i) => [z, i]));
  return {
    v: 1,
    source: 'OurAirports (https://ourairports.com/data/), public domain; time zones from GeoNames',
    tz: zones,
    rows: list.map((a) => [
      a.iata,
      a.name,
      a.city,
      a.cc,
      a.lat,
      a.lon,
      zoneIndex.get(a.tz),
      a.type === 'large_airport' ? 1 : 0,
    ]),
  };
}

function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: node scripts/build-airports.mjs <airports.csv>');
    process.exit(1);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const cities = JSON.parse(readFileSync(join(root, 'data', 'cities.json'), 'utf8'));
  const payload = buildAirports(parseCsv(readFileSync(src, 'utf8')), cities);
  const json = JSON.stringify(payload);
  writeFileSync(join(root, 'data', 'airports.json'), json);
  const large = payload.rows.filter((r) => r[7]).length;
  console.log(
    `wrote data/airports.json: ${payload.rows.length} airports (${large} large), ` +
      `${payload.tz.length} time zones, ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
