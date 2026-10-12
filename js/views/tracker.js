// Tracker screen (streaks, last 7 days, 30-day heatmap, day editor), the
// check buttons on the Today screen and the Sunnah chips.

import { h, clear, openDialog, nextId } from '../ui.js';
import { icon } from '../icons.js';
import { t, tn, fmtNum, fmtDate, currentLanguage } from '../i18n/index.js';
import { PRAYERS, STATUSES, SUNNAH, AR_NAMES } from '../config/constants.js';
import {
  computeStreaks,
  completion,
  lastDates,
  nextStatus,
  weekStartDate,
  countTravelDays,
} from '../tracker.js';
import { COMBINE_PAIRS, SHORTENED_PRAYERS } from '../config/travel-rules.js';
import { ymd, weekdayOf, addDays, parseYmd } from '../time.js';

/** Noon UTC of a calendar day, for formatting dates without zone shifts. */
const dateOf = (s) => {
  const p = parseYmd(s);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
};

const STATUS_ICONS = { prayed: 'check', late: 'late', missed: 'missed', none: 'none' };

function prayerName(p) {
  return t(`prayer.${p}`);
}

/** The status button shown on each prayer row of the Today screen. */
export function createStatusButton(ctx, prayer, day, time) {
  const date = day.day;
  const btn = h('button', { type: 'button', class: 'status-btn' });
  let shown;
  const refresh = () => {
    const status = ctx.tracker.getDay(date)[prayer] ?? null;
    if (status === shown) return;
    shown = status;
    btn.dataset.status = status ?? 'none';
    clear(btn).append(icon(STATUS_ICONS[status ?? 'none']));
    btn.setAttribute(
      'aria-label',
      t('today.markAria', { prayer: prayerName(prayer), status: t(`status.${status ?? 'none'}`) }),
    );
  };
  btn.addEventListener('click', () => {
    const current = ctx.tracker.getDay(date)[prayer] ?? null;
    const next = nextStatus(current, ctx.values()['tracker.statuses']);
    // Travel mode may mark a combined pair together.
    if (!ctx.hooks.markPrayer?.(date, prayer, next)) ctx.tracker.setStatus(date, prayer, next);
    navigator.vibrate?.(10);
    refresh();
  });
  btn.update = (now) => {
    // With early combining, Asr (or Isha) can be prayed from Dhuhr's (Maghrib's) time.
    const start = ctx.hooks.effectiveTime?.(prayer, day) ?? time;
    const notYet = Boolean(start && start > now);
    btn.disabled = notYet;
    btn.title = notYet ? t('today.notYet', { prayer: prayerName(prayer) }) : '';
    refresh();
  };
  refresh();
  return btn;
}

/** Sunnah toggles for one day (Today screen and day editor). */
function sunnahChips(ctx, date) {
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': t('tracker.sunnah') });
  for (const s of SUNNAH) {
    const done = Boolean(ctx.tracker.getDay(date).sunnah?.[s]);
    const btn = h('button', {
      type: 'button',
      class: 'chip-btn',
      'aria-pressed': String(done),
      text: t(`sunnah.${s}`),
      onclick: () => {
        const now = btn.getAttribute('aria-pressed') !== 'true';
        ctx.tracker.setSunnah(date, s, now);
        btn.setAttribute('aria-pressed', String(now));
      },
    });
    wrap.append(btn);
  }
  return wrap;
}

/** Card under the Today list with today's Sunnah prayers. */
export function todaySunnahCard(ctx) {
  if (!ctx.values()['tracker.sunnah']) return null;
  const loc = ctx.location();
  if (!loc) return null;
  const date = ymd(ctx.now(), loc.tz);
  return h(
    'section',
    { class: 'card' },
    h('h2', { text: t('tracker.sunnahToday') }),
    sunnahChips(ctx, date),
  );
}

