import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveTravelMadhab,
  travelRules,
  combineMode,
  shortenedRakahs,
  distanceFromHome,
  travelSuggestion,
  tripDayNumber,
  countedStayDays,
  isTravellerForStay,
  stayStatus,
  combinedWindows,
  nextPrayerTravel,
  openCombinedPair,
  prayerSlots,
  createTravelStore,
  validateTravelData,
  tripToOffer,
  toUnits,
  tripTimes,
  tripDates,
} from '../js/travel.js';
import { TRAVEL_RULES, TRAVEL_MADHABS } from '../js/config/travel-rules.js';
import { getSchedule } from '../js/prayer.js';
import { defaultValues } from '../js/settings.js';
import { createMemoryStorage } from '../js/storage.js';

const HOME = { lat: 26.2235, lon: 50.5876 }; // Manama
/** A point `km` north of home (1° latitude ≈ 111.195 km on our sphere). */
const north = (km) => ({ lat: HOME.lat + km / 111.1951, lon: HOME.lon });
const base = { ...defaultValues(), 'prayer.method': 'Kuwait' };
const MANAMA = { ...HOME, tz: 'Asia/Bahrain', country: 'BH' };
const bh = (s) => new Date(`${s}+03:00`);
const hm = (d) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bahrain',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

describe('rulings data', () => {
  test('every madhab has the required fields and sources', () => {
    for (const m of TRAVEL_MADHABS) {
      const r = TRAVEL_RULES[m];
      assert.ok(r.distanceKm > 0 && r.maxStayDays > 0, m);
      assert.ok(['moreThan', 'atLeast'].includes(r.stayLimit), m);
      assert.ok(['obligatory', 'optional'].includes(r.shortening), m);
      assert.ok(Array.isArray(r.combining), m);
      assert.ok(r.sources.length > 0, `${m} needs sources`);
    }
  });

  test('pre-filled positions match the brief', () => {
    for (const m of ['shafii', 'maliki', 'hanbali']) {
      const r = TRAVEL_RULES[m];
      assert.equal(r.distanceKm, 83);
      assert.equal(r.maxStayDays, 4);
      assert.equal(r.shortening, 'optional');
      assert.deepEqual([...r.combining], ['early', 'delayed']);
    }
    assert.equal(TRAVEL_RULES.hanafi.distanceKm, 77);
    assert.equal(TRAVEL_RULES.hanafi.maxStayDays, 15);
    assert.equal(TRAVEL_RULES.hanafi.shortening, 'obligatory');
    assert.deepEqual([...TRAVEL_RULES.hanafi.combining], []);
    assert.equal(TRAVEL_RULES.hanafi.formalCombining, true);
  });

  test('"auto" follows the Asr setting', () => {
    assert.equal(resolveTravelMadhab(base), 'shafii');
    assert.equal(resolveTravelMadhab({ ...base, 'prayer.madhab': 'hanafi' }), 'hanafi');
    assert.equal(resolveTravelMadhab({ ...base, 'travel.madhab': 'maliki' }), 'maliki');
  });

  test('custom rulings come from settings', () => {
    const r = travelRules({
      ...base,
      'travel.madhab': 'custom',
      'travel.customDistanceKm': 100,
      'travel.customMaxStayDays': 10,
      'travel.customShortening': 'obligatory',
      'travel.customCombining': 'delayed',
    });
    assert.equal(r.distanceKm, 100);
    assert.equal(r.maxStayDays, 10);
    assert.equal(r.shortening, 'obligatory');
    assert.deepEqual(r.combining, ['delayed']);
    assert.deepEqual(
      travelRules({ ...base, 'travel.madhab': 'custom', 'travel.customCombining': 'none' })
        .combining,
      [],
    );
  });

  test('only Dhuhr, Asr and Isha are shortened', () => {
    const r = travelRules(base);
    assert.equal(shortenedRakahs('fajr', r), null);
    assert.equal(shortenedRakahs('maghrib', r), null);
    assert.deepEqual(shortenedRakahs('asr', r), {
      normal: 4,
      shortened: 2,
      shortening: 'optional',
    });
    assert.equal(
      shortenedRakahs('isha', travelRules({ ...base, 'travel.madhab': 'hanafi' })).shortening,
      'obligatory',
    );
  });

  test('combining choice only applies when travelling and allowed', () => {
    const v = { ...base, 'travel.combineMode': 'early' };
    assert.equal(combineMode(v, travelRules(v), true), 'early');
    assert.equal(combineMode(v, travelRules(v), false), 'off');
    const hanafi = { ...v, 'travel.madhab': 'hanafi' };
    assert.equal(combineMode(hanafi, travelRules(hanafi), true), 'off');
  });
});

