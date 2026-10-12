// Today screen: dates, next-prayer hero with live countdown, the day's times.

import { h, clear } from '../ui.js';
import { icon } from '../icons.js';
import {
  t,
  fmtTime,
  fmtDate,
  fmtHijri,
  digits,
  fmtDuration,
  currentLanguage,
} from '../i18n/index.js';
import { nextPrayer, currentPrayer, windowEnd } from '../prayer.js';
import { formatCountdown, weekdayOf } from '../time.js';
import { PRAYERS } from '../config/constants.js';

export const AR_NAMES = Object.freeze({
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
  imsak: 'الإمساك',
  duha: 'الضحى',
  tahajjud: 'التهجد',
  jumuah: 'الجمعة',
});

/** Rows shown on the Today screen for the current settings. */
export function todayRows(values) {
  const rows = [];
  if (values['prayer.showImsak']) rows.push({ key: 'imsak', field: 'imsak', minor: true });
  rows.push({ key: 'fajr', field: 'fajr' });
  if (values['prayer.showSunrise']) rows.push({ key: 'sunrise', field: 'sunrise', minor: true });
  if (values['prayer.showDuha']) rows.push({ key: 'duha', field: 'duha', minor: true });
  rows.push({ key: 'dhuhr', field: 'dhuhr' });
  rows.push({ key: 'asr', field: 'asr' });
  rows.push({ key: 'maghrib', field: 'maghrib' });
  rows.push({ key: 'isha', field: 'isha' });
  if (values['prayer.showTahajjud'])
    rows.push({ key: 'tahajjud', field: 'lastThird', minor: true });
  return rows;
}

