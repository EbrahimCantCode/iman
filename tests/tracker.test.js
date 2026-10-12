import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeStreaks,
  isDayComplete,
  nextStatus,
  validateDays,
  completion,
  lastDates,
  weekStartDate,
  parseTrackerImport,
  createTracker,
  migrateTracker,
  validateMeta,
  countTravelDays,
  TRACKER_VERSION,
} from '../js/tracker.js';
import { createMemoryStorage } from '../js/storage.js';
import { weekdayOf } from '../js/time.js';

const all = (status) => ({
  fajr: status,
  dhuhr: status,
  asr: status,
  maghrib: status,
  isha: status,
});

describe('day completeness', () => {
  test('onTime requires all five prayed', () => {
    assert.equal(isDayComplete(all('prayed'), 'onTime'), true);
    assert.equal(isDayComplete({ ...all('prayed'), asr: 'late' }, 'onTime'), false);
  });

  test('prayedOrLate accepts late (qada)', () => {
    assert.equal(isDayComplete({ ...all('prayed'), asr: 'late' }, 'prayedOrLate'), true);
    assert.equal(isDayComplete({ ...all('prayed'), asr: 'missed' }, 'prayedOrLate'), false);
    const { isha: _isha, ...four } = all('prayed');
    assert.equal(isDayComplete(four, 'prayedOrLate'), false);
  });
});

describe('streaks', () => {
  const days = {
    '2026-10-01': all('prayed'),
    '2026-10-02': all('prayed'),
    '2026-10-03': { ...all('prayed'), fajr: 'missed' },
    '2026-10-04': all('prayed'),
    '2026-10-05': all('prayed'),
    '2026-10-06': all('prayed'),
    '2026-10-07': { ...all('prayed'), dhuhr: 'late' },
    '2026-10-08': all('prayed'),
  };

  test('prayedOrLate: late keeps the streak', () => {
    assert.deepEqual(computeStreaks(days, '2026-10-08', 'prayedOrLate'), { current: 5, best: 5 });
  });

  test('onTime: late breaks the streak', () => {
    assert.deepEqual(computeStreaks(days, '2026-10-08', 'onTime'), { current: 1, best: 3 });
  });

  test('an unfinished today does not break the current streak', () => {
    const withToday = { ...days, '2026-10-09': { fajr: 'prayed' } };
    assert.equal(computeStreaks(withToday, '2026-10-09', 'prayedOrLate').current, 5);
  });

  test('a missing day breaks the streak', () => {
    assert.equal(computeStreaks(days, '2026-10-10', 'prayedOrLate').current, 0);
    assert.equal(computeStreaks(days, '2026-10-10', 'prayedOrLate').best, 5);
  });

  test('gaps in the record break best-streak runs', () => {
    const gappy = { '2026-01-01': all('prayed'), '2026-01-03': all('prayed') };
    assert.equal(computeStreaks(gappy, '2026-01-03').best, 1);
  });

  test('future dates are ignored', () => {
    const future = { '2027-01-01': all('prayed'), '2027-01-02': all('prayed') };
    assert.deepEqual(computeStreaks(future, '2026-10-12'), { current: 0, best: 0 });
  });

  test('empty tracker', () => {
    assert.deepEqual(computeStreaks({}, '2026-10-12'), { current: 0, best: 0 });
  });
});

describe('status cycling', () => {
  test('cycles none -> prayed -> late -> missed -> none', () => {
    assert.equal(nextStatus(null), 'prayed');
    assert.equal(nextStatus('prayed'), 'late');
    assert.equal(nextStatus('late'), 'missed');
    assert.equal(nextStatus('missed'), null);
  });

  test('respects the enabled statuses', () => {
    assert.equal(nextStatus(null, ['prayed']), 'prayed');
    assert.equal(nextStatus('prayed', ['prayed']), null);
    assert.equal(nextStatus('prayed', ['prayed', 'missed']), 'missed');
    // A status that is no longer enabled moves on to the start of the cycle.
    assert.equal(nextStatus('late', ['prayed']), 'prayed');
  });
});

