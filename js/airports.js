// Bundled airports (data/airports.json, from OurAirports): decode, search
// by IATA code / city / name, nearest airport. Offline.

import { normalizeSearch } from './location.js';

/** Decode the compact payload into airport objects. */
export function decodeAirports(payload) {
  if (!payload || payload.v !== 1 || !Array.isArray(payload.rows) || !Array.isArray(payload.tz)) {
    throw new Error('Unsupported airports.json format');
  }
  return payload.rows.map(([iata, name, city, cc, lat, lon, tzi, large]) => ({
    iata,
    name,
    city,
    cc,
    lat,
    lon,
    tz: payload.tz[tzi],
    large: large === 1,
  }));
}

let promise = null;
export function loadAirports(url = 'data/airports.json') {
  promise ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(decodeAirports)
    .catch((err) => {
      promise = null;
      throw err;
    });
  return promise;
}

const index = new WeakMap();

/** Search by IATA code (exact first), then city and name prefixes; large airports first. */
export function searchAirports(query, airports, limit = 12) {
  const raw = String(query).trim();
  const q = normalizeSearch(raw);
  if (!q) return [];
  let idx = index.get(airports);
  if (!idx) {
    idx = airports.map((a) => `${normalizeSearch(a.city)}|${normalizeSearch(a.name)}`);
    index.set(airports, idx);
  }
  const code = raw.toUpperCase();
  const scored = [];
  airports.forEach((a, i) => {
    let score;
    if (a.iata === code) score = 0;
    else {
      const at = idx[i].indexOf(q);
      if (at < 0 || q.length < 2) return;
      const prefix = at === 0 || idx[i][at - 1] === '|' || idx[i][at - 1] === ' ';
      score = prefix ? 1 : 2;
    }
    scored.push([score, a.large ? 0 : 1, i]);
  });
  scored.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return scored.slice(0, limit).map(([, , i]) => airports[i]);
}

/** Nearest airport to a point, with its distance in km (equirectangular approximation). */
export function nearestAirport(lat, lon, airports) {
  let best = null;
  let bestD = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const a of airports) {
    let dLon = Math.abs(a.lon - lon);
    if (dLon > 180) dLon = 360 - dLon;
    const dx = dLon * cosLat;
    const dy = a.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best ? { airport: best, km: Math.sqrt(bestD) * 111.195 } : null;
}
