// Travel mode logic (pure, no DOM): which rulings apply, whether the user
// looks like a traveller, stay counting, shortened prayers, combined
// prayer windows and the next prayer when combining. Plus a small store
// for the current trip, saved trips and dismissed suggestions.
//
// The rulings themselves live in js/config/travel-rules.js only.

import {
  TRAVEL_RULES,
  TRAVEL_MADHABS,
  SHORTENED_PRAYERS,
  COMBINE_PAIRS,
} from './config/travel-rules.js';
import { STORAGE_KEYS } from './config/constants.js';
import { haversineKm, validCoords } from './location.js';
import { readJSON, writeJSON, isPlainObject } from './storage.js';
import { daysBetween, isYmd, addDays } from './time.js';
import { windowEnd, computeDay } from './prayer.js';
import { suggestMethod } from './config/methods.js';

export const KM_PER_MILE = 1.609344;

// ---------------------------------------------------------------- rulings

/** The madhab used for travel rulings ("auto" follows the Asr setting). */
export function resolveTravelMadhab(values) {
  const m = values['travel.madhab'];
  if (m === 'custom' || TRAVEL_MADHABS.includes(m)) return m;
  return values['prayer.madhab'] === 'hanafi' ? 'hanafi' : 'shafii';
}

/** The rules in effect: a madhab entry from travel-rules.js, or the user's custom values. */
export function travelRules(values) {
  const madhab = resolveTravelMadhab(values);
  if (madhab !== 'custom') return { madhab, ...TRAVEL_RULES[madhab] };
  const c = values['travel.customCombining'];
  const combining = c === 'both' ? ['early', 'delayed'] : c === 'none' ? [] : [c];
  return {
    madhab,
    distanceKm: values['travel.customDistanceKm'],
    distanceRangeKm: null,
    maxStayDays: values['travel.customMaxStayDays'],
    stayLimit: 'moreThan',
    excludeArrivalDeparture: true,
    shortening: values['travel.customShortening'],
    combining,
    formalCombining: false,
    flight: { seatedIfCannotStand: true, combineIfAllowed: combining.length > 0 },
    sources: [],
  };
}

/** "early" | "delayed" | "off": the user's combining choice, if their rules allow it. */
export function combineMode(values, rules, active) {
  const mode = values['travel.combineMode'];
  return active && rules.combining.includes(mode) ? mode : 'off';
}

/** Rak'ah info for a prayer while travelling, or null if it is never shortened. */
export function shortenedRakahs(prayer, rules) {
  if (!SHORTENED_PRAYERS.includes(prayer)) return null;
  return { normal: 4, shortened: 2, shortening: rules.shortening };
}

export const toUnits = (km, units) => (units === 'mi' ? km / KM_PER_MILE : km);

// ---------------------------------------------------------------- distance & suggestions

/** Distance from home and whether it is beyond the madhab's travel distance. */
export function distanceFromHome(home, here, rules) {
  if (!home || !here || !validCoords(home.lat, home.lon) || !validCoords(here.lat, here.lon)) {
    return null;
  }
  const km = haversineKm(home, here);
  return { km, away: km > rules.distanceKm };
}

/**
 * Should Iman suggest starting or ending travel mode? It never switches by
 * itself, and a manual choice always wins:
 * - after the user turns travel mode off, nothing is suggested again until
 *   they have moved `travel.resuggestKm` from where they turned it off;
 * - if they turned it on near home, ending is never suggested until they
 *   have actually been away.
 * @returns {{type: 'start'|'end', km: number} | null}
 */
export function travelSuggestion({ values, home, here, trip, dismissedAt, endDismissedAt }) {
  if (!values['travel.autoDetect']) return null;
  const d = distanceFromHome(home, here, travelRules(values));
  if (!d) return null;
  const movedFrom = (p) => !p || haversineKm(p, here) >= values['travel.resuggestKm'];
  if (!values['travel.enabled']) {
    return d.away && movedFrom(dismissedAt) ? { type: 'start', km: d.km } : null;
  }
  if (!d.away && trip?.wasAway && movedFrom(endDismissedAt)) return { type: 'end', km: d.km };
  return null;
}

