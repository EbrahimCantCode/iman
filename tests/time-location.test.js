import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ymd,
  addDays,
  daysBetween,
  weekdayOf,
  isYmd,
  inDailyRange,
  hmToMinutes,
  formatCountdown,
  zonedParts,
} from '../js/time.js';
import { parseDebugTime, initClock, now, isDebugTime, setClockOffset } from '../js/clock.js';
import {
  decodeCities,
  searchCities,
  nearestCity,
  normalizeSearch,
  parseCoordinate,
  validCoords,
  locationFromSettings,
  cityLabel,
} from '../js/location.js';
import { defaultValues } from '../js/settings.js';

describe('time helpers', () => {
  test('calendar days follow the given time zone', () => {
    const d = new Date('2026-10-12T22:30:00Z');
    assert.equal(ymd(d, 'Asia/Bahrain'), '2026-10-13');
    assert.equal(ymd(d, 'America/New_York'), '2026-10-12');
    assert.equal(zonedParts(d, 'Asia/Bahrain').hour, 1);
  });

  test('date arithmetic across months and leap years', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(daysBetween('2026-10-01', '2026-10-12'), 11);
    assert.equal(weekdayOf('2026-10-16'), 5); // Friday
  });

  test('isYmd rejects impossible dates', () => {
    assert.equal(isYmd('2026-10-12'), true);
    assert.equal(isYmd('2026-02-29'), false);
    assert.equal(isYmd('2026-13-01'), false);
    assert.equal(isYmd('12/10/2026'), false);
    assert.equal(isYmd(20261012), false);
  });

  test('daily ranges wrap past midnight', () => {
    const q = (hm) => inDailyRange(hmToMinutes(hm), hmToMinutes('22:00'), hmToMinutes('06:00'));
    assert.equal(q('23:30'), true);
    assert.equal(q('05:59'), true);
    assert.equal(q('06:00'), false);
    assert.equal(q('12:00'), false);
    assert.equal(inDailyRange(600, 540, 660), true);
    assert.equal(inDailyRange(600, 600, 600), false);
  });

  test('countdown formatting', () => {
    assert.equal(formatCountdown(3_723_000), '01:02:03');
    assert.equal(formatCountdown(-5), '00:00:00');
    assert.equal(formatCountdown(26 * 3_600_000), '26:00:00');
  });
});

describe('debug clock (?debugTime=)', () => {
  test('parses ISO local and zoned times, rejects anything else', () => {
    assert.ok(parseDebugTime('2026-10-12T11:23:50') instanceof Date);
    assert.equal(parseDebugTime('2026-10-12T11:23:50Z').toISOString(), '2026-10-12T11:23:50.000Z');
    assert.equal(
      parseDebugTime('2026-10-12T11:23:50+03:00').toISOString(),
      '2026-10-12T08:23:50.000Z',
    );
    assert.equal(parseDebugTime('tomorrow'), null);
    assert.equal(parseDebugTime('2026-10-12'), null);
    assert.equal(parseDebugTime(null), null);
  });

  test('fakes the current time and keeps ticking', () => {
    assert.equal(initClock('?debugTime=2026-10-12T11:23:50Z'), true);
    assert.equal(isDebugTime(), true);
    const n = now();
    assert.ok(Math.abs(n - new Date('2026-10-12T11:23:50Z')) < 2000);
    setClockOffset(0);
    assert.equal(isDebugTime(), false);
  });
});

describe('location helpers', () => {
  const cities = decodeCities({
    v: 1,
    tz: ['Asia/Bahrain', 'Asia/Riyadh', 'Europe/London'],
    rows: [
      ['Manama', 'المنامة', 'BH', '', 26.228, 50.586, 0, 147],
      ['Al Muharraq', 'المحرق', 'BH', '', 26.257, 50.612, 0, 176],
      ['Riyadh', 'الرياض', 'SA', 'Riyadh Region', 24.688, 46.722, 1, 4206],
      ['London', 'لندن', 'GB', 'England', 51.509, -0.126, 2, 8962],
      ['Manamadurai', '', 'IN', 'Tamil Nadu', 9.696, 78.475, 1, 30],
    ],
  });

  test('rejects unknown city file formats', () => {
    assert.throws(() => decodeCities({ v: 2, rows: [] }));
    assert.throws(() => decodeCities(null));
  });

  test('search matches English and Arabic, prefix first, bigger first', () => {
    assert.deepEqual(
      searchCities('mana', cities).map((c) => c.name),
      ['Manama', 'Manamadurai'],
    );
    assert.equal(searchCities('المنامه', cities)[0].name, 'Manama'); // ة/ه folded
    assert.equal(searchCities('muharraq', cities)[0].name, 'Al Muharraq'); // word prefix
    assert.equal(searchCities('r', cities).length, 0); // too short
    assert.equal(searchCities('  LONDON ', cities)[0].cc, 'GB');
  });

  test('normalisation strips accents and Arabic diacritics', () => {
    assert.equal(normalizeSearch('Madīnat Ḩamad'), 'madinat hamad');
    assert.equal(normalizeSearch('الْمَنَامَة'), 'المنامه');
    assert.equal(normalizeSearch('أبها'), 'ابها');
  });

  test('nearest city gives the name, country and time zone for GPS fixes', () => {
    const near = nearestCity(26.2235, 50.5876, cities);
    assert.equal(near.city.name, 'Manama');
    assert.ok(near.km < 2);
    assert.equal(nearestCity(51.4, -0.3, cities).city.tz, 'Europe/London');
  });

  test('coordinates typed by hand', () => {
    assert.equal(parseCoordinate('26.2235'), 26.2235);
    assert.equal(parseCoordinate('26,2235'), 26.2235);
    assert.equal(parseCoordinate('−0.1278'), -0.1278);
    assert.ok(Number.isNaN(parseCoordinate('26°N')));
    assert.equal(validCoords(91, 0), false);
    assert.equal(validCoords(0, 180), true);
    assert.equal(validCoords(null, 0), false);
  });

  test('no location until one is set (never a silent default)', () => {
    assert.equal(locationFromSettings(defaultValues()), null);
    const loc = locationFromSettings({
      ...defaultValues(),
      'location.lat': 26.2235,
      'location.lon': 50.5876,
      'location.tz': 'Asia/Bahrain',
    });
    assert.equal(loc.tz, 'Asia/Bahrain');
  });

  test('city labels', () => {
    const riyadh = cities[2];
    assert.equal(
      cityLabel(riyadh, { country: () => 'Saudi Arabia' }),
      'Riyadh, Riyadh Region, Saudi Arabia',
    );
    assert.equal(cityLabel(riyadh, { lang: 'ar', country: () => 'السعودية' }), 'الرياض، السعودية');
  });
});
