// Times must follow the LOCATION's time zone, never the device's: a phone
// still set to Bahrain time must show London times in London time.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeDay, getSchedule } from '../js/prayer.js';
import { defaultValues } from '../js/settings.js';
import { tzOffsetMinutes, zonedTimeToDate, toZonedInput, toZonedIso, ymd } from '../js/time.js';
import { parseDebugTime } from '../js/clock.js';

const PLACES = {
  London: { lat: 51.5074, lon: -0.1278, tz: 'Europe/London', country: 'GB' },
  'Kuala Lumpur': { lat: 3.139, lon: 101.6869, tz: 'Asia/Kuala_Lumpur', country: 'MY' },
  'New York': { lat: 40.7128, lon: -74.006, tz: 'America/New_York', country: 'US' },
};

// Local times on 2026-10-12 with each country's suggested method, checked
// against published timetables (London: Moonsighting Committee, KL: JAKIM,
// New York: ISNA) to within a few minutes.
const EXPECTED = {
  London: {
    fajr: '05:44',
    sunrise: '07:19',
    dhuhr: '12:52',
    asr: '15:36',
    maghrib: '18:17',
    isha: '19:36',
  },
  'Kuala Lumpur': {
    fajr: '05:41',
    sunrise: '06:59',
    dhuhr: '13:01',
    asr: '16:15',
    maghrib: '19:02',
    isha: '20:11',
  },
  'New York': {
    fajr: '05:49',
    sunrise: '07:04',
    dhuhr: '12:43',
    asr: '15:49',
    maghrib: '18:20',
    isha: '19:35',
  },
};

const hm = (d, tz) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

function withDeviceZone(tz, fn) {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe('destination times with the device in another time zone', () => {
  let i = 0;
  for (const [name, place] of Object.entries(PLACES)) {
    test(`${name}, device in Asia/Bahrain`, () => {
      for (const device of ['Asia/Bahrain', 'UTC', 'Pacific/Kiritimati']) {
        // A negligible coordinate change defeats the memo cache per device zone.
        const loc = { ...place, lat: place.lat + ++i * 1e-9 };
        const day = withDeviceZone(device, () => computeDay(loc, '2026-10-12', defaultValues()));
        for (const [prayer, expected] of Object.entries(EXPECTED[name])) {
          assert.equal(hm(day[prayer], place.tz), expected, `${name} ${prayer} (device ${device})`);
        }
      }
    });
  }

  test('the calendar day follows the destination', () => {
    // 21:00 UTC on the 12th: still the 12th in New York, already the 13th in KL.
    const now = new Date('2026-10-12T21:00:00Z');
    withDeviceZone('Asia/Bahrain', () => {
      assert.equal(getSchedule(now, PLACES['New York'], defaultValues()).today.day, '2026-10-12');
      assert.equal(
        getSchedule(now, PLACES['Kuala Lumpur'], defaultValues()).today.day,
        '2026-10-13',
      );
    });
  });
});

describe('zone conversions', () => {
  test('offsets, including summer time', () => {
    assert.equal(tzOffsetMinutes(new Date('2026-10-12T12:00:00Z'), 'Asia/Bahrain'), 180);
    assert.equal(tzOffsetMinutes(new Date('2026-10-12T12:00:00Z'), 'Europe/London'), 60);
    assert.equal(tzOffsetMinutes(new Date('2026-12-12T12:00:00Z'), 'Europe/London'), 0);
    assert.equal(tzOffsetMinutes(new Date('2026-10-12T12:00:00Z'), 'America/New_York'), -240);
    assert.equal(tzOffsetMinutes(new Date('2026-10-12T12:00:00Z'), 'Asia/Kolkata'), 330);
  });

  test('wall-clock time in a zone to an instant, whatever the device zone', () => {
    withDeviceZone('Asia/Bahrain', () => {
      assert.equal(
        zonedTimeToDate('2026-10-12T11:23:50', 'Europe/London').toISOString(),
        '2026-10-12T10:23:50.000Z',
      );
      assert.equal(
        zonedTimeToDate('2026-10-12T11:23', 'America/New_York').toISOString(),
        '2026-10-12T15:23:00.000Z',
      );
      assert.equal(
        zonedTimeToDate('2026-10-12T11:23', 'Asia/Bahrain').toISOString(),
        '2026-10-12T08:23:00.000Z',
      );
    });
    assert.equal(zonedTimeToDate('nonsense', 'UTC'), null);
  });

  test('around DST changes', () => {
    // London springs forward at 01:00 UTC on 29 March 2026 (01:30 local doesn't exist).
    const spring = zonedTimeToDate('2026-03-29T03:00', 'Europe/London');
    assert.equal(spring.toISOString(), '2026-03-29T02:00:00.000Z');
    // And falls back on 25 October 2026.
    const autumn = zonedTimeToDate('2026-10-25T12:00', 'Europe/London');
    assert.equal(autumn.toISOString(), '2026-10-25T12:00:00.000Z');
  });

  test('round trip for the debug time helper', () => {
    const at = new Date('2026-10-12T08:23:50Z');
    assert.equal(toZonedInput(at, 'Asia/Bahrain'), '2026-10-12T11:23:50');
    const iso = toZonedIso(at, 'Asia/Bahrain');
    assert.equal(iso, '2026-10-12T11:23:50+03:00');
    // ?debugTime= accepts the offset form, so the fake time is the same instant everywhere.
    withDeviceZone('America/New_York', () => {
      assert.equal(parseDebugTime(iso).toISOString(), at.toISOString());
      assert.equal(ymd(parseDebugTime(iso), 'Asia/Bahrain'), '2026-10-12');
    });
    assert.equal(toZonedIso(at, 'America/New_York'), '2026-10-12T04:23:50-04:00');
  });
});
