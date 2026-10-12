// Location: GPS, the bundled city list (data/cities.json) and manual
// coordinates. Nothing here talks to a server; city search and reverse
// lookup ("near Manama") use the bundled file only.

import { deviceTimeZone } from './time.js';
import { MAKKAH } from './config/constants.js';

/** The location stored in settings, or null when none is set yet. */
export function locationFromSettings(values) {
  const lat = values['location.lat'];
  const lon = values['location.lon'];
  if (!validCoords(lat, lon)) return null;
  return {
    lat,
    lon,
    name: values['location.name'] || '',
    country: values['location.country'] || '',
    tz: values['location.tz'] || deviceTimeZone(),
    mode: values['location.mode'],
  };
}

export function validCoords(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** Parse user-typed coordinates; accepts "26.22" and "26,22" decimal commas. */
export function parseCoordinate(text) {
  if (typeof text === 'number') return text;
  if (typeof text !== 'string') return NaN;
  const s = text.trim().replace(',', '.').replace(/[−–]/g, '-');
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const R = 6371.0088; // mean Earth radius, km
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const distanceToMakkahKm = (loc) => haversineKm(loc, MAKKAH);

// ---------------------------------------------------------------- cities

/**
 * Turn the compact cities.json payload into city objects.
 * Format: { v: 1, tz: [zones...], rows: [[name, arName, cc, admin1, lat, lon, tzIndex, pop]...] }
 */
export function decodeCities(payload) {
  if (!payload || payload.v !== 1 || !Array.isArray(payload.rows) || !Array.isArray(payload.tz)) {
    throw new Error('Unsupported cities.json format');
  }
  return payload.rows.map(([name, ar, cc, admin, lat, lon, tzi, pop]) => ({
    name,
    ar: ar || '',
    cc,
    admin: admin || '',
    lat,
    lon,
    tz: payload.tz[tzi] || '',
    pop: pop || 0,
  }));
}

let citiesPromise = null;

/** Load the bundled city list once (cached by the service worker for offline use). */
export function loadCities(url = 'data/cities.json') {
  if (!citiesPromise) {
    citiesPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(decodeCities)
      .catch((err) => {
        citiesPromise = null;
        throw err;
      });
  }
  return citiesPromise;
}

/** Fold case, accents, Arabic diacritics and letter variants for searching. */
export function normalizeSearch(s) {
  return String(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ـ]/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const searchIndex = new WeakMap();

/**
 * Search cities by English or Arabic name. Prefix matches rank first, then
 * word-prefix, then substring; larger cities first within each group.
 */
export function searchCities(query, cities, limit = 30) {
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  let index = searchIndex.get(cities);
  if (!index) {
    index = cities.map((c) => `${normalizeSearch(c.name)}|${normalizeSearch(c.ar)}`);
    searchIndex.set(cities, index);
  }
  const scored = [];
  for (let i = 0; i < cities.length; i++) {
    const hay = index[i];
    const at = hay.indexOf(q);
    if (at < 0) continue;
    const prefix = at === 0 || hay[at - 1] === '|';
    const word = prefix || hay[at - 1] === ' ';
    scored.push([prefix ? 0 : word ? 1 : 2, -cities[i].pop, i]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(([, , i]) => cities[i]);
}

/** The nearest city to a point (used for "near X", the country and time zone). */
export function nearestCity(lat, lon, cities) {
  let best = null;
  let bestD = Infinity;
  const cosLat = Math.cos(rad(lat));
  for (const c of cities) {
    // Cheap equirectangular pre-filter, exact distance only for close ones.
    const dx = (c.lon - lon) * cosLat;
    const dy = c.lat - lat;
    const approx = dx * dx + dy * dy;
    if (approx < bestD) {
      bestD = approx;
      best = c;
    }
  }
  return best ? { city: best, km: haversineKm({ lat, lon }, best) } : null;
}

// ---------------------------------------------------------------- GPS

/**
 * Current position via the Geolocation API.
 * Rejects with an Error whose `code` is "unsupported", "denied", "unavailable" or "timeout".
 */
export function getPosition({ timeout = 15000, highAccuracy = false } = {}) {
  return new Promise((resolve, reject) => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo) {
      reject(Object.assign(new Error('Geolocation unsupported'), { code: 'unsupported' }));
      return;
    }
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        const code = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
        reject(Object.assign(new Error(err.message || code), { code }));
      },
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** Display name for a city: "Manama, Bahrain" (localised name when available). */
export function cityLabel(city, { lang = 'en', country = (cc) => cc } = {}) {
  const name = lang === 'ar' && city.ar ? city.ar : city.name;
  const parts = [name];
  // Region names are only available in English.
  if (lang !== 'ar' && city.admin && city.admin !== city.name) parts.push(city.admin);
  parts.push(country(city.cc));
  return parts.filter(Boolean).join(lang === 'ar' ? '، ' : ', ');
}