describe('validation and import', () => {
  test('drops invalid dates, statuses and fields', () => {
    const { days, ignored } = validateDays({
      '2026-10-12': { fajr: 'prayed', dhuhr: 'skipped', extra: 1, sunnah: { witr: true, x: true } },
      '2026-02-30': { fajr: 'prayed' },
      'not-a-date': { fajr: 'prayed' },
      '2026-10-13': { fajr: 'nope' },
      '2026-10-14': { wake: '04:41' },
      '2026-10-15': { wake: '4:41pm' },
    });
    assert.deepEqual(days, {
      '2026-10-12': { fajr: 'prayed', sunnah: { witr: true } },
      '2026-10-14': { wake: '04:41' },
    });
    assert.equal(ignored, 4);
  });

  test('rejects malformed files', () => {
    assert.equal(parseTrackerImport('{oops').error, 'invalidJson');
    assert.equal(parseTrackerImport('{"app":"iman","kind":"settings"}').error, 'wrongKind');
    assert.equal(
      parseTrackerImport('{"app":"iman","kind":"tracker","days":[]}').error,
      'invalidShape',
    );
    assert.equal(parseTrackerImport('"string"').error, 'notIman');
  });

  test('imports the tracker part of a backup', () => {
    const res = parseTrackerImport(
      JSON.stringify({
        app: 'iman',
        kind: 'backup',
        tracker: { days: { '2026-10-01': all('late') } },
      }),
    );
    assert.equal(res.ok, true);
    assert.deepEqual(res.days['2026-10-01'], all('late'));
  });
});

describe('stats', () => {
  test('completion counts prayed and late over due prayers', () => {
    const days = { '2026-10-11': all('prayed'), '2026-10-12': { fajr: 'late', dhuhr: 'missed' } };
    const dates = ['2026-10-11', '2026-10-12'];
    const r = completion(days, dates);
    assert.deepEqual([r.done, r.total], [6, 10]);
    const dueOnlyMorning = (d, p) => d === '2026-10-11' || p === 'fajr' || p === 'dhuhr';
    assert.deepEqual(completion(days, dates, dueOnlyMorning).total, 7);
  });

  test('lastDates and week starts', () => {
    assert.deepEqual(lastDates('2026-10-12', 3), ['2026-10-10', '2026-10-11', '2026-10-12']);
    // 2026-10-12 is a Monday.
    assert.equal(weekStartDate('2026-10-12', 'mon', weekdayOf), '2026-10-12');
    assert.equal(weekStartDate('2026-10-12', 'sun', weekdayOf), '2026-10-11');
    assert.equal(weekStartDate('2026-10-12', 'sat', weekdayOf), '2026-10-10');
  });
});

describe('tracker store', () => {
  test('persists statuses, sunnah and wake time, and removes empty days', () => {
    const storage = createMemoryStorage();
    const tr = createTracker({ storage });
    tr.setStatus('2026-10-12', 'fajr', 'prayed');
    tr.setSunnah('2026-10-12', 'witr', true);
    tr.setWake('2026-10-12', '04:41');
    const again = createTracker({ storage });
    assert.deepEqual(again.getDay('2026-10-12'), {
      fajr: 'prayed',
      sunnah: { witr: true },
      wake: '04:41',
    });
    tr.setStatus('2026-10-13', 'asr', 'late');
    tr.setStatus('2026-10-13', 'asr', null);
    assert.equal('2026-10-13' in tr.all(), false);
  });

  test('ignores corrupt storage', () => {
    const storage = createMemoryStorage();
    storage.setItem('iman.tracker', '{"version":1,"days":{"x":{"fajr":"prayed"}}}');
    assert.deepEqual(createTracker({ storage }).all(), {});
  });
});

