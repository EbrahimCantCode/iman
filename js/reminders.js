// Reminder scheduling (pure): turns prayer times + settings into a list of
// alerts. Titles are rendered later (js/notify.js) so this stays testable.

import { PRAYERS } from './config/constants.js';
import { COMBINE_PAIRS } from './config/travel-rules.js';
import { windowEnd } from './prayer.js';
import { weekdayOf, minutesOfDay, hmToMinutes, inDailyRange, MINUTE } from './time.js';

/**
 * @typedef {object} Alert
 * @property {string} id      unique per day/kind/prayer, e.g. "2026-10-12:before:asr"
 * @property {Date}   time    when to fire
 * @property {'at'|'before'|'windowEnd'|'sunrise'|'jumuah'|'fill'|'combined'} kind
 * @property {string} prayer  related prayer ("fajr" for sunrise warnings)
 * @property {string} day     calendar day the prayer belongs to
 * @property {Date}   target  the prayer time / window end the alert refers to
 * @property {'adhan'|'adhan-fajr'|'chime'|'silent'} sound
 * @property {boolean} quiet  inside quiet hours (shown silently)
 * @property {'unprayed'|'unmarked'|null} onlyIf  condition checked when firing
 */

/**
 * Build alerts for consecutive days.
 * @param {object} p
 * @param {object[]} p.days   consecutive day times from computeDay (e.g. yesterday, today, tomorrow)
 * @param {object} p.values  settings
 * @param {string} p.tz      location time zone (for quiet hours and Fridays)
 * @param {{mode: 'off'|'early'|'delayed', single: boolean}} [p.combine]
 *   travel mode combining: with `single`, one alert for each combined pair
 *   replaces the two at-time alerts
 * @returns {Alert[]} sorted by time
 */
export function buildAlerts({ days, values, tz, combine = null }) {
  if (!values['reminders.enabled']) return [];
  const alerts = [];
  const quietOn = values['reminders.quietHours'];
  const qStart = hmToMinutes(values['reminders.quietStart']);
  const qEnd = hmToMinutes(values['reminders.quietEnd']);
  const isQuiet = (time) => quietOn && inDailyRange(minutesOfDay(time, tz), qStart, qEnd);

  const add = (a) => {
    if (!(a.time instanceof Date) || Number.isNaN(a.time.getTime())) return;
    const quiet = a.kind !== 'at' && isQuiet(a.time);
    alerts.push({ onlyIf: null, ...a, quiet, sound: quiet ? 'silent' : a.sound });
  };

  days.forEach((day, i) => {
    const next = days[i + 1] ?? null;
    for (const p of PRAYERS) {
      const time = day[p];
      if (!time) continue;
      const sound = values[`reminders.${p}.sound`];
      if (values[`reminders.${p}.atTime`]) {
        add({
          id: `${day.day}:at:${p}`,
          kind: 'at',
          prayer: p,
          day: day.day,
          time,
          target: time,
          sound: sound === 'adhan' && p === 'fajr' ? 'adhan-fajr' : sound,
        });
      }
      const before = values[`reminders.${p}.before`];
      if (before > 0) {
        add({
          id: `${day.day}:before:${p}`,
          kind: 'before',
          prayer: p,
          day: day.day,
          time: new Date(time.getTime() - before * MINUTE),
          target: time,
          sound: 'chime',
        });
      }
      const endBefore = values[`reminders.${p}.windowEnd`];
      // The last day has no next day: Isha ending at Fajr is then unknown (skipped).
      const end = windowEnd(p, day, next ?? {}, values['reminders.ishaEnd']);
      if (endBefore > 0 && end) {
        add({
          id: `${day.day}:windowEnd:${p}`,
          kind: 'windowEnd',
          prayer: p,
          day: day.day,
          time: new Date(end.getTime() - endBefore * MINUTE),
          target: end,
          sound: 'chime',
          onlyIf: 'unprayed',
        });
      }
    }

    const sunriseBefore = values['reminders.sunriseWarning'];
    if (sunriseBefore > 0 && day.sunrise) {
      add({
        id: `${day.day}:sunrise:fajr`,
        kind: 'sunrise',
        prayer: 'fajr',
        day: day.day,
        time: new Date(day.sunrise.getTime() - sunriseBefore * MINUTE),
        target: day.sunrise,
        sound: 'chime',
        onlyIf: 'unprayed',
      });
    }

    if (values['reminders.jumuah'] && weekdayOf(day.day) === 5 && day.dhuhr) {
      add({
        id: `${day.day}:jumuah:dhuhr`,
        kind: 'jumuah',
        prayer: 'dhuhr',
        day: day.day,
        time: new Date(day.dhuhr.getTime() - values['reminders.jumuahMinutes'] * MINUTE),
        target: day.dhuhr,
        sound: 'chime',
      });
    }

    if (values['tracker.fillReminder'] && day.isha) {
      add({
        id: `${day.day}:fill:isha`,
        kind: 'fill',
        prayer: 'isha',
        day: day.day,
        time: new Date(day.isha.getTime() + values['tracker.fillReminderMinutes'] * MINUTE),
        target: day.isha,
        sound: 'chime',
        onlyIf: 'unmarked',
      });
    }
  });

  if (combine?.single && combine.mode !== 'off') combinePairs(alerts, days, values, combine.mode);
  return alerts.sort((a, b) => a.time - b.time);
}

/** Replace the at-time alerts of each combined pair with one alert. */
function combinePairs(alerts, days, values, mode) {
  for (const day of days) {
    for (const [first, second] of COMBINE_PAIRS) {
      const ids = [`${day.day}:at:${first}`, `${day.day}:at:${second}`];
      const pairAlerts = alerts.filter((a) => ids.includes(a.id));
      if (!pairAlerts.length) continue;
      for (const a of pairAlerts) alerts.splice(alerts.indexOf(a), 1);
      const time = mode === 'early' ? day[first] : day[second];
      if (!time) continue;
      alerts.push({
        id: `${day.day}:combined:${first}`,
        kind: 'combined',
        prayer: first,
        partner: second,
        combineType: mode,
        day: day.day,
        time,
        target: time,
        sound: values[`reminders.${first}.sound`],
        quiet: false,
        onlyIf: null,
      });
    }
  }
}

/**
 * Alerts that should fire now: due within the last `graceMs` and not fired yet.
 * Older missed alerts are reported separately so they can be marked as handled.
 */
export function dueAlerts(alerts, now, fired, graceMs = 3 * MINUTE) {
  const due = [];
  const stale = [];
  for (const a of alerts) {
    if (fired.has(a.id) || a.time > now) continue;
    if (now - a.time <= graceMs) due.push(a);
    else stale.push(a);
  }
  return { due, stale };
}

/** Whether a conditional alert should still be shown (checked at fire time). */
export function passesCondition(alert, dayRecord) {
  if (alert.onlyIf === 'unprayed') {
    const s = dayRecord?.[alert.prayer];
    return s !== 'prayed' && s !== 'late';
  }
  if (alert.onlyIf === 'unmarked') return PRAYERS.some((p) => !dayRecord?.[p]);
  return true;
}
