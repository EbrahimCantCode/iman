// Trip planner: pick a destination and dates, see the prayer times there for
// every day in the destination's time zone (with home time next to them),
// the suggested calculation method and the Qibla. Everything is computed on
// the device.

import { h, clear, openDialog, toast, confirmDialog, nextId } from '../ui.js';
import { icon } from '../icons.js';
import { t, fmtTime, fmtDate, fmtNum } from '../i18n/index.js';
import { suggestMethod, resolveMethod } from '../config/methods.js';
import { tripTimes, tripDates, tripValues, newTripId } from '../travel.js';
import { qiblaBearing } from '../qibla.js';
import { distanceToMakkahKm } from '../location.js';
import { addDays, parseYmd } from '../time.js';
import { pickPlace, locationPatch } from './location-picker.js';
import { placeName, fmtDistance } from './travel-ui.js';
import { disclaimer } from './travel.js';

const TIMES = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const noonUtc = (d) => {
  const p = parseYmd(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
};
const fmtDay = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  fmtDate(noonUtc(d), 'UTC', opts);

export function installTripPlanner(ctx) {
  const store = ctx.travelStore;

  /** Start travel mode for a saved trip (destination, length, method). */
  function startTrip(trip) {
    const v = ctx.values();
    const previousMethod = trip.method === 'suggested' ? v['prayer.method'] : null;
    ctx.travel.start({
      destination: trip.destination,
      plannedDays: tripDates(trip).length,
      tripId: trip.id,
      previousMethod,
    });
    ctx.settings.setMany({
      ...locationPatch(trip.destination, 'city'),
      ...(trip.method === 'suggested'
        ? { 'prayer.method': suggestMethod(trip.destination.country) }
        : {}),
    });
    store.markOffered(trip.id);
    toast(t('travel.started'));
  }

  // ------------------------------------------------------------ plan dialog

  function openPlanDialog(existing = null) {
    let destination = existing?.destination ?? null;
    const today = ctx.travel.today();
    const destText = h('strong', { role: 'status' });
    const methodBox = h('div');
    const startId = nextId('ts');
    const endId = nextId('te');
    const start = h('input', {
      id: startId,
      type: 'date',
      class: 'input',
      value: existing?.start ?? today,
      min: '2000-01-01',
    });
    const end = h('input', {
      id: endId,
      type: 'date',
      class: 'input',
      value: existing?.end ?? addDays(today, 4),
      min: '2000-01-01',
    });
    const error = h('p', { class: 'hint', role: 'alert' });
    let method = existing?.method ?? 'suggested';

    const renderMethod = () => {
      clear(methodBox);
      if (!destination) return;
      const suggested = suggestMethod(destination.country);
      const mine = resolveMethod(ctx.values()['prayer.method'], ctx.location()?.country);
      const name = nextId('tm');
      methodBox.append(
        h('h3', { class: 'set-group-title', text: t('trip.method') }),
        ...[
          ['suggested', t('trip.methodSuggested', { method: t(`opt.method.${suggested}`) })],
          ['mine', t('trip.methodMine', { method: t(`opt.method.${mine}`) })],
        ].map(([value, label]) => {
          const id = nextId('tmo');
          return h(
            'label',
            { class: 'check', for: id },
            h('input', {
              type: 'radio',
              id,
              name,
              value,
              checked: method === value,
              onchange: () => (method = value),
            }),
            h('span', { text: label }),
          );
        }),
      );
    };
    const showDest = () => {
      destText.textContent = destination ? placeName(destination) : t('trip.noDestination');
      renderMethod();
    };
    showDest();

    const save = () => {
      if (!destination) {
        error.textContent = t('trip.needDestination');
        return;
      }
      if (!start.value || !end.value || end.value < start.value) {
        error.textContent = t('trip.badDates');
        return;
      }
      if (tripDates({ start: start.value, end: end.value }).length >= 60) {
        error.textContent = t('trip.tooLong');
        return;
      }
      const trip = {
        id: existing?.id ?? newTripId(),
        destination,
        start: start.value,
        end: end.value,
        method,
      };
      store.saveTrip(trip);
      dlg.close();
      ctx.navigate(`#travel/trip/${trip.id}`);
    };

    const dlg = openDialog({
      title: t(existing ? 'trip.edit' : 'trip.plan'),
      content: [
        h('h3', { class: 'set-group-title', text: t('travel.destination') }),
        h('div', { class: 'loc-summary' }, icon('pin'), destText),
        h('button', {
          type: 'button',
          class: 'btn',
          text: t('trip.pickDestination'),
          onclick: async () => {
            const picked = await pickPlace(ctx, {
              tabs: ['city', 'manual'],
              title: t('travel.destination'),
            });
            if (picked) destination = picked.place;
            showDest();
          },
        }),
        h(
          'div',
          { class: 'field trip-dates' },
          h('label', { for: startId, text: t('trip.startDate') }),
          start,
        ),
        h(
          'div',
          { class: 'field trip-dates' },
          h('label', { for: endId, text: t('trip.endDate') }),
          end,
        ),
        methodBox,
        error,
      ],
      actions: [
        h('button', {
          type: 'button',
          class: 'btn',
          text: t('common.cancel'),
          onclick: () => dlg.close(),
        }),
        h('button', {
          type: 'button',
          class: 'btn btn-primary',
          text: t('common.save'),
          onclick: save,
        }),
      ],
    });
  }

  // ------------------------------------------------------------ travel screen card

  ctx.hooks.travelSections.push((el) => {
    const trips = store.get().trips;
    const card = h(
      'section',
      { class: 'card', 'aria-labelledby': 'trips-title' },
      h('h2', { id: 'trips-title', text: t('trip.title') }),
      h('p', { class: 'hint', text: t('trip.intro') }),
    );
    if (trips.length) {
      const list = h('ul', { class: 'trip-list' });
      for (const trip of trips) {
        list.append(
          h(
            'li',
            null,
            h(
              'a',
              { href: `#travel/trip/${trip.id}`, class: 'trip-link' },
              h('strong', { text: placeName(trip.destination) }),
              h('span', { class: 'hint', text: `${fmtDay(trip.start)} – ${fmtDay(trip.end)}` }),
            ),
          ),
        );
      }
      card.append(list);
    }
    card.append(
      h('button', {
        type: 'button',
        class: 'btn btn-primary',
        text: t('trip.plan'),
        onclick: () => openPlanDialog(),
      }),
    );
    el.append(card);
  });

  // ------------------------------------------------------------ trip page

  ctx.hooks.travelSubviews.trip = (el, [id]) => {
    const trip = store.get().trips.find((x) => x.id === id);
    if (!trip) {
      el.append(h('p', { class: 'hint', text: t('trip.notFound') }));
      return;
    }
    const v = ctx.values();
    const dest = trip.destination;
    const home = ctx.travel.home();
    const showHome = v['travel.showHomeTime'] && home?.tz && home.tz !== dest.tz;
    const usedMethod = resolveMethod(tripValues(trip, v)['prayer.method'], dest.country);
    const days = tripTimes(trip, v);

    el.append(
      h('h1', { class: 'view-title', text: placeName(dest) }),
      h('p', {
        class: 'hint',
        text: `${fmtDay(trip.start, { day: 'numeric', month: 'long' })} – ${fmtDay(trip.end, { day: 'numeric', month: 'long', year: 'numeric' })} · ${dest.tz}`,
      }),
    );

    // Method: accept the destination's suggestion or keep mine.
    const suggested = suggestMethod(dest.country);
    el.append(
      h(
        'section',
        { class: 'card' },
        h('p', null, t('trip.methodUsed', { method: t(`opt.method.${usedMethod}`) })),
        trip.method === 'suggested'
          ? h('button', {
              type: 'button',
              class: 'btn btn-sm',
              text: t('trip.keepMine'),
              onclick: () => store.saveTrip({ ...trip, method: 'mine' }),
            })
          : h('button', {
              type: 'button',
              class: 'btn btn-sm',
              text: t('trip.useSuggested', { method: t(`opt.method.${suggested}`) }),
              onclick: () => store.saveTrip({ ...trip, method: 'suggested' }),
            }),
      ),
    );

    // Qibla at the destination.
    el.append(
      h(
        'section',
        { class: 'card trip-qibla' },
        icon('qibla'),
        h(
          'p',
          null,
          t('trip.qibla', {
            deg: fmtNum(Math.round(qiblaBearing(dest.lat, dest.lon))),
            distance: fmtDistance(distanceToMakkahKm(dest), v['travel.units']),
          }),
        ),
      ),
    );

    // Daily times, in the destination's time zone.
    const list = h('div', { class: 'trip-days' });
    days.forEach((day, i) => {
      const rows = TIMES.map((p) =>
        h(
          'tr',
          null,
          h('th', { scope: 'row', text: t(`prayer.${p}`) }),
          h(
            'td',
            null,
            h('time', { datetime: day[p]?.toISOString() ?? '', text: fmtTime(day[p], dest.tz) }),
          ),
          showHome ? h('td', { class: 'hint', text: fmtTime(day[p], home.tz) }) : null,
        ),
      );
      list.append(
        h(
          'details',
          { class: 'card trip-day', open: i === 0 },
          h('summary', {
            text: fmtDay(day.day, { weekday: 'long', day: 'numeric', month: 'long' }),
          }),
          h(
            'table',
            { class: 'trip-table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('td'),
                h('th', { scope: 'col', text: t('trip.localTime') }),
                showHome
                  ? h('th', { scope: 'col', text: t('trip.homeTime', { place: placeName(home) }) })
                  : null,
              ),
            ),
            h('tbody', null, rows),
          ),
        ),
      );
    });
    el.append(list);

    const active = ctx.travel.active();
    el.append(
      h(
        'div',
        { class: 'btn-row' },
        active
          ? null
          : h('button', {
              type: 'button',
              class: 'btn btn-primary',
              text: t('trip.start'),
              onclick: () => {
                startTrip(trip);
                ctx.navigate('#today');
              },
            }),
        h('button', {
          type: 'button',
          class: 'btn',
          text: t('trip.edit'),
          onclick: () => openPlanDialog(trip),
        }),
        h('button', {
          type: 'button',
          class: 'btn btn-ghost',
          text: t('common.delete'),
          onclick: async () => {
            const ok = await confirmDialog({
              title: t('trip.delete'),
              body: t('trip.deleteConfirm', { place: placeName(dest) }),
              confirmLabel: t('common.delete'),
              danger: true,
            });
            if (ok) {
              store.deleteTrip(trip.id);
              ctx.navigate('#travel');
            }
          },
        }),
      ),
      h('p', { class: 'hint', text: t('trip.offline') }),
      disclaimer(),
    );
  };

  // ------------------------------------------------------------ start offer on Today

  ctx.hooks.tripOffer = (trip) =>
    h(
      'section',
      { class: 'card travel-suggest', role: 'status' },
      h('p', { text: t('trip.offer', { place: placeName(trip.destination) }) }),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          type: 'button',
          class: 'btn btn-primary',
          text: t('trip.start'),
          onclick: () => startTrip(trip),
        }),
        h('button', {
          type: 'button',
          class: 'btn btn-ghost',
          text: t('install.dismiss'),
          onclick: () => store.markOffered(trip.id),
        }),
      ),
    );
}
