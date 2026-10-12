import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flightPrayers, greatCirclePoint, timesAt, solarDay, prayerAt } from '../js/flight.js';
import { haversineKm } from '../js/location.js';
import { addDays } from '../js/time.js';
import { defaultValues } from '../js/settings.js';
import { parseCsv, buildAirports } from '../scripts/build-airports.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const airports = JSON.parse(readFileSync(join(root, 'data', 'airports.json'), 'utf8'));
const airport = (code) => {
  const r = airports.rows.find((x) => x[0] === code);
  return { lat: r[4], lon: r[5], tz: airports.tz[r[6]], cc: r[3] };
};
const values = defaultValues();
const H = 3_600_000;

function fly(from, to, departureIso, hours, extra = {}) {
  const departure = new Date(departureIso);
  const a = airport(from);
  return flightPrayers({
    from: a,
    to: airport(to),
    departure,
    arrival: new Date(departure.getTime() + hours * H),
    values: extra.values ?? values,
    methodCountry: a.cc,
  });
}

/** Each event must be a real crossing: the prayer time at the event's position equals the event time. */
function assertEventsConsistent(result, cc) {
  for (const e of result.events) {
    const center = solarDay(e.time, e.position.lon);
    const candidates = [addDays(center, -1), center, addDays(center, 1)].map(
      (d) => timesAt(e.position, d, values, cc)[e.prayer],
    );
    const best = Math.min(...candidates.filter(Boolean).map((T) => Math.abs(T - e.time)));
    // Near the poles adhan resolves missing sunrise/sunset from the nearest
    // day that has them, so times can jump: allow more there.
    const tolerance = Math.abs(e.position.lat) > 60 ? 10 : 1;
    assert.ok(
      best < tolerance * 60_000,
      `${e.prayer} at ${e.time.toISOString()} is ${best / 60000} min off`,
    );
  }
  for (let i = 1; i < result.events.length; i++)
    assert.ok(result.events[i - 1].time <= result.events[i].time);
}

describe('great-circle route', () => {
  test('starts and ends at the airports, evenly split', () => {
    const a = airport('BAH');
    const b = airport('LHR');
    const start = greatCirclePoint(a, b, 0);
    const end = greatCirclePoint(a, b, 1);
    assert.ok(haversineKm(start, a) < 0.01 && haversineKm(end, b) < 0.01);
    const mid = greatCirclePoint(a, b, 0.5);
    assert.ok(Math.abs(haversineKm(a, mid) - haversineKm(mid, b)) < 0.5);
  });

  test('polar routes go over high latitudes', () => {
    const r = fly('JFK', 'HKG', '2026-10-12T12:00:00-04:00', 16);
    assert.ok(r.maxLat > 75, `max latitude ${r.maxLat}`);
  });
});

