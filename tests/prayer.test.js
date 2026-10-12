import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDay,
  getSchedule,
  nextPrayer,
  currentPrayer,
  windowEnd,
  buildParams,
} from '../js/prayer.js';
import { defaultValues } from '../js/settings.js';
import { suggestMethod, resolveMethod } from '../js/config/methods.js';

const MANAMA = { lat: 26.2235, lon: 50.5876, tz: 'Asia/Bahrain', country: 'BH' };
const kuwait = { ...defaultValues(), 'prayer.method': 'Kuwait' };

const hm = (d, tz = 'Asia/Bahrain') =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

/** An instant given as Bahrain wall-clock time (UTC+3, no DST). */
const bh = (s) => new Date(`${s}+03:00`);

describe('Manama reference timetable (Kuwait method, 2026-10-12)', () => {
  test('matches the expected times', () => {
    const d = computeDay(MANAMA, '2026-10-12', kuwait);
    assert.equal(hm(d.fajr), '04:18');
    assert.equal(hm(d.dhuhr), '11:24');
    assert.equal(hm(d.asr), '14:44');
    assert.equal(hm(d.maghrib), '17:13');
    assert.equal(hm(d.isha), '18:27');
  });

  test('does not depend on the device time zone', () => {
    const original = process.env.TZ;
    try {
      for (const [i, tz] of ['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'].entries()) {
        process.env.TZ = tz;
        // A negligibly different latitude defeats the memo cache.
        const loc = { ...MANAMA, lat: MANAMA.lat + (i + 1) * 1e-9 };
        const d = computeDay(loc, '2026-10-12', kuwait);
        assert.equal(hm(d.fajr), '04:18', tz);
        assert.equal(hm(d.isha), '18:27', tz);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  test('auto method resolves to the country suggestion', () => {
    const auto = computeDay(MANAMA, '2026-10-12', defaultValues());
    assert.equal(auto.methodId, 'Kuwait');
    assert.equal(hm(auto.fajr), '04:18');
  });
});

describe('minute adjustments', () => {
  test('shift each time by the configured minutes', () => {
    const adjusted = computeDay(MANAMA, '2026-10-12', {
      ...kuwait,
      'prayer.adjust.fajr': 2,
      'prayer.adjust.dhuhr': -3,
      'prayer.adjust.isha': 30,
      'prayer.adjust.sunrise': -30,
    });
    assert.equal(hm(adjusted.fajr), '04:20');
    assert.equal(hm(adjusted.dhuhr), '11:21');
    assert.equal(hm(adjusted.isha), '18:57');
    assert.equal(hm(adjusted.sunrise), '05:05');
    assert.equal(hm(adjusted.asr), '14:44');
  });

  test('imsak and duha are offsets from fajr and sunrise', () => {
    const d = computeDay(MANAMA, '2026-10-12', {
      ...kuwait,
      'prayer.imsakMinutes': 10,
      'prayer.duhaMinutes': 20,
    });
    assert.equal(hm(d.imsak), '04:08');
    assert.equal(hm(d.duha), '05:55');
  });
});

describe('methods', () => {
  test('Hanafi Asr is later than Standard', () => {
    const std = computeDay(MANAMA, '2026-10-12', kuwait);
    const hanafi = computeDay(MANAMA, '2026-10-12', { ...kuwait, 'prayer.madhab': 'hanafi' });
    assert.ok(hanafi.asr - std.asr > 30 * 60_000);
  });

  test('custom method uses the user angles or Isha minutes', () => {
    const base = { ...defaultValues(), 'prayer.method': 'Custom', 'prayer.customFajrAngle': 18 };
    const angle = computeDay(MANAMA, '2026-10-12', { ...base, 'prayer.customIshaAngle': 17.5 });
    assert.equal(hm(angle.fajr), '04:18');
    assert.equal(hm(angle.isha), '18:27');
    const minutes = computeDay(MANAMA, '2026-10-12', {
      ...base,
      'prayer.customIshaMode': 'minutes',
      'prayer.customIshaMinutes': 90,
    });
    assert.equal(minutes.isha - minutes.maghrib, 90 * 60_000);
  });

  test('every method computes valid times', () => {
    for (const m of [
      'MuslimWorldLeague',
      'UmmAlQura',
      'Qatar',
      'Dubai',
      'Egyptian',
      'Karachi',
      'NorthAmerica',
      'MoonsightingCommittee',
      'Turkey',
      'Singapore',
      'Tehran',
    ]) {
      const d = computeDay(MANAMA, '2026-10-12', { ...defaultValues(), 'prayer.method': m });
      for (const k of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
        assert.ok(d[k] instanceof Date, `${m} ${k}`);
      }
      assert.ok(d.fajr < d.sunrise && d.sunrise < d.dhuhr && d.dhuhr < d.asr, m);
      assert.ok(d.asr < d.maghrib && d.maghrib <= d.isha, m);
    }
  });

  test('suggestions by country, with a fallback', () => {
    assert.equal(suggestMethod('SA'), 'UmmAlQura');
    assert.equal(suggestMethod('ae'), 'Dubai');
    assert.equal(suggestMethod('XX'), 'MuslimWorldLeague');
    assert.equal(suggestMethod(undefined), 'MuslimWorldLeague');
    assert.equal(resolveMethod('Egyptian', 'SA'), 'Egyptian');
    assert.equal(resolveMethod('auto', 'TR'), 'Turkey');
  });

  test('high latitudes still produce times (Tromsø in June)', () => {
    const tromso = { lat: 69.6496, lon: 18.956, tz: 'Europe/Oslo', country: 'NO' };
    const d = computeDay(tromso, '2026-06-21', defaultValues());
    for (const k of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) assert.ok(d[k], k);
    const { params } = buildParams({ ...defaultValues(), 'prayer.highLatRule': 'auto' }, tromso);
    assert.equal(params.highLatitudeRule, 'seventhofthenight');
  });
});

describe('next prayer across midnight', () => {
  test('before Fajr, next is today’s Fajr', () => {
    const now = bh('2026-10-12T03:00:00');
    const n = nextPrayer(now, getSchedule(now, MANAMA, kuwait));
    assert.equal(n.prayer, 'fajr');
    assert.equal(n.day, '2026-10-12');
  });

  test('between Fajr and Dhuhr (incl. after sunrise), next is Dhuhr', () => {
    const now = bh('2026-10-12T06:00:00');
    assert.equal(nextPrayer(now, getSchedule(now, MANAMA, kuwait)).prayer, 'dhuhr');
  });

  test('exactly at a prayer time, the next one is the following prayer', () => {
    const d = computeDay(MANAMA, '2026-10-12', kuwait);
    assert.equal(nextPrayer(d.asr, getSchedule(d.asr, MANAMA, kuwait)).prayer, 'maghrib');
  });

  test('after Isha, next is tomorrow’s Fajr', () => {
    const now = bh('2026-10-12T23:30:00');
    const n = nextPrayer(now, getSchedule(now, MANAMA, kuwait));
    assert.equal(n.prayer, 'fajr');
    assert.equal(n.day, '2026-10-13');
    assert.ok(n.time > now);
  });

  test('just after midnight, next is the same calendar day’s Fajr', () => {
    const now = bh('2026-10-13T00:05:00');
    const n = nextPrayer(now, getSchedule(now, MANAMA, kuwait));
    assert.equal(n.prayer, 'fajr');
    assert.equal(n.day, '2026-10-13');
  });

  test('uses the location’s calendar day, not the device’s', () => {
    // 22:30 UTC on the 12th is already 01:30 on the 13th in Manama.
    const now = new Date('2026-10-12T22:30:00Z');
    const s = getSchedule(now, MANAMA, kuwait);
    assert.equal(s.today.day, '2026-10-13');
  });
});

describe('current prayer window', () => {
  test('highlights the window that contains now', () => {
    const at = (s) => {
      const now = bh(s);
      return currentPrayer(now, getSchedule(now, MANAMA, kuwait))?.prayer ?? null;
    };
    assert.equal(at('2026-10-12T04:30:00'), 'fajr');
    assert.equal(at('2026-10-12T08:00:00'), null); // after sunrise, before Dhuhr
    assert.equal(at('2026-10-12T12:00:00'), 'dhuhr');
    assert.equal(at('2026-10-12T15:00:00'), 'asr');
    assert.equal(at('2026-10-12T17:30:00'), 'maghrib');
    assert.equal(at('2026-10-12T21:00:00'), 'isha');
    assert.equal(at('2026-10-13T02:00:00'), 'isha'); // yesterday's Isha
  });

  test('yesterday’s Isha belongs to yesterday', () => {
    const now = bh('2026-10-13T02:00:00');
    assert.equal(currentPrayer(now, getSchedule(now, MANAMA, kuwait)).day, '2026-10-12');
  });

  test('window ends', () => {
    const now = bh('2026-10-12T12:00:00');
    const s = getSchedule(now, MANAMA, kuwait);
    assert.equal(windowEnd('fajr', s.today, s.tomorrow), s.today.sunrise);
    assert.equal(windowEnd('asr', s.today, s.tomorrow), s.today.maghrib);
    assert.equal(windowEnd('isha', s.today, s.tomorrow, 'midnight'), s.today.midnight);
    assert.equal(windowEnd('isha', s.today, s.tomorrow, 'fajr'), s.tomorrow.fajr);
    assert.equal(hm(s.today.midnight), '22:46');
  });
});