describe('distance and the auto-detect threshold', () => {
  test('distance from home', () => {
    const d = distanceFromHome(HOME, north(100), travelRules(base));
    assert.ok(Math.abs(d.km - 100) < 0.5);
    assert.equal(distanceFromHome(null, north(100), travelRules(base)), null);
    assert.equal(distanceFromHome(HOME, null, travelRules(base)), null);
  });

  test('80 km is travel for Hanafi (77 km) but not for Shafiʿi (83 km)', () => {
    const shafii = travelRules(base);
    const hanafi = travelRules({ ...base, 'travel.madhab': 'hanafi' });
    assert.equal(distanceFromHome(HOME, north(80), shafii).away, false);
    assert.equal(distanceFromHome(HOME, north(80), hanafi).away, true);
    assert.equal(distanceFromHome(HOME, north(84), shafii).away, true);
    for (const m of ['maliki', 'hanbali']) {
      assert.equal(
        distanceFromHome(HOME, north(82), travelRules({ ...base, 'travel.madhab': m })).away,
        false,
      );
    }
  });

  test('miles conversion', () => {
    assert.ok(Math.abs(toUnits(83, 'mi') - 51.57) < 0.01);
    assert.equal(toUnits(83, 'km'), 83);
  });
});

describe('manual switch and suggestions', () => {
  const far = north(300);

  test('suggests starting when away, never when auto-detect is off', () => {
    assert.equal(travelSuggestion({ values: base, home: HOME, here: far }).type, 'start');
    assert.equal(travelSuggestion({ values: base, home: HOME, here: north(20) }), null);
    assert.equal(
      travelSuggestion({ values: { ...base, 'travel.autoDetect': false }, home: HOME, here: far }),
      null,
    );
  });

  test('nothing to suggest without a home or a location (manual switch still works)', () => {
    assert.equal(travelSuggestion({ values: base, home: null, here: far }), null);
    assert.equal(travelSuggestion({ values: base, home: HOME, here: null }), null);
    const store = createTravelStore({ storage: createMemoryStorage() });
    store.start({ startDate: '2026-10-12' }); // no destination, no GPS
    assert.equal(store.current().destination, null);
    assert.equal(store.current().startDate, '2026-10-12');
    store.end(null);
    assert.equal(store.current(), null);
  });

  test('after turning it off, it is not suggested again until the user moves', () => {
    const values = { ...base, 'travel.resuggestKm': 50 };
    const dismissedAt = far;
    assert.equal(travelSuggestion({ values, home: HOME, here: far, dismissedAt }), null);
    assert.equal(travelSuggestion({ values, home: HOME, here: north(330), dismissedAt }), null);
    assert.equal(
      travelSuggestion({ values, home: HOME, here: north(360), dismissedAt }).type,
      'start',
    );
  });

  test('turned on near home: ending is not suggested until the user has been away', () => {
    const on = { ...base, 'travel.enabled': true };
    assert.equal(
      travelSuggestion({ values: on, home: HOME, here: north(5), trip: { wasAway: false } }),
      null,
    );
    assert.equal(
      travelSuggestion({ values: on, home: HOME, here: north(5), trip: { wasAway: true } }).type,
      'end',
    );
    assert.equal(
      travelSuggestion({ values: on, home: HOME, here: far, trip: { wasAway: true } }),
      null,
    );
  });

  test('a dismissed "back home" suggestion stays quiet nearby', () => {
    const on = { ...base, 'travel.enabled': true };
    const args = { values: on, home: HOME, trip: { wasAway: true }, endDismissedAt: north(5) };
    assert.equal(travelSuggestion({ ...args, here: north(10) }), null);
  });
});

