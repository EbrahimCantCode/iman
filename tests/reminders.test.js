import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildAlerts, dueAlerts, passesCondition } from '../js/reminders.js';
import { computeDay } from '../js/prayer.js';
import { defaultValues } from '../js/settings.js';
import { addDays } from '../js/time.js';

const MANAMA = { lat: 26.2235, lon: 50.5876, tz: 'Asia/Bahrain', country: 'BH' };
const base = { ...defaultValues(), 'prayer.method': 'Kuwait', 'reminders.enabled': true };

const hm = (d) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bahrain',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

/** Alerts for `n` days from `start`, with the following day available as "next day". */
function alertsFor(values, start = '2026-10-12', n = 1) {
  const days = Array.from({ length: n + 1 }, (_, i) =>
    computeDay(MANAMA, addDays(start, i), values),
  );
  return buildAlerts({ days, values, tz: MANAMA.tz }).filter((a) => a.day < addDays(start, n));
}
const find = (alerts, id) => alerts.find((a) => a.id === id);

describe('buildAlerts', () => {
  test('nothing when the master switch is off', () => {
    assert.deepEqual(alertsFor({ ...base, 'reminders.enabled': false }), []);
  });

  test('at-time alerts for all five prayers by default, Fajr with its own adhan', () => {
    const alerts = alertsFor(base);
    const at = alerts.filter((a) => a.kind === 'at');
    assert.deepEqual(
      at.map((a) => `${a.prayer} ${hm(a.time)}`),
      ['fajr 04:18', 'dhuhr 11:24', 'asr 14:44', 'maghrib 17:13', 'isha 18:27'],
    );
    assert.equal(find(alerts, '2026-10-12:at:fajr').sound, 'adhan-fajr');
    assert.equal(find(alerts, '2026-10-12:at:asr').sound, 'adhan');
  });

  test('per-prayer at-time switch and sound', () => {
    const alerts = alertsFor({
      ...base,
      'reminders.dhuhr.atTime': false,
      'reminders.asr.sound': 'chime',
    });
    assert.equal(find(alerts, '2026-10-12:at:dhuhr'), undefined);
    assert.equal(find(alerts, '2026-10-12:at:asr').sound, 'chime');
  });

  test('minutes-before reminders', () => {
    const alerts = alertsFor({ ...base, 'reminders.asr.before': 10, 'reminders.fajr.before': 30 });
    assert.equal(hm(find(alerts, '2026-10-12:before:asr').time), '14:34');
    assert.equal(hm(find(alerts, '2026-10-12:before:fajr').time), '03:48');
    assert.equal(find(alerts, '2026-10-12:before:dhuhr'), undefined); // 0 = off
  });

  test('window-ending reminders use the end of each prayer window', () => {
    const alerts = alertsFor({
      ...base,
      'reminders.fajr.windowEnd': 15,
      'reminders.asr.windowEnd': 15,
      'reminders.maghrib.windowEnd': 10,
      'reminders.isha.windowEnd': 30,
    });
    const asr = find(alerts, '2026-10-12:windowEnd:asr');
    assert.equal(hm(asr.target), '17:13');
    assert.equal(hm(asr.time), '16:58');
    assert.equal(asr.onlyIf, 'unprayed');
    assert.equal(hm(find(alerts, '2026-10-12:windowEnd:fajr').time), '05:20'); // sunrise 05:35
    assert.equal(hm(find(alerts, '2026-10-12:windowEnd:maghrib').time), '18:17'); // isha 18:27
    assert.equal(hm(find(alerts, '2026-10-12:windowEnd:isha').time), '22:16'); // midnight 22:46
  });

  test('Isha can end at Fajr instead of midnight', () => {
    const alerts = alertsFor({
      ...base,
      'reminders.isha.windowEnd': 30,
      'reminders.ishaEnd': 'fajr',
    });
    const isha = find(alerts, '2026-10-12:windowEnd:isha');
    const next = computeDay(MANAMA, '2026-10-13', base);
    assert.equal(isha.target.getTime(), next.fajr.getTime());
    assert.equal(isha.target - isha.time, 30 * 60_000);
  });

  test('sunrise warning (default 15 min)', () => {
    const s = find(alertsFor(base), '2026-10-12:sunrise:fajr');
    assert.equal(hm(s.time), '05:20');
    assert.equal(s.onlyIf, 'unprayed');
    const off = alertsFor({ ...base, 'reminders.sunriseWarning': 0 });
    assert.equal(find(off, '2026-10-12:sunrise:fajr'), undefined);
  });

  test("Jumu'ah reminder only on Fridays", () => {
    const week = alertsFor({ ...base, 'reminders.jumuahMinutes': 45 }, '2026-10-12', 7);
    const jumuah = week.filter((a) => a.kind === 'jumuah');
    assert.equal(jumuah.length, 1);
    assert.equal(jumuah[0].day, '2026-10-16'); // the Friday
    assert.equal(jumuah[0].target - jumuah[0].time, 45 * 60_000);
    const off = alertsFor({ ...base, 'reminders.jumuah': false }, '2026-10-16');
    assert.equal(off.filter((a) => a.kind === 'jumuah').length, 0);
  });

  test('fill-in reminder after Isha', () => {
    const alerts = alertsFor({
      ...base,
      'tracker.fillReminder': true,
      'tracker.fillReminderMinutes': 60,
    });
    const fill = find(alerts, '2026-10-12:fill:isha');
    assert.equal(hm(fill.time), '19:27');
    assert.equal(fill.onlyIf, 'unmarked');
  });

  test('quiet hours silence reminders but not at-time alerts', () => {
    const alerts = alertsFor({
      ...base,
      'reminders.quietHours': true,
      'reminders.quietStart': '22:00',
      'reminders.quietEnd': '06:00',
      'reminders.fajr.before': 15,
    });
    assert.equal(find(alerts, '2026-10-12:at:fajr').sound, 'adhan-fajr');
    assert.equal(find(alerts, '2026-10-12:at:fajr').quiet, false);
    assert.equal(find(alerts, '2026-10-12:before:fajr').sound, 'silent');
    assert.equal(find(alerts, '2026-10-12:sunrise:fajr').quiet, true);
    assert.equal(find(alerts, '2026-10-12:at:asr').quiet, false);
  });

  test('alerts are sorted by time', () => {
    const alerts = alertsFor({ ...base, 'reminders.asr.before': 10 }, '2026-10-12', 2);
    for (let i = 1; i < alerts.length; i++) assert.ok(alerts[i - 1].time <= alerts[i].time);
  });
});