describe('flight prayer times on real routes', () => {
  test('BAH → LHR, afternoon, westbound (chasing the sunset)', () => {
    // Departs 14:30 Bahrain time (11:30Z), 7 h.
    const r = fly('BAH', 'LHR', '2026-10-12T14:30:00+03:00', 7);
    assertEventsConsistent(r, 'BH');
    assert.equal(r.atDeparture, 'dhuhr');
    const asr = r.events.find((e) => e.prayer === 'asr');
    assert.ok(asr.minutesAfterDeparture < 60, 'Asr starts soon after take-off');
    const maghrib = r.events.find((e) => e.prayer === 'maghrib');
    // Later than sunset in Bahrain (14:13Z), earlier than in London (17:17Z).
    assert.ok(
      maghrib.time > new Date('2026-10-12T14:13:00Z') &&
        maghrib.time < new Date('2026-10-12T17:17:00Z'),
    );
    assert.ok(
      maghrib.position.lon > 0 && maghrib.position.lon < 50,
      'somewhere over Europe or Turkey',
    );
  });

  test('BAH → KUL, overnight, eastbound (Fajr in the air)', () => {
    // Departs 21:00 Bahrain time (18:00Z), 7 h, lands ~09:00 in Kuala Lumpur.
    const r = fly('BAH', 'KUL', '2026-10-12T21:00:00+03:00', 7);
    assertEventsConsistent(r, 'BH');
    assert.equal(r.atDeparture, 'isha');
    const fajr = r.events.find((e) => e.prayer === 'fajr');
    const sunrise = r.events.find((e) => e.prayer === 'sunrise');
    assert.ok(fajr && sunrise, 'Fajr and sunrise during the flight');
    assert.ok(
      fajr.time > new Date('2026-10-12T22:00:00Z') && fajr.time < new Date('2026-10-13T00:30:00Z'),
    );
    const gap = (sunrise.time - fajr.time) / 60_000;
    assert.ok(gap > 40 && gap < 100, `Fajr to sunrise ${gap} min`);
  });

  test('DXB → JFK, long-haul over high latitudes, crossing midnight', () => {
    // Departs 02:30 Dubai time on the 12th (22:30Z on the 11th), 14 h.
    const r = fly('DXB', 'JFK', '2026-10-12T02:30:00+04:00', 14);
    assertEventsConsistent(r, 'AE');
    assert.ok(r.maxLat > 50, `max latitude ${r.maxLat}`);
    assert.ok(r.events.some((e) => e.prayer === 'fajr'));
    // Flying west at night delays sunrise by hours.
    const fajr = r.events.find((e) => e.prayer === 'fajr');
    const sunrise = r.events.find((e) => e.prayer === 'sunrise');
    assert.ok(sunrise.time - fajr.time > 3 * H);
  });

  test('BAH → DXB, short flight: possibly no prayer', () => {
    const morning = fly('BAH', 'DXB', '2026-10-12T09:00:00+03:00', 1.1);
    assert.deepEqual(morning.events, []);
    assert.equal(morning.atDeparture, null); // between sunrise and Dhuhr
    const noon = fly('BAH', 'DXB', '2026-10-12T11:00:00+03:00', 1.1);
    assert.deepEqual(
      noon.events.map((e) => e.prayer),
      ['dhuhr'],
    );
    assertEventsConsistent(noon, 'BH');
  });

  test('a prayer just after landing is reported as a near miss', () => {
    // Lands in Dubai about 10 minutes before Maghrib there.
    const r = fly('BAH', 'DXB', '2026-10-12T15:40:00+03:00', 1.05);
    assert.equal(
      r.events.some((e) => e.prayer === 'maghrib'),
      false,
    );
    assert.ok(r.nearMisses.some((n) => n.prayer === 'maghrib' && n.minutes < 20));
  });

  test('crossing the date line does not invent prayers', () => {
    const r = fly('HNL', 'NRT', '2026-10-12T13:00:00-10:00', 9);
    assertEventsConsistent(r, 'US');
    const counts = {};
    for (const e of r.events) counts[e.prayer] = (counts[e.prayer] ?? 0) + 1;
    for (const n of Object.values(counts)) assert.ok(n <= 1);
  });

  test('polar positions use the high-latitude rule from settings', () => {
    // 82°N in mid-October: twilight never ends, so Fajr/Isha come from the rule.
    const pos = { lat: 82, lon: 60 };
    const fajr = (rule) =>
      timesAt(pos, '2026-10-13', { ...values, 'prayer.highLatRule': rule }, 'US').fajr.getTime();
    const results = new Set(['seventh', 'twilight', 'middle'].map(fajr));
    assert.equal(results.size, 3);
  });

  test('polar routes still give consistent events (summer, midnight sun)', () => {
    const r = fly('LHR', 'NRT', '2026-06-20T19:00:00+01:00', 13);
    assert.ok(r.maxLat > 65);
    assertEventsConsistent(r, 'GB');
  });

  test('Qibla at each prayer point is a bearing from true north', () => {
    const r = fly('BAH', 'LHR', '2026-10-12T14:30:00+03:00', 7);
    for (const e of r.events) assert.ok(e.qibla >= 0 && e.qibla < 360);
    // Over Europe, Makkah is to the south-east.
    const maghrib = r.events.find((e) => e.prayer === 'maghrib');
    assert.ok(maghrib.qibla > 90 && maghrib.qibla < 180);
  });

  test('prayer in progress at a time and place', () => {
    const bah = airport('BAH');
    assert.equal(prayerAt(new Date('2026-10-12T15:00:00+03:00'), bah, values, 'BH'), 'asr');
    assert.equal(prayerAt(new Date('2026-10-13T02:00:00+03:00'), bah, values, 'BH'), 'isha');
    assert.equal(prayerAt(new Date('2026-10-12T08:00:00+03:00'), bah, values, 'BH'), null);
  });

  test('rejects impossible flights', () => {
    assert.throws(() => fly('BAH', 'LHR', '2026-10-12T14:30:00+03:00', 0));
  });
});