// ---------------------------------------------------------------- stay length

/** Calendar day number of the trip: the start day is day 1. */
export function tripDayNumber(startDate, today) {
  return daysBetween(startDate, today) + 1;
}

/**
 * Days that count towards the stay limit for a stay of `totalDays` calendar
 * days (arrival and departure days included in `totalDays`).
 */
export function countedStayDays(totalDays, rules) {
  return rules.excludeArrivalDeparture ? Math.max(0, totalDays - 2) : totalDays;
}

/** Whether an intended stay (in counted days) still counts as travelling. */
export function isTravellerForStay(counted, rules) {
  return rules.stayLimit === 'atLeast' ? counted < rules.maxStayDays : counted <= rules.maxStayDays;
}

/**
 * Where the user is relative to the stay limit.
 * Days so far count the arrival day only when the madhab counts it (the
 * departure day hasn't happened yet).
 */
export function stayStatus({ startDate, today, plannedDays, rules, values }) {
  const dayNumber = tripDayNumber(startDate, today);
  const countedSoFar = rules.excludeArrivalDeparture ? dayNumber - 1 : dayNumber;
  // The first counted day on which the user would no longer be a traveller.
  const limitDay = rules.stayLimit === 'atLeast' ? rules.maxStayDays : rules.maxStayDays + 1;
  const remaining = limitDay - countedSoFar;
  const planned =
    Number.isInteger(plannedDays) && plannedDays > 0
      ? {
          days: plannedDays,
          counted: countedStayDays(plannedDays, rules),
          traveller: isTravellerForStay(countedStayDays(plannedDays, rules), rules),
        }
      : null;
  return {
    dayNumber,
    countedSoFar,
    limitDay,
    remaining,
    approaching:
      Boolean(values['travel.stayReminder']) &&
      remaining >= 0 &&
      remaining <= values['travel.stayReminderDays'],
    pastLimit: remaining < 0,
    planned,
  };
}

// ---------------------------------------------------------------- combining

/**
 * Combined prayer windows for a day: the whole span in which the pair may be
 * prayed together, and the early (taqdim) / delayed (ta'khir) parts.
 */
export function combinedWindows(day, nextDay, ishaEnd = 'midnight') {
  return COMBINE_PAIRS.map(([first, second]) => {
    const firstStart = day[first];
    const secondStart = day[second];
    const end = windowEnd(second, day, nextDay ?? {}, ishaEnd);
    return {
      pair: [first, second],
      start: firstStart,
      end,
      early: { start: firstStart, end: secondStart },
      delayed: { start: secondStart, end },
    };
  }).filter((w) => w.start && w.end);
}

/** Hanafi option: Dhuhr at the end of its own time, Asr at the start of its own time. */
export function formalCombining(day) {
  return { dhuhrUntil: day.asr, asrFrom: day.asr, maghribUntil: day.isha, ishaFrom: day.isha };
}

/** Prayer "slots" for a day: single prayers, or pairs prayed together. */
export function prayerSlots(day, mode = 'off') {
  const one = (p) => ({ prayers: [p], time: day[p], day: day.day });
  if (mode === 'early') {
    return [
      one('fajr'),
      { prayers: ['dhuhr', 'asr'], time: day.dhuhr, day: day.day },
      { prayers: ['maghrib', 'isha'], time: day.maghrib, day: day.day },
    ];
  }
  if (mode === 'delayed') {
    return [
      one('fajr'),
      { prayers: ['dhuhr', 'asr'], time: day.asr, day: day.day },
      { prayers: ['maghrib', 'isha'], time: day.isha, day: day.day },
    ];
  }
  return ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map(one);
}

/**
 * Next prayer (or combined pair) after `now`. With early combining, Asr is
 * prayed with Dhuhr, so after Dhuhr time the next one is Maghrib (+ Isha).
 * @returns {{prayer: string, prayers: string[], time: Date, day: string} | null}
 */