describe('stay length', () => {
  const shafii = travelRules(base);
  const hanafi = travelRules({ ...base, 'travel.madhab': 'hanafi' });

  test('arrival and departure days are not counted (majority view)', () => {
    assert.equal(countedStayDays(5, shafii), 3); // Mon..Fri
    assert.equal(countedStayDays(6, shafii), 4);
    assert.equal(countedStayDays(1, shafii), 0);
    assert.equal(countedStayDays(15, hanafi), 15);
  });

  test('traveller limits', () => {
    assert.equal(isTravellerForStay(4, shafii), true); // not more than 4
    assert.equal(isTravellerForStay(5, shafii), false);
    assert.equal(isTravellerForStay(14, hanafi), true);
    assert.equal(isTravellerForStay(15, hanafi), false); // 15 or more
  });

  test('trip day numbers', () => {
    assert.equal(tripDayNumber('2026-10-12', '2026-10-12'), 1);
    assert.equal(tripDayNumber('2026-10-12', '2026-10-15'), 4);
    assert.equal(tripDayNumber('2026-12-30', '2027-01-02'), 4);
  });

  test('approaching-limit reminder (Shafiʿi, 1 day before)', () => {
    const at = (today) =>
      stayStatus({
        startDate: '2026-10-12',
        today,
        plannedDays: null,
        rules: shafii,
        values: base,
      });
    // Arrived Monday; counted days exclude the arrival day.
    assert.equal(at('2026-10-15').approaching, false); // Thu: 3 counted
    assert.equal(at('2026-10-16').approaching, true); // Fri: 4 counted, the last allowed
    assert.equal(at('2026-10-17').approaching, true); // Sat: limit day
    assert.equal(at('2026-10-18').pastLimit, true);
    assert.equal(at('2026-10-16').dayNumber, 5);
  });

  test('approaching-limit reminder (Hanafi) and the switch', () => {
    const at = (today, values = base) =>
      stayStatus({ startDate: '2026-10-01', today, plannedDays: null, rules: hanafi, values });
    assert.equal(at('2026-10-13').approaching, false); // day 13
    assert.equal(at('2026-10-14').approaching, true); // day 14, the limit is day 15
    assert.equal(at('2026-10-14', { ...base, 'travel.stayReminder': false }).approaching, false);
    assert.equal(at('2026-10-12', { ...base, 'travel.stayReminderDays': 3 }).approaching, true);
  });

  test('planned length of stay (asked, not assumed)', () => {
    const s = (planned, rules = shafii) =>
      stayStatus({
        startDate: '2026-10-12',
        today: '2026-10-12',
        plannedDays: planned,
        rules,
        values: base,
      });
    assert.equal(s(null).planned, null);
    assert.deepEqual(s(6).planned, { days: 6, counted: 4, traveller: true });
    assert.equal(s(7).planned.traveller, false);
    assert.equal(s(14, hanafi).planned.traveller, true);
    assert.equal(s(15, hanafi).planned.traveller, false);
  });
});

