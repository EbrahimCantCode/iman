// Travel mode in the UI: the controller (manual switch, suggestions, trip
// start/end), the start sheet, the Today card and the header badge.
//
// The switch is always manual: auto-detect only ever *suggests* turning
// travel mode on or off, and the user's choice wins.

import { h, add, openDialog, toast } from '../ui.js';
import { icon } from '../icons.js';
import { t, tn, fmtNum, currentLanguage } from '../i18n/index.js';
import {
  travelRules,
  travelSuggestion,
  distanceFromHome,
  stayStatus,
  toUnits,
  tripToOffer,
} from '../travel.js';
import { validCoords } from '../location.js';
import { ymd, addDays } from '../time.js';
import {
  pickPlace,
  gpsPlace,
  homePatch,
  locationPatch,
  gpsErrorMessage,
} from './location-picker.js';

/** Home location from settings, or null. */
export function homeFromSettings(v) {
  if (!validCoords(v['home.lat'], v['home.lon'])) return null;
  return {
    lat: v['home.lat'],
    lon: v['home.lon'],
    name: v['home.name'],
    nameAr: v['home.nameAr'],
    country: v['home.country'],
    tz: v['home.tz'],
  };
}

export const placeName = (p) => {
  if (!p) return '';
  if (currentLanguage() === 'ar' && p.nameAr) return p.nameAr;
  if (p.name) return p.name;
  const f = (n) => fmtNum(n, { maximumFractionDigits: 3 });
  return `${f(p.lat)}, ${f(p.lon)}`;
};

/** "more than 4 days, not counting ..." / "15 days or more" for the rules in effect. */
export function limitText(r) {
  const daysText = tn('tracker.days', r.maxStayDays);
  if (r.stayLimit === 'atLeast') return t('travel.limitAtLeast', { daysText });
  return t(r.excludeArrivalDeparture ? 'travel.limitMoreThanExcl' : 'travel.limitMoreThan', {
    daysText,
  });
}

/** "83 km" / "52 mi" in the user's units. */
export function fmtDistance(km, units) {
  return t(units === 'mi' ? 'travel.mi' : 'travel.km', {
    n: fmtNum(Math.round(toUnits(km, units))),
  });
}