describe('dueAlerts', () => {
  const t0 = new Date('2026-10-12T11:24:00+03:00');
  const mk = (id, minutesAgo) => ({ id, time: new Date(t0 - minutesAgo * 60_000) });

  test('fires alerts due within the grace period, once', () => {
    const alerts = [mk('a', 0), mk('b', 2), mk('c', 10), mk('d', -5)];
    const { due, stale } = dueAlerts(alerts, t0, new Set(['b']));
    assert.deepEqual(
      due.map((a) => a.id),
      ['a'],
    );
    assert.deepEqual(
      stale.map((a) => a.id),
      ['c'],
    );
  });
});

describe('passesCondition', () => {
  test('window-end and sunrise reminders are skipped once the prayer is marked', () => {
    const alert = { onlyIf: 'unprayed', prayer: 'asr' };
    assert.equal(passesCondition(alert, {}), true);
    assert.equal(passesCondition(alert, { asr: 'prayed' }), false);
    assert.equal(passesCondition(alert, { asr: 'late' }), false);
    assert.equal(passesCondition(alert, { asr: 'missed' }), true);
  });

  test('fill-in reminder only when something is unmarked', () => {
    const alert = { onlyIf: 'unmarked' };
    const full = {
      fajr: 'prayed',
      dhuhr: 'prayed',
      asr: 'late',
      maghrib: 'missed',
      isha: 'prayed',
    };
    assert.equal(passesCondition(alert, full), false);
    assert.equal(passesCondition(alert, { ...full, isha: undefined }), true);
  });
});