describe('combining', () => {
  const at = (s) => {
    const now = bh(s);
    return { now, schedule: getSchedule(now, MANAMA, base) };
  };

  test('combined windows for the day', () => {
    const { schedule } = at('2026-10-12T12:00:00');
    const [noon, evening] = combinedWindows(schedule.today, schedule.tomorrow, 'midnight');
    assert.deepEqual(noon.pair, ['dhuhr', 'asr']);
    assert.equal(`${hm(noon.start)}-${hm(noon.end)}`, '11:24-17:13');
    assert.equal(`${hm(noon.early.start)}-${hm(noon.early.end)}`, '11:24-14:44');
    assert.equal(`${hm(noon.delayed.start)}-${hm(noon.delayed.end)}`, '14:44-17:13');
    assert.equal(`${hm(evening.start)}-${hm(evening.end)}`, '17:13-22:46');
  });

  test('slots group the pairs', () => {
    const { schedule } = at('2026-10-12T12:00:00');
    assert.equal(prayerSlots(schedule.today, 'off').length, 5);
    const early = prayerSlots(schedule.today, 'early');
    assert.deepEqual(
      early.map((s) => s.prayers.join('+')),
      ['fajr', 'dhuhr+asr', 'maghrib+isha'],
    );
    assert.equal(hm(early[1].time), '11:24');
    assert.equal(hm(prayerSlots(schedule.today, 'delayed')[1].time), '14:44');
  });

  test('next prayer with early combining: after Dhuhr time it is Maghrib (+ Isha)', () => {
    const { now, schedule } = at('2026-10-12T12:00:00');
    assert.equal(nextPrayerTravel(now, schedule, 'off').prayer, 'asr');
    const early = nextPrayerTravel(now, schedule, 'early');
    assert.deepEqual(early.prayers, ['maghrib', 'isha']);
    assert.equal(hm(early.time), '17:13');
  });

  test('next prayer with delayed combining: Dhuhr + Asr at Asr time', () => {
    const { now, schedule } = at('2026-10-12T12:00:00');
    const delayed = nextPrayerTravel(now, schedule, 'delayed');
    assert.deepEqual(delayed.prayers, ['dhuhr', 'asr']);
    assert.equal(hm(delayed.time), '14:44');
    const evening = at('2026-10-12T17:30:00');
    assert.equal(hm(nextPrayerTravel(evening.now, evening.schedule, 'delayed').time), '18:27');
  });

  test('before Dhuhr, early combining points at Dhuhr + Asr; after Isha, tomorrow’s Fajr', () => {
    const morning = at('2026-10-12T09:00:00');
    assert.deepEqual(nextPrayerTravel(morning.now, morning.schedule, 'early').prayers, [
      'dhuhr',
      'asr',
    ]);
    const night = at('2026-10-12T23:00:00');
    const next = nextPrayerTravel(night.now, night.schedule, 'early');
    assert.equal(next.prayer, 'fajr');
    assert.equal(next.day, '2026-10-13');
  });

  test('open pair until prayed', () => {
    const { now, schedule } = at('2026-10-12T12:00:00');
    const open = openCombinedPair(now, schedule, 'early', 'midnight');
    assert.deepEqual(open.pair, ['dhuhr', 'asr']);
    assert.equal(hm(open.until), '14:44');
    const done = (_day, p) => p === 'dhuhr' || p === 'asr';
    assert.equal(openCombinedPair(now, schedule, 'early', 'midnight', done), null);
    assert.equal(openCombinedPair(now, schedule, 'off', 'midnight'), null);
    const later = at('2026-10-12T15:00:00');
    assert.equal(
      hm(openCombinedPair(later.now, later.schedule, 'delayed', 'midnight').until),
      '17:13',
    );
  });
});