describe('airports data', () => {
  test('every entry is valid and has a real time zone', () => {
    assert.equal(airports.v, 1);
    assert.ok(airports.rows.length > 3000);
    const codes = new Set();
    for (const [iata, name, , cc, lat, lon, tzi] of airports.rows) {
      assert.match(iata, /^[A-Z]{3}$/);
      assert.ok(!codes.has(iata), `duplicate ${iata}`);
      codes.add(iata);
      assert.ok(name.length > 0);
      assert.match(cc, /^[A-Z]{2}$/);
      assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
      const tz = airports.tz[tzi];
      assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: tz }), tz);
    }
  });

  test('known airports have the right zones', () => {
    assert.equal(airport('BAH').tz, 'Asia/Bahrain');
    assert.equal(airport('LHR').tz, 'Europe/London');
    assert.equal(airport('KUL').tz, 'Asia/Kuala_Lumpur');
    assert.equal(airport('DXB').tz, 'Asia/Dubai');
    assert.equal(airport('JFK').tz, 'America/New_York');
  });

  test('the file stays small', () => {
    const bytes = readFileSync(join(root, 'data', 'airports.json')).length;
    assert.ok(bytes < 500 * 1024, `${bytes} bytes`);
  });

  test('build script: CSV parsing and time zones from the nearest city in the country', () => {
    const csv =
      '"id","type","name","latitude_deg","longitude_deg","iso_country","municipality","iata_code"\n' +
      '1,"large_airport","Test ""Big"" Airport, Main",26.27,50.64,"BH","Manama","TBA"\n' +
      '2,"small_airport","Tiny Strip",26.0,50.5,"BH","Somewhere","TSX"\n' +
      '3,"medium_airport","No Code",26.0,50.5,"BH","Somewhere",""\n' +
      '4,"medium_airport","Border Field",25.0,51.0,"QA","Doha","TBB"\n';
    const rows = parseCsv(csv);
    assert.equal(rows[1][2], 'Test "Big" Airport, Main');
    const cities = {
      v: 1,
      tz: ['Asia/Bahrain', 'Asia/Qatar'],
      rows: [
        ['Manama', '', 'BH', '', 26.228, 50.586, 0, 147],
        ['Doha', '', 'QA', '', 25.285, 51.531, 1, 345],
      ],
    };
    const out = buildAirports(rows, cities);
    assert.deepEqual(
      out.rows.map((r) => r[0]),
      ['TBA', 'TBB'],
    ); // small and code-less dropped
    assert.equal(out.tz[out.rows[0][6]], 'Asia/Bahrain');
    assert.equal(out.tz[out.rows[1][6]], 'Asia/Qatar'); // same country, not just nearest
    assert.throws(() => buildAirports(parseCsv('"a","b"\n1,2\n'), cities));
  });
});
