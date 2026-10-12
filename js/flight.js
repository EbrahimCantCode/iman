// In-flight prayer times (pure, offline).
//
// Model and its limits (also shown in the UI):
// - The aircraft follows the great-circle route between the two airports
//   and progresses linearly over the flight time. Taxi, climb and real
//   routes (airways, detours) are ignored.
// - Prayer times are computed at the estimated position at ground level:
//   adhan-js has no altitude/elevation input, so sunrise and sunset at
//   cruising altitude come a few minutes earlier/later than shown.
// - The flight is stepped in small time steps; a prayer begins when the
//   time on board passes the prayer time computed at the current position.

import { Coordinates, PrayerTimes } from '../lib/adhan/adhan.esm.min.js';
import { buildParams } from './prayer.js';
import { qiblaBearing } from './qibla.js';
import { haversineKm } from './location.js';
import { addDays, adhanDate, MINUTE } from './time.js';

export const FLIGHT_EVENTS = Object.freeze(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Point at fraction `f` (0..1) along the great circle from `a` to `b`. */
export function greatCirclePoint(a, b, f) {
  const φ1 = rad(a.lat);
  const λ1 = rad(a.lon);
  const φ2 = rad(b.lat);
  const λ2 = rad(b.lon);
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
      ),
    );
  if (d < 1e-12) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

/** The calendar day of local mean solar time at a longitude (for adhan's date). */
export function solarDay(t, lon) {
  const d = new Date(t.getTime() + (lon / 15) * 3_600_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const valid = (d) => d instanceof Date && !Number.isNaN(d.getTime());

/** Prayer times at a position for a calendar day, with the user's settings. */
export function timesAt(pos, day, values, methodCountry = '') {
  const { params } = buildParams(values, { lat: pos.lat, lon: pos.lon, country: methodCountry });
  const pt = new PrayerTimes(new Coordinates(pos.lat, pos.lon), adhanDate(day), params);
  const out = {};
  for (const ev of FLIGHT_EVENTS) out[ev] = valid(pt[ev]) ? pt[ev] : null;
  return out;
}

// A real crossing changes "time on board minus prayer time" by about one step;
// a jump of hours means the day series shifted (e.g. at the date line).
const MAX_JUMP = 45 * MINUTE;
// Two crossings of the same prayer this close together are the same event.
const SAME_EVENT = 20 * MINUTE;
// Report "the sun barely sets/rises" when a prayer time came this close.
const NEAR_MISS = 20 * MINUTE;

/**
 * Prayer times during a flight.
 * @param {object} p
 * @param {{lat:number, lon:number}} p.from departure airport
 * @param {{lat:number, lon:number}} p.to arrival airport
 * @param {Date} p.departure take-off instant
 * @param {Date} p.arrival landing instant
 * @param {object} p.values settings (method, Asr madhab, high-latitude rule, adjustments)
 * @param {string} [p.methodCountry] country used when the method is "auto"
 * @param {number} [p.stepMinutes]
 * @returns {{events: object[], nearMisses: object[], atDeparture: string|null, distanceKm: number, maxLat: number}}
 */
export function flightPrayers({
  from,
  to,
  departure,
  arrival,
  values,
  methodCountry = '',
  stepMinutes = 1,
}) {
  const total = arrival - departure;
  if (!(total > 0)) throw new Error('arrival must be after departure');
  const step = stepMinutes * MINUTE;
  const positionAt = (t) =>
    greatCirclePoint(from, to, Math.min(1, Math.max(0, (t - departure) / total)));

  const last = new Map(); // `${event}|${day}` -> previous (t - prayerTime)
  const closest = new Map(); // event -> smallest |t - prayerTime| seen
  const events = [];
  let maxLat = -90;
  let prevT = null;

  const steps = Math.ceil(total / step);
  for (let i = 0; i <= steps; i++) {
    const t = new Date(Math.min(departure.getTime() + i * step, arrival.getTime()));
    const pos = positionAt(t);
    maxLat = Math.max(maxLat, Math.abs(pos.lat));
    const center = solarDay(t, pos.lon);
    for (const day of [addDays(center, -1), center, addDays(center, 1)]) {
      const times = timesAt(pos, day, values, methodCountry);
      for (const ev of FLIGHT_EVENTS) {
        const T = times[ev];
        if (!T) continue;
        const diff = t - T;
        const key = `${ev}|${day}`;
        const prev = last.get(key);
        if (prev !== undefined && prev < 0 && diff >= 0 && diff - prev < MAX_JUMP) {
          // Refine the crossing inside the step by bisection (the prayer time
          // moves with the aircraft, so linear interpolation isn't enough).
          let lo = prevT;
          let hi = t.getTime();
          for (let k = 0; k < 12; k++) {
            const mid = (lo + hi) / 2;
            const T2 = timesAt(positionAt(new Date(mid)), day, values, methodCountry)[ev];
            if (T2 && mid - T2 < 0) lo = mid;
            else hi = mid;
          }
          const at = new Date(hi);
          const dup = events.some((e) => e.prayer === ev && Math.abs(e.time - at) < SAME_EVENT);
          if (!dup) {
            const p = positionAt(at);
            events.push({
              prayer: ev,
              time: at,
              position: { lat: p.lat, lon: p.lon },
              minutesAfterDeparture: Math.round((at - departure) / MINUTE),
              qibla: qiblaBearing(p.lat, p.lon),
            });
          }
        }
        last.set(key, diff);
        if (Math.abs(diff) < (closest.get(ev) ?? Infinity)) closest.set(ev, Math.abs(diff));
      }
    }
    prevT = t.getTime();
  }

  events.sort((a, b) => a.time - b.time);
  // Sunset or dawn that almost happened but didn't (e.g. flying west at sunset).
  const nearMisses = ['maghrib', 'fajr', 'sunrise']
    .filter((ev) => !events.some((e) => e.prayer === ev) && closest.get(ev) < NEAR_MISS)
    .map((ev) => ({ prayer: ev, minutes: Math.round(closest.get(ev) / MINUTE) }));

  return {
    events,
    nearMisses,
    atDeparture: prayerAt(departure, from, values, methodCountry),
    distanceKm: haversineKm(from, to),
    maxLat,
  };
}

/** The prayer whose time has started at an instant and place (null between sunrise and Dhuhr). */
export function prayerAt(t, pos, values, methodCountry = '') {
  const center = solarDay(t, pos.lon);
  let best = null;
  for (const day of [addDays(center, -1), center]) {
    const times = timesAt(pos, day, values, methodCountry);
    for (const ev of FLIGHT_EVENTS) {
      if (times[ev] && times[ev] <= t && (!best || times[ev] > best.time))
        best = { prayer: ev, time: times[ev] };
    }
  }
  return best && best.prayer !== 'sunrise' ? best.prayer : null;
}