describe('travel store', () => {
  test('never trusts stored data', () => {
    const d = validateTravelData({
      current: { startDate: 'yesterday', destination: { lat: 999 } },
      trips: [
        {
          id: 'a',
          start: '2026-11-01',
          end: '2026-11-05',
          destination: { lat: 51.5, lon: -0.1, name: 'London' },
        },
        { id: 'b', start: '2026-11-05', end: '2026-11-01', destination: { lat: 1, lon: 1 } },
        'junk',
      ],
      dismissedAt: { lat: 'x' },
    });
    assert.equal(d.current, null);
    assert.deepEqual(
      d.trips.map((t) => t.id),
      ['a'],
    );
    assert.equal(d.dismissedAt, null);
    assert.deepEqual(validateTravelData(null).trips, []);
  });

  test('saved trips are offered once when they start', () => {
    const store = createTravelStore({ storage: createMemoryStorage() });
    store.saveTrip({
      id: 't1',
      start: '2026-11-01',
      end: '2026-11-05',
      destination: { lat: 51.5, lon: -0.1, name: 'London', tz: 'Europe/London' },
    });
    assert.equal(tripToOffer(store.get(), '2026-10-31'), null);
    assert.equal(tripToOffer(store.get(), '2026-11-02').id, 't1');
    store.markOffered('t1');
    assert.equal(tripToOffer(store.get(), '2026-11-02'), null);
    store.deleteTrip('t1');
    assert.equal(store.get().trips.length, 0);
  });

  test('persists across restarts', () => {
    const storage = createMemoryStorage();
    createTravelStore({ storage }).start({ startDate: '2026-10-12', plannedDays: 3 });
    assert.equal(createTravelStore({ storage }).current().plannedDays, 3);
  });
});

describe('trip planner times', () => {
  const london = {
    lat: 51.509,
    lon: -0.126,
    name: 'London',
    nameAr: 'لندن',
    country: 'GB',
    tz: 'Europe/London',
  };
  const lhm = (d) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);

  test('one entry per day, in the destination’s calendar', () => {
    const trip = {
      id: 't',
      destination: london,
      start: '2026-10-23',
      end: '2026-10-27',
      method: 'suggested',
    };
    assert.deepEqual(tripDates(trip), [
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ]);
    const original = process.env.TZ;
    process.env.TZ = 'Asia/Bahrain'; // the phone hasn't switched zones yet
    try {
      const days = tripTimes(trip, base);
      assert.equal(days.length, 5);
      assert.equal(days[0].methodId, 'MoonsightingCommittee'); // suggested for GB
      // UK clocks go back on 25 October: Dhuhr moves from ~12:50 BST to ~11:50 GMT.
      assert.match(lhm(days[1].dhuhr), /^12:[45][0-9]$/);
      assert.match(lhm(days[2].dhuhr), /^11:[45][0-9]$/);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  test('"keep mine" uses the user’s method', () => {
    const trip = {
      id: 't',
      destination: london,
      start: '2026-10-12',
      end: '2026-10-12',
      method: 'mine',
    };
    assert.equal(tripTimes(trip, base)[0].methodId, 'Kuwait');
    assert.equal(
      tripTimes({ ...trip, method: 'suggested' }, base)[0].methodId,
      'MoonsightingCommittee',
    );
  });
});

describe('?debugTime= with travel mode and flights', () => {
  test('the faked clock drives trip days, combining and in-flight events', async () => {
    const { initClock, now, setClockOffset } = await import('../js/clock.js');
    const { ymd } = await import('../js/time.js');
    const { flightPrayers } = await import('../js/flight.js');
    try {
      initClock('?debugTime=2026-10-16T12:00:00%2B03:00');
      const today = ymd(now(), 'Asia/Bahrain');
      assert.equal(today, '2026-10-16');
      const s = stayStatus({
        startDate: '2026-10-12',
        today,
        plannedDays: null,
        rules: travelRules(base),
        values: base,
      });
      assert.equal(s.dayNumber, 5);
      assert.equal(s.approaching, true);
      const schedule = getSchedule(now(), MANAMA, base);
      assert.deepEqual(nextPrayerTravel(now(), schedule, 'early').prayers, ['maghrib', 'isha']);
      // A flight leaving "now" (debug time) finds Asr soon after take-off.
      const r = flightPrayers({
        from: { lat: 26.267, lon: 50.638 },
        to: { lat: 51.471, lon: -0.46 },
        departure: now(),
        arrival: new Date(now().getTime() + 7 * 3_600_000),
        values: base,
        methodCountry: 'BH',
      });
      assert.equal(r.events[0].prayer, 'asr');
    } finally {
      setClockOffset(0);
    }
  });
});