export function createTravelController(ctx) {
  const store = ctx.travelStore;
  let freshHere = null; // a GPS position read only for detection (never saved)
  let changing = false;

  const active = () => ctx.values()['travel.enabled'];
  const home = () => homeFromSettings(ctx.values());
  const here = () => freshHere ?? ctx.location();
  const today = () => ymd(ctx.now(), ctx.location()?.tz);
  const rules = () => travelRules(ctx.values());

  /** Current suggestion banner, if any ({type, km}). */
  function suggestion() {
    const data = store.get();
    return travelSuggestion({
      values: ctx.values(),
      home: home(),
      here: here(),
      trip: data.current,
      dismissedAt: data.dismissedAt,
      endDismissedAt: data.endDismissedAt,
    });
  }

  /** Mark every day of the current trip (up to today) as a travel day in the tracker. */
  function markTravelDays() {
    const cur = store.current();
    if (!active() || !cur) return;
    const end = today();
    for (let d = cur.startDate, n = 0; d <= end && n < 400; d = addDays(d, 1), n++) {
      ctx.tracker.setTravelDay(d, true);
    }
  }

  /** Called whenever the location changes or the app opens. */
  function observe() {
    markTravelDays();
    const cur = store.current();
    if (!active() || !cur || cur.wasAway) return;
    const d = distanceFromHome(home(), here(), rules());
    if (d?.away) store.updateCurrent({ wasAway: true });
  }

  /** Turn travel mode on (manual switch, a suggestion or a saved trip). */
  function start({
    destination = null,
    plannedDays = null,
    tripId = null,
    previousMethod = null,
  } = {}) {
    changing = true;
    const d = distanceFromHome(home(), here(), rules());
    store.start({
      startDate: today(),
      destination,
      plannedDays,
      tripId,
      previousMethod,
      wasAway: Boolean(d?.away),
    });
    ctx.settings.set('travel.enabled', true);
    changing = false;
    markTravelDays();
  }

  /** Turn travel mode off. Remembers where, so it isn't suggested again on the spot. */
  function end() {
    changing = true;
    const cur = store.current();
    const p = here();
    store.end(p ? { lat: p.lat, lon: p.lon } : null);
    if (cur?.previousMethod) ctx.settings.set('prayer.method', cur.previousMethod);
    ctx.settings.set('travel.enabled', false);
    changing = false;
    // Offer to go back to home prayer times if the location is somewhere else.
    const h0 = home();
    const loc = ctx.location();
    if (h0 && loc && distanceFromHome(h0, loc, rules())?.km > 1) {
      toast(t('travel.ended'), {
        action: t('travel.useHome'),
        onAction: () => ctx.settings.setMany(locationPatch(h0, 'city')),
        duration: 8000,
      });
    } else toast(t('travel.ended'));
  }

  // The Settings switch (or anything else) changing travel.enabled.
  ctx.settings.subscribe((keys, v) => {
    if (changing || !keys.includes('travel.enabled')) return;
    if (v['travel.enabled'] && !store.current()) {
      store.start({
        startDate: today(),
        wasAway: Boolean(distanceFromHome(home(), here(), rules())?.away),
      });
      markTravelDays();
      openStartSheet();
    } else if (!v['travel.enabled'] && store.current()) {
      const p = here();
      store.end(p ? { lat: p.lat, lon: p.lon } : null);
    }
  });
  ctx.settings.subscribe((keys) => {
    if (keys.some((k) => k.startsWith('location.') || k.startsWith('home.'))) observe();
  });

  /** The manual switch on Today / Travel screen. */
  function toggle(on) {
    if (on) {
      start();
      openStartSheet();
    } else end();
  }

  /** Read a fresh position for detection only, if location permission was already given. */
  async function refreshPosition() {
    if (!ctx.values()['travel.autoDetect'] || !home()) return;
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' });
      if (status?.state !== 'granted') return;
      const place = await gpsPlace();
      freshHere = place;
      observe();
      ctx.refreshToday?.();
    } catch {
      /* keep using the saved location */
    }
  }

  // ------------------------------------------------------------ start sheet

  function openStartSheet() {
    let destination = store.current()?.destination ?? null;
    let useForPrayer = true;
    const destLabel = h('p', { class: 'loc-summary-text', role: 'status' });
    const showDest = () => {
      destLabel.textContent = destination ? placeName(destination) : t('travel.noDestination');
    };
    showDest();
    const gpsStatus = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    const days = h('input', {
      id: 'trip-days',
      class: 'input',
      type: 'number',
      inputmode: 'numeric',
      min: 1,
      max: 365,
      placeholder: t('travel.daysPlaceholder'),
    });
    const usePrayer = h('input', {
      type: 'checkbox',
      role: 'switch',
      class: 'switch',
      id: 'trip-use-prayer',
      checked: true,
      onchange: () => (useForPrayer = usePrayer.checked),
    });

    const save = () => {
      const n = Number(days.value);
      const plannedDays = Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
      store.updateCurrent({ destination, plannedDays });
      if (destination && useForPrayer) ctx.settings.setMany(locationPatch(destination, 'city'));
      dlg.close();
      toast(t('travel.started'));
    };

    const dlg = openDialog({
      title: t('travel.startTitle'),
      content: [
        h('p', { class: 'hint', text: t('travel.startIntro') }),
        h('h3', { class: 'set-group-title', text: t('travel.destination') }),
        h('div', { class: 'loc-summary' }, icon('pin'), destLabel),
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn',
            text: t('travel.useCurrent'),
            onclick: async () => {
              gpsStatus.textContent = t('loc.locating');
              try {
                destination = await gpsPlace();
                gpsStatus.textContent = '';
              } catch (err) {
                gpsStatus.textContent = gpsErrorMessage(err);
              }
              showDest();
            },
          }),
          h('button', {
            type: 'button',
            class: 'btn',
            text: t('loc.city'),
            onclick: async () => {
              const picked = await pickPlace(ctx, {
                tabs: ['city', 'manual'],
                title: t('travel.destination'),
              });
              if (picked) destination = picked.place;
              showDest();
            },
          }),
        ),
        gpsStatus,
        h(
          'label',
          { class: 'set-row', for: 'trip-use-prayer' },
          h(
            'span',
            { class: 'set-row-text' },
            h('span', { class: 'set-row-label', text: t('travel.useForPrayer') }),
          ),
          usePrayer,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'trip-days', text: t('travel.plannedDays') }),
          days,
          h('p', { class: 'hint', text: t('travel.plannedDaysHelp') }),
        ),
      ],
      actions: [
        h('button', {
          type: 'button',
          class: 'btn btn-ghost',
          text: t('common.skip'),
          onclick: () => dlg.close(),
        }),
        h('button', {
          type: 'button',
          class: 'btn btn-primary',
          text: t('travel.startButton'),
          onclick: save,
        }),
      ],
    });
  }

  // ------------------------------------------------------------ Today card

  /** Stay information lines for the current trip. */
  function stayLines() {
    const cur = store.current();
    if (!cur) return [];
    const r = rules();
    const v = ctx.values();
    const s = stayStatus({
      startDate: cur.startDate,
      today: today(),
      plannedDays: cur.plannedDays,
      rules: r,
      values: v,
    });
    const lines = [t('travel.dayN', { n: s.dayNumber })];
    const limit = limitText(r);
    if (s.planned && !s.planned.traveller) {
      lines.push(
        t('travel.plannedTooLong', { daysText: tn('tracker.days', s.planned.days), limit }),
      );
    } else if (s.approaching || s.pastLimit) {
      lines.push(t('travel.stayReminder', { daysText: tn('tracker.days', s.dayNumber), limit }));
    }
    return lines;
  }

  function todayCard(el) {
    const on = active();
    const cur = store.current();
    const v = ctx.values();
    const card = h('section', {
      class: ['card travel-card', on && 'is-on'],
      'aria-labelledby': 'travel-card-title',
    });
    const sw = h('input', {
      type: 'checkbox',
      role: 'switch',
      class: 'switch',
      id: 'travel-switch',
      checked: on,
      onchange: () => toggle(sw.checked),
    });
    card.append(
      h(
        'div',
        { class: 'set-row travel-switch-row' },
        h(
          'label',
          { class: 'set-row-text', for: 'travel-switch' },
          h(
            'span',
            { class: 'set-row-label', id: 'travel-card-title' },
            h('span', { 'aria-hidden': 'true', text: '✈ ' }),
            t('set.travel.enabled'),
          ),
          on && cur?.destination
            ? h('span', { class: 'set-row-help', text: placeName(cur.destination) })
            : null,
        ),
        sw,
      ),
    );
    if (on) {
      for (const line of stayLines()) card.append(h('p', { class: 'travel-line', text: line }));
      card.append(
        h('a', { class: 'btn btn-ghost btn-sm', href: '#travel', text: t('travel.details') }),
      );
    }
    el.append(card);

    // Suggestions (never automatic).
    const sug = suggestion();
    if (sug) el.append(suggestionBanner(sug, v));

    // Ask for a home location if auto-detect needs one.
    if (v['travel.autoDetect'] && !home() && !ctx.state.get('homePromptDismissed')) {
      el.append(homePrompt());
    }

    // A saved trip starting today.
    const trip = tripToOffer(store.get(), today());
    if (trip) el.append(ctx.hooks.tripOffer?.(trip) ?? null);
  }

  function suggestionBanner(sug, v) {
    const p = here();
    const at = p ? { lat: p.lat, lon: p.lon } : null;
    const box = h('section', { class: 'card travel-suggest', role: 'status' });
    const dist = fmtDistance(sug.km, v['travel.units']);
    if (sug.type === 'start') {
      add(
        box,
        h('p', { text: t('travel.suggestStart', { distance: dist }) }),
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn btn-primary',
            text: t('travel.turnOn'),
            onclick: () => {
              start({ destination: freshHere ?? null });
              if (freshHere) ctx.settings.setMany(locationPatch(freshHere, 'gps'));
              openStartSheet();
            },
          }),
          h('button', {
            type: 'button',
            class: 'btn btn-ghost',
            text: t('install.dismiss'),
            onclick: () => {
              store.dismissStart(at);
              ctx.refreshToday?.();
            },
          }),
        ),
      );
    } else {
      add(
        box,
        h('p', { text: t('travel.suggestEnd', { distance: dist }) }),
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn btn-primary',
            text: t('travel.turnOff'),
            onclick: () => end(),
          }),
          h('button', {
            type: 'button',
            class: 'btn btn-ghost',
            text: t('install.dismiss'),
            onclick: () => {
              store.dismissEnd(at);
              ctx.refreshToday?.();
            },
          }),
        ),
      );
    }
    return box;
  }

  function homePrompt() {
    return h(
      'section',
      { class: 'card' },
      h('p', { text: t('travel.setHomePrompt') }),
      homeButtons({
        extra: h('button', {
          type: 'button',
          class: 'btn btn-ghost',
          text: t('install.dismiss'),
          onclick: () => {
            ctx.state.set('homePromptDismissed', true);
            ctx.refreshToday?.();
          },
        }),
      }),
    );
  }

  /** Buttons to set the home location (current location, a city, or the prayer location). */
  function homeButtons({ extra = null } = {}) {
    const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    return h(
      'div',
      null,
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          type: 'button',
          class: 'btn btn-primary',
          text: t('travel.homeCurrent'),
          onclick: async () => {
            status.textContent = t('loc.locating');
            try {
              ctx.settings.setMany(homePatch(await gpsPlace()));
              status.textContent = '';
              toast(t('travel.homeSaved'));
            } catch (err) {
              // No GPS: fall back to the prayer location if there is one.
              const loc = ctx.location();
              if (loc) {
                ctx.settings.setMany(
                  homePatch({ ...loc, nameAr: ctx.values()['location.nameAr'] }),
                );
                status.textContent = t('travel.homeFromLocation');
              } else status.textContent = gpsErrorMessage(err);
            }
          },
        }),
        h('button', {
          type: 'button',
          class: 'btn',
          text: t('loc.city'),
          onclick: async () => {
            const picked = await pickPlace(ctx, {
              tabs: ['city', 'manual'],
              title: t('travel.home'),
            });
            if (picked) {
              ctx.settings.setMany(homePatch(picked.place));
              toast(t('travel.homeSaved'));
            }
          },
        }),
        extra,
      ),
      status,
    );
  }

  /** Header chip shown on every screen while travelling. */
  function badge() {
    if (!active()) return null;
    const cur = store.current();
    const day = cur
      ? stayStatus({
          startDate: cur.startDate,
          today: today(),
          plannedDays: null,
          rules: rules(),
          values: ctx.values(),
        }).dayNumber
      : null;
    return h(
      'a',
      {
        class: 'travel-badge',
        href: '#travel',
        'aria-label': t('travel.badgeAria', { n: day ?? 1 }),
      },
      h('span', { 'aria-hidden': 'true', text: '✈' }),
      h('span', { text: day ? t('travel.badge', { n: day }) : t('set.travel.enabled') }),
    );
  }

  return {
    active,
    home,
    here,
    rules,
    today,
    suggestion,
    observe,
    markTravelDays,
    start,
    end,
    toggle,
    openStartSheet,
    refreshPosition,
    stayLines,
    todayCard,
    homeButtons,
    badge,
  };
}