/** Open the editor for one day. */
export function openDayEditor(ctx, date) {
  const content = h('div', { class: 'day-editor' });
  const render = () => {
    clear(content);
    const day = ctx.tracker.getDay(date);
    for (const p of PRAYERS) {
      const groupId = nextId('dg');
      const options = [
        ...STATUSES.filter((s) => ctx.values()['tracker.statuses'].includes(s)),
        'none',
      ];
      const name = `status-${p}`;
      content.append(
        h(
          'div',
          { class: 'day-row', role: 'radiogroup', 'aria-labelledby': groupId },
          h('span', { class: 'day-row-label', id: groupId, text: prayerName(p) }),
          h(
            'div',
            { class: 'seg seg-sm' },
            options.map((s) => {
              const id = nextId('st');
              const checked = (day[p] ?? 'none') === s;
              return h(
                'label',
                { class: ['seg-opt', `is-${s}`], for: id },
                h('input', {
                  type: 'radio',
                  id,
                  name,
                  value: s,
                  checked,
                  onchange: () => ctx.tracker.setStatus(date, p, s === 'none' ? null : s),
                }),
                h('span', { text: t(`status.short.${s}`) }),
              );
            }),
          ),
        ),
      );
    }
    if (ctx.values()['tracker.sunnah']) {
      content.append(
        h('h3', { class: 'set-group-title', text: t('tracker.sunnah') }),
        sunnahChips(ctx, date),
      );
    }
    if (day.wake)
      content.append(h('p', { class: 'hint', text: t('tracker.wake', { time: day.wake }) }));
    if (day.travel || day.meta || ctx.travel?.active())
      content.append(travelFlags(ctx, date, day, render));
  };
  render();
  openDialog({
    title: fmtDate(dateOf(date), 'UTC', { weekday: 'long', day: 'numeric', month: 'long' }),
    content,
  });
}

/** Travel flags in the day editor: travel day, shortened, combined (and how). */
function travelFlags(ctx, date, day, rerender) {
  const box = h(
    'div',
    { class: 'day-travel' },
    h('h3', { class: 'set-group-title', text: t('tracker.travel') }),
  );
  const travelId = nextId('tv');
  const travelSwitch = h('input', {
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    id: travelId,
    checked: Boolean(day.travel),
    onchange: () => {
      ctx.tracker.setTravelDay(date, travelSwitch.checked);
      rerender();
    },
  });
  box.append(
    h(
      'div',
      { class: 'set-row' },
      h(
        'label',
        { class: 'set-row-text', for: travelId },
        h('span', { class: 'set-row-label', text: t('tracker.travelDay') }),
      ),
      travelSwitch,
    ),
  );
  for (const p of PRAYERS) {
    if (!day[p]) continue;
    const meta = day.meta?.[p] ?? {};
    const pair = COMBINE_PAIRS.find((x) => x.includes(p));
    if (!SHORTENED_PRAYERS.includes(p) && !pair) continue;
    const row = h(
      'div',
      { class: 'day-flags' },
      h('span', { class: 'day-row-label', text: prayerName(p) }),
    );
    if (SHORTENED_PRAYERS.includes(p)) {
      const id = nextId('sh');
      const cb = h('input', {
        type: 'checkbox',
        id,
        checked: Boolean(meta.shortened),
        onchange: () => {
          ctx.tracker.setMeta(date, p, { ...meta, shortened: cb.checked || undefined });
          rerender();
        },
      });
      row.append(
        h('label', { class: 'check', for: id }, cb, h('span', { text: t('tracker.shortened') })),
      );
    }
    if (pair) {
      const partner = pair.find((x) => x !== p);
      const id = nextId('cb');
      const value = meta.combinedWith ? (meta.combineType ?? 'early') : 'none';
      const select = h(
        'select',
        {
          id,
          class: 'input',
          onchange: () => {
            const v = select.value;
            const { combinedWith: _c, combineType: _t, ...rest } = meta;
            ctx.tracker.setMeta(
              date,
              p,
              v === 'none' ? rest : { ...rest, combinedWith: partner, combineType: v },
            );
            rerender();
          },
        },
        ['none', 'early', 'delayed'].map((o) =>
          h('option', {
            value: o,
            text: t(`tracker.combined.${o}`, { prayer: prayerName(partner) }),
          }),
        ),
      );
      select.value = value;
      row.append(
        h('label', {
          class: 'visually-hidden',
          for: id,
          text: t('tracker.combinedLabel', { prayer: prayerName(p) }),
        }),
        select,
      );
    }
    box.append(row);
  }
  return box;
}