export function createTodayView(ctx) {
  const el = h('section', { class: 'view view-today', 'aria-labelledby': 'today-title' });
  let refs = null;
  let renderedDay = '';

  function prayerLabel(key, day) {
    // On Fridays, Dhuhr is Jumuʿah.
    if (key === 'dhuhr' && day && weekdayOf(day) === 5) return t('prayer.jumuah');
    return t(`prayer.${key}`);
  }

  function arLabel(key, day) {
    if (currentLanguage() === 'ar') return null;
    const k = key === 'dhuhr' && day && weekdayOf(day) === 5 ? 'jumuah' : key;
    return h('span', { class: 'ar', lang: 'ar', dir: 'rtl', text: AR_NAMES[k] });
  }

  function render() {
    clear(el);
    refs = null;
    const values = ctx.values();
    const loc = ctx.location();
    const n = ctx.now();

    el.append(h('h1', { id: 'today-title', class: 'visually-hidden', text: t('today.title') }));

    const head = h('header', { class: 'today-head' });
    head.append(
      h(
        'button',
        {
          type: 'button',
          class: 'loc-btn',
          'aria-label': loc
            ? `${t('today.changeLocation')}: ${ctx.locationName(loc)}`
            : t('today.setLocation'),
          onclick: () => ctx.openLocationPicker(),
        },
        icon('pin'),
        h('span', { text: loc ? ctx.locationName(loc) : t('today.setLocation') }),
      ),
    );
    const tz = loc?.tz;
    head.append(
      h(
        'p',
        { class: 'dates' },
        h('span', { class: 'hijri', text: fmtHijri(n, tz, values['prayer.hijriOffset']) }),
        ' · ',
        h('span', { class: 'greg', text: fmtDate(n, tz) }),
      ),
    );
    el.append(head);

    if (!loc) {
      el.append(
        h(
          'div',
          { class: 'card' },
          h('h2', { text: t('today.noLocation.title') }),
          h('p', { text: t('today.noLocation.body') }),
          h('button', {
            type: 'button',
            class: 'btn btn-primary',
            text: t('today.setLocation'),
            onclick: () => ctx.openLocationPicker(),
          }),
        ),
      );
      renderedDay = '';
      ctx.hooks.todayExtras?.(el);
      return;
    }

    const schedule = ctx.schedule();
    renderedDay = schedule.today.day;

    // Hero
    const hero = {
      label: h('p', { class: 'hero-label', text: t('today.next') }),
      name: h('h2', { class: 'hero-name' }),
      time: h('p', { class: 'hero-time' }),
      countdown: h('p', { class: 'hero-countdown', role: 'timer', 'aria-live': 'off' }),
      sub: h('p', { class: 'hero-sub' }),
      bar: h('span'),
    };
    el.append(
      h(
        'section',
        { class: 'hero', 'aria-label': t('today.next') },
        hero.label,
        hero.name,
        hero.time,
        hero.countdown,
        hero.sub,
        h('div', { class: 'hero-progress', 'aria-hidden': 'true' }, hero.bar),
      ),
    );

    // Times list
    const list = h('ol', { class: 'prayer-list', 'aria-label': t('today.timesList') });
    const rows = [];
    for (const row of todayRows(values)) {
      const time = schedule.today[row.field];
      const li = h(
        'li',
        { class: ['prayer-row', row.minor && 'is-minor'], dataset: { key: row.key } },
        h(
          'span',
          { class: 'name' },
          h('span', { class: 'label', text: prayerLabel(row.key, schedule.today.day) }),
          arLabel(row.key, schedule.today.day),
        ),
        h('time', { datetime: time ? time.toISOString() : '', text: fmtTime(time, tz) }),
      );
      const slot = row.minor
        ? h('span', { class: 'status-spacer' })
        : (ctx.hooks.statusButton?.(row.key, schedule.today, time) ??
          h('span', { class: 'status-spacer' }));
      li.append(slot);
      list.append(li);
      rows.push({ ...row, li, time, slot });
    }
    el.append(list);

    // Method line
    const methodName = t(`opt.method.${schedule.today.methodId}`);
    el.append(
      h(
        'p',
        { class: 'method-line' },
        values['prayer.method'] === 'auto'
          ? t('today.methodSuggested', { method: methodName })
          : t('today.method', { method: methodName }),
        ' · ',
        h('a', { href: '#settings/prayer', text: t('today.change') }),
        h('br'),
        t('today.compare'),
      ),
    );

    ctx.hooks.todayExtras?.(el);

    refs = { hero, rows, schedule, tz };
    update(n);
  }

  function update(n) {
    if (!refs) return;
    const loc = ctx.location();
    if (!loc) return;
    const schedule = ctx.schedule();
    if (schedule.today.day !== renderedDay || schedule !== refs.schedule) {
      render();
      return;
    }
    const { hero, rows, tz } = refs;
    const next = nextPrayer(n, schedule);
    const current = currentPrayer(n, schedule);

    if (next) {
      const label = prayerLabel(next.prayer, next.day);
      if (hero.name.dataset.key !== next.prayer + next.day) {
        clear(hero.name);
        hero.name.append(h('span', { text: label }), arLabel(next.prayer, next.day));
        hero.name.dataset.key = next.prayer + next.day;
      }
      hero.time.textContent = t('today.at', { time: fmtTime(next.time, tz) });
      const remaining = next.time - n;
      hero.countdown.textContent = digits(formatCountdown(remaining));
      hero.countdown.setAttribute('aria-label', fmtDuration(remaining));

      // Progress from the previous prayer to the next one.
      const prevTime = previousPrayerTime(n, schedule);
      const span = next.time - prevTime;
      const p = span > 0 ? Math.min(1, Math.max(0, (n - prevTime) / span)) : 0;
      hero.bar.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    }

    // "Asr ends in 1 h 5 min" while inside a prayer's window.
    if (current) {
      const day = current.day === schedule.today.day ? schedule.today : schedule.yesterday;
      const nextDay = current.day === schedule.today.day ? schedule.tomorrow : schedule.today;
      const end = windowEnd(current.prayer, day, nextDay, ctx.values()['reminders.ishaEnd']);
      hero.sub.textContent =
        end && end > n
          ? t('today.endsIn', {
              prayer: prayerLabel(current.prayer, current.day),
              duration: fmtDuration(end - n),
            })
          : '';
    } else {
      hero.sub.textContent = '';
    }

    for (const row of rows) {
      const isCurrent =
        !row.minor && current && current.prayer === row.key && current.day === schedule.today.day;
      row.li.classList.toggle('is-current', Boolean(isCurrent));
      row.li.classList.toggle('is-past', Boolean(row.time && row.time <= n && !isCurrent));
      if (isCurrent) row.li.setAttribute('aria-current', 'time');
      else row.li.removeAttribute('aria-current');
      row.slot.update?.(n);
    }
  }

  return { el, render, update, title: () => t('tab.today') };
}

function previousPrayerTime(n, schedule) {
  let prev = schedule.yesterday.isha;
  for (const p of PRAYERS) {
    const time = schedule.today[p];
    if (time && time <= n) prev = time;
  }
  return prev ?? n;
}