export function nextPrayerTravel(now, schedule, mode = 'off') {
  for (const day of [schedule.today, schedule.tomorrow]) {
    for (const slot of prayerSlots(day, mode)) {
      if (slot.time && slot.time > now) return { ...slot, prayer: slot.prayers[0] };
    }
  }
  return null;
}

/**
 * A combined pair whose combining window is open now and that isn't marked
 * as prayed yet, e.g. "Dhuhr + Asr together, until 14:44".
 */
export function openCombinedPair(now, schedule, mode, ishaEnd, isDone = () => false) {
  if (mode === 'off') return null;
  for (const [day, next] of [
    [schedule.yesterday, schedule.today],
    [schedule.today, schedule.tomorrow],
  ]) {
    for (const w of combinedWindows(day, next, ishaEnd)) {
      const span = w[mode];
      if (span.start && span.end && now >= span.start && now < span.end) {
        if (w.pair.every((p) => isDone(day.day, p))) continue;
        return { pair: w.pair, day: day.day, until: span.end, from: span.start };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- store

const isPlace = (p) =>
  isPlainObject(p) && validCoords(p.lat, p.lon) && typeof (p.name ?? '') === 'string';

function cleanPlace(p) {
  if (!isPlace(p)) return null;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  return {
    lat: p.lat,
    lon: p.lon,
    name: str(p.name, 120),
    nameAr: str(p.nameAr, 120),
    country: /^[A-Z]{2}$/.test(p.country ?? '') ? p.country : '',
    tz: str(p.tz, 64),
  };
}

function cleanTrip(t) {
  if (!isPlainObject(t) || typeof t.id !== 'string' || !isYmd(t.start) || !isYmd(t.end))
    return null;
  const destination = cleanPlace(t.destination);
  if (!destination || t.end < t.start) return null;
  return {
    id: t.id.slice(0, 40),
    destination,
    start: t.start,
    end: t.end,
    method: t.method === 'suggested' ? 'suggested' : 'mine',
  };
}

function cleanCurrent(c) {
  if (!isPlainObject(c) || !isYmd(c.startDate)) return null;
  return {
    startDate: c.startDate,
    destination: cleanPlace(c.destination),
    plannedDays:
      Number.isInteger(c.plannedDays) && c.plannedDays > 0 && c.plannedDays < 1000
        ? c.plannedDays
        : null,
    wasAway: c.wasAway === true,
    tripId: typeof c.tripId === 'string' ? c.tripId.slice(0, 40) : null,
    previousMethod: typeof c.previousMethod === 'string' ? c.previousMethod.slice(0, 40) : null,
  };
}

const PRAYER_NAMES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const isIsoTime = (s) => typeof s === 'string' && s.length < 40 && !Number.isNaN(Date.parse(s));

function cleanAirport(a) {
  const p = cleanPlace(a);
  if (!p || !/^[A-Z]{3}$/.test(a.iata ?? '') || !p.tz) return null;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  return {
    iata: a.iata,
    name: str(a.name, 120),
    city: str(a.city, 80),
    cc: /^[A-Z]{2}$/.test(a.cc ?? '') ? a.cc : '',
    lat: p.lat,
    lon: p.lon,
    tz: p.tz,
  };
}

function cleanFlight(f) {
  if (!isPlainObject(f) || typeof f.id !== 'string') return null;
  const from = cleanAirport(f.from);
  const to = cleanAirport(f.to);
  if (!from || !to || !isIsoTime(f.departure) || !isIsoTime(f.arrival)) return null;
  const events = (Array.isArray(f.events) ? f.events : [])
    .filter(
      (e) =>
        isPlainObject(e) &&
        PRAYER_NAMES.includes(e.prayer) &&
        isIsoTime(e.time) &&
        validCoords(e.lat, e.lon),
    )
    .slice(0, 20)
    .map((e) => ({ prayer: e.prayer, time: e.time, lat: e.lat, lon: e.lon }));
  return {
    id: f.id.slice(0, 40),
    from,
    to,
    departure: f.departure,
    arrival: f.arrival,
    remind: f.remind === true,
    events,
  };
}

/** Validate stored travel data (never trusted). */
export function validateTravelData(raw) {
  const d = isPlainObject(raw) ? raw : {};
  const point = (p) =>
    isPlainObject(p) && validCoords(p.lat, p.lon) ? { lat: p.lat, lon: p.lon } : null;
  return {
    version: 1,
    current: cleanCurrent(d.current),
    trips: (Array.isArray(d.trips) ? d.trips : []).map(cleanTrip).filter(Boolean).slice(0, 100),
    flights: (Array.isArray(d.flights) ? d.flights : [])
      .map(cleanFlight)
      .filter(Boolean)
      .slice(0, 20),
    dismissedAt: point(d.dismissedAt),
    endDismissedAt: point(d.endDismissedAt),
    offeredTrips: (Array.isArray(d.offeredTrips) ? d.offeredTrips : [])
      .filter((x) => typeof x === 'string')
      .slice(-100),
  };
}

let idCounter = 0;
export const newTripId = (now = Date.now()) =>
  `${now.toString(36)}${(idCounter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function createTravelStore({ storage, key = STORAGE_KEYS.travel }) {
  let data = validateTravelData(readJSON(storage, key, null));
  const listeners = new Set();
  const commit = (next) => {
    data = validateTravelData(next);
    writeJSON(storage, key, data);
    for (const fn of listeners) {
      try {
        fn(data);
      } catch (err) {
        console.error(err);
      }
    }
  };
  return {
    get: () => data,
    current: () => data.current,
    /** Start a trip (travel mode on). */
    start({
      startDate,
      destination = null,
      plannedDays = null,
      tripId = null,
      previousMethod = null,
      wasAway = false,
    }) {
      commit({
        ...data,
        current: { startDate, destination, plannedDays, tripId, previousMethod, wasAway },
        endDismissedAt: null,
      });
    },
    updateCurrent(patch) {
      if (!data.current) return;
      commit({ ...data, current: { ...data.current, ...patch } });
    },
    /** End the trip. `here` is remembered so the start isn't suggested again on the spot. */
    end(here = null) {
      commit({ ...data, current: null, dismissedAt: here, endDismissedAt: null });
    },
    dismissStart: (here) => commit({ ...data, dismissedAt: here }),
    dismissEnd: (here) => commit({ ...data, endDismissedAt: here }),
    saveTrip(trip) {
      const trips = data.trips.filter((t) => t.id !== trip.id);
      commit({ ...data, trips: [...trips, trip].sort((a, b) => a.start.localeCompare(b.start)) });
    },
    deleteTrip: (id) => commit({ ...data, trips: data.trips.filter((t) => t.id !== id) }),
    markOffered: (id) => commit({ ...data, offeredTrips: [...data.offeredTrips, id] }),
    saveFlight(flight) {
      const flights = data.flights.filter((f) => f.id !== flight.id);
      commit({ ...data, flights: [...flights, flight] });
    },
    deleteFlight: (id) => commit({ ...data, flights: data.flights.filter((f) => f.id !== id) }),
    clear: () => commit({}),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** A saved trip that starts today (or is under way) and hasn't been offered yet. */
export function tripToOffer(data, today) {
  if (data.current) return null;
  return (
    data.trips.find(
      (t) => t.start <= today && today <= t.end && !data.offeredTrips.includes(t.id),
    ) ?? null
  );
}

/**
 * Settings to use for a trip's destination: the method suggested for the
 * destination country when the trip says "suggested", otherwise the user's.
 */
export function tripValues(trip, values) {
  return trip.method === 'suggested'
    ? { ...values, 'prayer.method': suggestMethod(trip.destination.country) }
    : values;
}

/**
 * Prayer times at the destination for every day of a trip, computed for the
 * destination's calendar days (format them in `trip.destination.tz`).
 */
export function tripTimes(trip, values) {
  const v = tripValues(trip, values);
  const loc = { ...trip.destination, tz: trip.destination.tz || 'UTC' };
  return tripDates(trip).map((date) => computeDay(loc, date, v));
}

/** Calendar days of a trip, inclusive. */
export function tripDates(trip) {
  const out = [];
  for (let d = trip.start; d <= trip.end && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}