export function createTrackerView(ctx) {
  const el = h('section', { class: 'view view-tracker', 'aria-labelledby': 'tracker-title' });

  function render() {
    clear(el);
    el.append(h('h1', { id: 'tracker-title', class: 'view-title', text: t('tracker.title') }));
    const loc = ctx.location();
    const now = ctx.now();
    const tz = loc?.tz;
    const today = ymd(now, tz);
    const values = ctx.values();
    const days = ctx.tracker.all();
    const rule = values['tracker.streakRule'];
    const { current, best } = computeStreaks(days, today, rule);

    const schedule = ctx.schedule();
    // Days before tracking started don't count against you.
    // (Days with only a travel flag or Sunnah don't start tracking.)
    const since =
      Object.keys(days)
        .filter((d) => PRAYERS.some((p) => days[d][p]))
        .sort()[0] ?? today;
    const isDue = (d, p) => {
      if (d < since) return false;
      if (d < today) return true;
      if (d > today) return false;
      const time = schedule?.today?.[p];
      return time ? time <= now : false;
    };
    const week = completion(
      days,
      datesFrom(weekStartDate(today, values['tracker.weekStart'], weekdayOf), today),
      isDue,
    );
    const last7 = completion(days, lastDates(today, 7), isDue);
    const travelDays = countTravelDays(days, lastDates(today, 30));
    const pct = (r) =>
      r.total ? fmtNum(r.ratio, { style: 'percent', maximumFractionDigits: 0 }) : '—';

    el.append(
      h(
        'div',
        { class: 'stats' },
        stat(
          fmtNum(current),
          tn('tracker.daysUnit', current),
          t('tracker.currentStreak'),
          'is-accent',
        ),
        stat(fmtNum(best), tn('tracker.daysUnit', best), t('tracker.bestStreak')),
        stat(
          pct(last7),
          t('tracker.ofPrayers', { done: last7.done, total: last7.total }),
          t('tracker.last7'),
        ),
        stat(
          pct(week),
          t('tracker.ofPrayers', { done: week.done, total: week.total }),
          t('tracker.thisWeek'),
        ),
        travelDays
          ? stat(fmtNum(travelDays), tn('tracker.daysUnit', travelDays), t('tracker.travelDays'))
          : null,
      ),
    );

    // 30-day heatmap in two blocks of 15 days so cells stay tappable at 360px.
    const dates = lastDates(today, 30);
    const card = h(
      'section',
      { class: 'card', 'aria-labelledby': 'hm-title' },
      h('h2', { id: 'hm-title', text: t('tracker.heatmap') }),
      h('p', { class: 'hint', text: t('tracker.heatmapHelp') }),
      heatmap(dates.slice(0, 15), days, today, values),
      heatmap(dates.slice(15), days, today, values),
      legend(),
    );
    el.append(card);

    const sunnah = todaySunnahCard(ctx);
    if (sunnah) el.append(sunnah);

    el.append(
      h('p', {
        class: 'hint',
        text: t(`tracker.ruleNote.${rule}`),
      }),
    );
    if (!Object.keys(days).length) el.append(h('p', { class: 'hint', text: t('tracker.empty') }));
  }

  function heatmap(dates, days, today, values) {
    const weekStart = { sun: 0, mon: 1, sat: 6 }[values['tracker.weekStart']];
    const labels = h(
      'div',
      { class: 'hm-labels', 'aria-hidden': 'true' },
      PRAYERS.map((p) =>
        h('span', { text: currentLanguage() === 'ar' ? AR_NAMES[p] : prayerName(p) }),
      ),
    );
    const cols = h('div', { class: 'hm-days' });
    for (const d of dates) {
      const day = days[d] ?? {};
      const label = [
        fmtDate(dateOf(d), 'UTC', { weekday: 'long', day: 'numeric', month: 'long' }),
        ...PRAYERS.map((p) => `${prayerName(p)}: ${t(`status.${day[p] ?? 'none'}`)}`),
        day.travel ? t('tracker.travelDay') : null,
      ]
        .filter(Boolean)
        .join(', ');
      cols.append(
        h(
          'button',
          {
            type: 'button',
            class: [
              'hm-day',
              d === today && 'is-today',
              weekdayOf(d) === weekStart && 'week-start',
            ],
            'aria-label': label,
            onclick: () => openDayEditor(ctx, d),
          },
          PRAYERS.map((p) => h('span', { class: ['hm-cell', `is-${day[p] ?? 'none'}`] })),
          h('span', { class: 'hm-date', text: fmtNum(parseYmd(d).day) }),
          day.travel ? h('span', { class: 'hm-travel', 'aria-hidden': 'true', text: '✈' }) : null,
        ),
      );
    }
    return h('div', { class: 'hm' }, labels, cols);
  }

  function legend() {
    return h(
      'ul',
      { class: 'hm-legend' },
      [...STATUSES, 'none'].map((s) =>
        h(
          'li',
          null,
          h('span', { class: ['hm-cell', `is-${s}`], 'aria-hidden': 'true' }),
          t(`status.${s}`),
        ),
      ),
    );
  }

  function stat(value, unit, label, cls) {
    return h(
      'div',
      { class: ['stat', cls] },
      h('span', { class: 'stat-label', text: label }),
      h('span', { class: 'stat-value num', text: value }),
      h('span', { class: 'stat-unit', text: unit }),
    );
  }

  ctx.tracker.subscribe(() => {
    if (el.isConnected) render();
    else ctx.markDirty?.('tracker');
  });

  return { el, render, title: () => t('tab.tracker') };
}

function datesFrom(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