describe('travel flags and migration', () => {
  test('version 1 records still load and count the same', () => {
    const storage = createMemoryStorage();
    const v1 = {
      version: 1,
      days: {
        '2026-10-10': all('prayed'),
        '2026-10-11': all('prayed'),
        '2026-10-12': { fajr: 'late' },
      },
    };
    storage.setItem('iman.tracker', JSON.stringify(v1));
    const tr = createTracker({ storage });
    assert.deepEqual(tr.all(), v1.days);
    assert.deepEqual(computeStreaks(tr.all(), '2026-10-12'), { current: 2, best: 2 });
    assert.deepEqual(migrateTracker(v1), v1.days);
    assert.deepEqual(migrateTracker({ days: v1.days }), v1.days); // unversioned = v1
    tr.setStatus('2026-10-12', 'dhuhr', 'prayed');
    assert.equal(JSON.parse(storage.getItem('iman.tracker')).version, TRACKER_VERSION);
  });

  test('flags are validated', () => {
    assert.deepEqual(
      validateMeta('dhuhr', { shortened: true, combinedWith: 'asr', combineType: 'early' }),
      {
        shortened: true,
        combinedWith: 'asr',
        combineType: 'early',
      },
    );
    assert.equal(validateMeta('fajr', { shortened: true }), null); // Fajr is never shortened
    assert.equal(validateMeta('maghrib', { combinedWith: 'asr' }), null); // wrong partner
    assert.deepEqual(validateMeta('isha', { combinedWith: 'maghrib', combineType: 'sideways' }), {
      combinedWith: 'maghrib',
    });
    assert.equal(validateMeta('asr', 'junk'), null);
    const { days } = validateDays({
      '2026-10-12': {
        dhuhr: 'prayed',
        travel: true,
        meta: { dhuhr: { shortened: true }, asr: { shortened: true } },
      },
    });
    // Flags for a prayer without a status are dropped.
    assert.deepEqual(days['2026-10-12'], {
      dhuhr: 'prayed',
      travel: true,
      meta: { dhuhr: { shortened: true } },
    });
  });

  test('setting, keeping and clearing flags', () => {
    const tr = createTracker({ storage: createMemoryStorage() });
    const d = '2026-10-12';
    tr.setStatus(d, 'dhuhr', 'prayed', {
      shortened: true,
      combinedWith: 'asr',
      combineType: 'early',
    });
    tr.setStatus(d, 'dhuhr', 'late'); // undefined meta keeps the flags
    assert.equal(tr.getDay(d).meta.dhuhr.combineType, 'early');
    tr.setStatus(d, 'dhuhr', 'prayed', null); // null clears them
    assert.equal(tr.getDay(d).meta, undefined);
    tr.setStatus(d, 'asr', 'prayed', { shortened: true });
    tr.setStatus(d, 'asr', null); // clearing the status clears its flags
    assert.equal(tr.getDay(d).asr, undefined);
    assert.equal(tr.getDay(d).meta, undefined);
  });

  test('combined and shortened prayers count as on time for streaks', () => {
    const combinedDay = {
      ...all('prayed'),
      travel: true,
      meta: {
        dhuhr: { shortened: true, combinedWith: 'asr', combineType: 'delayed' },
        asr: { shortened: true, combinedWith: 'dhuhr', combineType: 'delayed' },
        isha: { shortened: true },
      },
    };
    const days = { '2026-10-11': combinedDay, '2026-10-12': combinedDay };
    assert.equal(computeStreaks(days, '2026-10-12', 'onTime').current, 2);
    assert.equal(computeStreaks(days, '2026-10-12', 'prayedOrLate').current, 2);
  });

  test('travel days', () => {
    const tr = createTracker({ storage: createMemoryStorage() });
    tr.setTravelDay('2026-10-10', true);
    tr.setTravelDay('2026-10-11', true);
    tr.setTravelDay('2026-10-11', false);
    tr.setTravelDay('2026-10-12', true);
    assert.equal(countTravelDays(tr.all(), lastDates('2026-10-12', 30)), 2);
    assert.equal(countTravelDays(tr.all(), ['2026-10-12']), 1);
  });
});
