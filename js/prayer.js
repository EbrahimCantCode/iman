// Prayer time calculation (adhan-js wrapper), next prayer and current window.
// Pure functions: no DOM, so they run in Node tests too.

import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
  SunnahTimes,
} from '../lib/adhan/adhan.esm.min.js';
import { PRAYERS } from './config/constants.js';
import { CUSTOM_METHOD, resolveMethod } from './config/methods.js';
import { adhanDate, addDays, ymd, MINUTE } from './time.js';

const HIGH_LAT = {
  middle: HighLatitudeRule.MiddleOfTheNight,
  seventh: HighLatitudeRule.SeventhOfTheNight,
  twilight: HighLatitudeRule.TwilightAngle,
};

/** Settings that change the calculation (used as a cache key). */
const CALC_KEYS = [
  'prayer.method',
  'prayer.customFajrAngle',
  'prayer.customIshaMode',
  'prayer.customIshaAngle',
  'prayer.customIshaMinutes',
  'prayer.madhab',
  'prayer.highLatRule',
  'prayer.adjust.fajr',
  'prayer.adjust.sunrise',
  'prayer.adjust.dhuhr',
  'prayer.adjust.asr',
  'prayer.adjust.maghrib',
  'prayer.adjust.isha',
  'prayer.imsakMinutes',
  'prayer.duhaMinutes',
];

/** adhan CalculationParameters for the user's settings and location. */
export function buildParams(values, loc) {
  const methodId = resolveMethod(values['prayer.method'], loc?.country);
  let params;
  if (methodId === CUSTOM_METHOD) {
    params = CalculationMethod.Other();
    params.fajrAngle = values['prayer.customFajrAngle'];
    if (values['prayer.customIshaMode'] === 'minutes') {
      params.ishaAngle = 0;
      params.ishaInterval = values['prayer.customIshaMinutes'];
    } else {
      params.ishaAngle = values['prayer.customIshaAngle'];
    }
  } else {
    params = CalculationMethod[methodId]();
  }
  params.madhab = values['prayer.madhab'] === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  const rule = values['prayer.highLatRule'];
  params.highLatitudeRule =
    HIGH_LAT[rule] ?? HighLatitudeRule.recommended(new Coordinates(loc.lat, loc.lon));
  // Near the poles some times don't exist on some days; use the closest day that has them.
  params.polarCircleResolution = PolarCircleResolution.AqrabYaum;
  params.adjustments = {
    fajr: values['prayer.adjust.fajr'],
    sunrise: values['prayer.adjust.sunrise'],
    dhuhr: values['prayer.adjust.dhuhr'],
    asr: values['prayer.adjust.asr'],
    maghrib: values['prayer.adjust.maghrib'],
    isha: values['prayer.adjust.isha'],
  };
  return { params, methodId };
}

const valid = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null);

const cache = new Map();
const CACHE_MAX = 16;

/**
 * All times for one calendar day at a location.
 * @param {{lat:number, lon:number, tz:string, country?:string}} loc
 * @param {string} day "YYYY-MM-DD" in the location's time zone
 * @param {object} values settings values
 */
export function computeDay(loc, day, values) {
  const key = [loc.lat, loc.lon, loc.country, day, ...CALC_KEYS.map((k) => values[k])].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const { params, methodId } = buildParams(values, loc);
  const coords = new Coordinates(loc.lat, loc.lon);
  const pt = new PrayerTimes(coords, adhanDate(day), params);
  let midnight = null;
  let lastThird = null;
  try {
    const sunnah = new SunnahTimes(pt);
    midnight = valid(sunnah.middleOfTheNight);
    lastThird = valid(sunnah.lastThirdOfTheNight);
  } catch {
    /* polar edge cases: leave optional times empty */
  }
  const fajr = valid(pt.fajr);
  const sunrise = valid(pt.sunrise);
  const result = Object.freeze({
    day,
    methodId,
    fajr,
    sunrise,
    dhuhr: valid(pt.dhuhr),
    asr: valid(pt.asr),
    maghrib: valid(pt.maghrib),
    isha: valid(pt.isha),
    imsak: fajr && new Date(fajr.getTime() - values['prayer.imsakMinutes'] * MINUTE),
    duha: sunrise && new Date(sunrise.getTime() + values['prayer.duhaMinutes'] * MINUTE),
    midnight,
    lastThird,
  });

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

/** Yesterday, today and tomorrow (location-local) around `now`. */
export function getSchedule(now, loc, values) {
  const today = ymd(now, loc.tz);
  return {
    tz: loc.tz,
    yesterday: computeDay(loc, addDays(today, -1), values),
    today: computeDay(loc, today, values),
    tomorrow: computeDay(loc, addDays(today, 1), values),
  };
}

/**
 * The next obligatory prayer after `now`. After Isha it is tomorrow's Fajr.
 * @returns {{prayer: string, time: Date, day: string}}
 */
export function nextPrayer(now, schedule) {
  for (const day of [schedule.today, schedule.tomorrow]) {
    for (const p of PRAYERS) {
      const t = day[p];
      if (t && t > now) return { prayer: p, time: t, day: day.day };
    }
  }
  return null;
}

/**
 * End of a prayer's window.
 * Fajr ends at sunrise, Dhuhr at Asr, Asr at Maghrib, Maghrib at Isha and
 * Isha at the Islamic midnight or at the next Fajr ("reminders.ishaEnd").
 */
export function windowEnd(prayer, day, nextDay, ishaEnd = 'midnight') {
  switch (prayer) {
    case 'fajr':
      return day.sunrise;
    case 'dhuhr':
      return day.asr;
    case 'asr':
      return day.maghrib;
    case 'maghrib':
      return day.isha;
    case 'isha':
      return ishaEnd === 'fajr' ? nextDay.fajr : (day.midnight ?? nextDay.fajr);
    default:
      return null;
  }
}

/**
 * The prayer whose window contains `now`, if any (none between sunrise and
 * Dhuhr). Isha is treated as lasting until the next Fajr for highlighting.
 * @returns {{prayer: string, start: Date, end: Date, day: string} | null}
 */
export function currentPrayer(now, schedule) {
  const { yesterday, today, tomorrow } = schedule;
  if (today.fajr && now < today.fajr) {
    return yesterday.isha
      ? { prayer: 'isha', start: yesterday.isha, end: today.fajr, day: yesterday.day }
      : null;
  }
  const windows = [
    ['fajr', today.fajr, today.sunrise],
    ['dhuhr', today.dhuhr, today.asr],
    ['asr', today.asr, today.maghrib],
    ['maghrib', today.maghrib, today.isha],
    ['isha', today.isha, tomorrow.fajr],
  ];
  for (const [prayer, start, end] of windows) {
    if (start && end && now >= start && now < end) return { prayer, start, end, day: today.day };
  }
  return null;
}
