// Travel mode on the Today screen: shortened rak'ahs under Dhuhr, Asr and
// Isha, combined prayer windows with the early/delayed choice, a next
// prayer that understands combining, and marking a combined pair together.

import { h } from '../ui.js';
import { t, fmtTime, fmtDuration } from '../i18n/index.js';
import {
  combineMode,
  shortenedRakahs,
  combinedWindows,
  formalCombining,
  nextPrayerTravel,
  openCombinedPair,
} from '../travel.js';
import { COMBINE_PAIRS } from '../config/travel-rules.js';
import { zonedTimeToDate } from '../time.js';

export function installTravelToday(ctx) {
  const c = ctx.travel;
  const mode = () => combineMode(ctx.values(), c.rules(), c.active());
  const pairOf = (p) => COMBINE_PAIRS.find((pair) => pair.includes(p));
  const name = (p) => t(`prayer.${p}`);

  ctx.hooks.rowNote = (prayer) => {
    if (!c.active()) return null;
    const r = shortenedRakahs(prayer, c.rules());
    if (!r) return null;
    return t(r.shortening === 'obligatory' ? 'travel.shortened' : 'travel.mayShorten');
  };

  ctx.hooks.nextPrayer = (now, schedule) => {
    const m = mode();
    return m === 'off' ? null : nextPrayerTravel(now, schedule, m);
  };

  ctx.hooks.heroSub = (now, schedule) => {
    const m = mode();
    if (m === 'off') return null;
    const done = (day, p) => ['prayed', 'late'].includes(ctx.tracker.getDay(day)[p]);
    const open = openCombinedPair(now, schedule, m, ctx.values()['reminders.ishaEnd'], done);
    if (!open) return null;
    return t('travel.pairOpen', {
      pair: open.pair.map(name).join(' + '),
      duration: fmtDuration(open.until - now),
    });
  };

  ctx.hooks.effectiveTime = (prayer, day) => {
    if (mode() !== 'early') return null;
    const pair = pairOf(prayer);
    return pair && pair[1] === prayer ? day[pair[0]] : null;
  };

  /**
   * While travelling, record how a prayer was prayed: shortened (4-rak'ah
   * prayers) and, when combining, mark the pair together.
   */
  ctx.hooks.markPrayer = (date, prayer, status) => {
    if (!c.active()) return false;
    const r = c.rules();
    const m = mode();
    const pair = m === 'off' ? null : pairOf(prayer);
    for (const p of pair ?? [prayer]) {
      const meta = status
        ? {
            shortened: Boolean(shortenedRakahs(p, r)),
            ...(pair ? { combinedWith: pair.find((x) => x !== p), combineType: m } : {}),
          }
        : null;
      ctx.tracker.setStatus(date, p, status, meta);
    }
    ctx.tracker.setTravelDay?.(date, true);
    return true;
  };

  // One reminder for a combined pair (setting), only while travelling.
  ctx.hooks.combineAlerts = () =>
    c.active() ? { mode: mode(), single: ctx.values()['travel.combinedReminder'] } : null;

  ctx.hooks.alertsVersion = () => ctx.travelStore.get();

  // Stay-limit reminder at 09:00 at the destination, once a day while it applies.
  ctx.hooks.extraAlerts = (schedule) => {
    const out = [];
    if (c.active() && ctx.values()['travel.stayReminder']) {
      const lines = c.stayLines();
      const tz = ctx.location()?.tz;
      const when = zonedTimeToDate(`${schedule.today.day}T09:00`, tz);
      if (lines.length > 1 && when) {
        out.push({
          id: `${schedule.today.day}:stay`,
          kind: 'stay',
          prayer: 'fajr',
          day: schedule.today.day,
          time: when,
          target: when,
          sound: 'chime',
          quiet: false,
          onlyIf: null,
          title: t('notify.stay.title'),
          body: lines.at(-1),
        });
      }
    }
    for (const fn of ctx.hooks.moreAlerts ?? []) out.push(...fn(schedule));
    return out;
  };

  ctx.hooks.afterList.push((el, schedule) => {
    if (!c.active() || !ctx.values()['travel.showCombined']) return;
    const r = c.rules();
    const tz = ctx.location()?.tz;
    const f = (d) => fmtTime(d, tz);
    const card = h('section', { class: 'card combine-card', 'aria-labelledby': 'combine-title' });
    const windows = combinedWindows(
      schedule.today,
      schedule.tomorrow,
      ctx.values()['reminders.ishaEnd'],
    );

    if (r.combining.length) {
      card.append(h('h2', { id: 'combine-title', text: t('travel.combineTitle') }));
      for (const w of windows) {
        card.append(
          h('p', {
            class: 'travel-line',
            text: t('travel.pairWindow', {
              pair: w.pair.map(name).join(' + '),
              from: f(w.start),
              to: f(w.end),
            }),
          }),
        );
      }
      const options = ['off', ...r.combining];
      const current = mode();
      card.append(
        h(
          'div',
          { class: 'seg', role: 'group', 'aria-label': t('set.travel.combineMode') },
          options.map((o) =>
            h('button', {
              type: 'button',
              'aria-pressed': String(o === current),
              text: t(`travel.combine.${o}`),
              onclick: () => ctx.settings.set('travel.combineMode', o),
            }),
          ),
        ),
      );
      if (current !== 'off') {
        for (const w of windows) {
          const span = w[current];
          card.append(
            h('p', {
              class: 'hint',
              text: t(`travel.combineHow.${current}`, {
                pair: w.pair.map(name).join(' + '),
                owner: name(current === 'early' ? w.pair[0] : w.pair[1]),
                from: f(span.start),
                to: f(span.end),
              }),
            }),
          );
        }
      }
    } else if (r.formalCombining) {
      // Hanafi: no real combining; show the "end of one, start of the next" option.
      const fc = formalCombining(schedule.today);
      card.append(
        h('h2', { id: 'combine-title', text: t('travel.formalTitle') }),
        h('p', { class: 'travel-line', text: t('travel.formalNoon', { time: f(fc.dhuhrUntil) }) }),
        h('p', {
          class: 'travel-line',
          text: t('travel.formalEvening', { time: f(fc.maghribUntil) }),
        }),
        h('p', { class: 'hint', text: t('travel.formalNote') }),
      );
    } else return;
    el.append(card);
  });
}
