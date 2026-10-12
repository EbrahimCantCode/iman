// Flight prayer times (#travel/flight): when each prayer begins during a
// flight, at the estimated position on the great-circle route, with times in
// both the departure and arrival time zones and the Qibla at each point.

import { h, clear, nextId, toast } from '../ui.js';
import { icon } from '../icons.js';
import { t, fmtTime, fmtDate, fmtNum, fmtDuration, countryName } from '../i18n/index.js';
import { flightPrayers } from '../flight.js';
import { loadAirports, searchAirports, nearestAirport } from '../airports.js';
import { zonedTimeToDate, ymd, toZonedInput, MINUTE } from '../time.js';
import { newTripId } from '../travel.js';
import { disclaimer } from './travel.js';
import { fmtDistance } from './travel-ui.js';

const MAX_HOURS = 22;
/** Farther than this from any airport counts as "over the sea or a remote area". */
const OVER_LAND_KM = 400;

const airportLabel = (a) => `${a.iata} · ${a.city || a.name}`;

/** Search box that picks one airport. */
function airportField(label, onPick, initial = null) {
  const id = nextId('ap');
  let airports = null;
  const chosen = h('p', { class: 'hint airport-chosen', role: 'status' });
  const list = h('ul', { class: 'city-list' });
  const input = h('input', {
    id,
    type: 'search',
    class: 'input',
    autocomplete: 'off',
    placeholder: t('flight.airportSearch'),
  });
  const show = (a) => {
    chosen.textContent = a ? `${a.iata} · ${a.name}${a.city ? ` (${a.city})` : ''}` : '';
  };
  const run = () => {
    clear(list);
    if (!airports) return;
    for (const a of searchAirports(input.value, airports, 8)) {
      list.append(
        h(
          'li',
          null,
          h(
            'button',
            {
              type: 'button',
              onclick: () => {
                onPick(a);
                show(a);
                input.value = '';
                clear(list);
              },
            },
            h('strong', { text: a.iata }),
            ` ${a.name}`,
            h('br'),
            h('small', { text: [a.city, countryName(a.cc)].filter(Boolean).join(', ') }),
          ),
        ),
      );
    }
  };
  input.addEventListener('input', run);
  loadAirports()
    .then((a) => {
      airports = a;
      if (input.value) run();
    })
    .catch(() => (chosen.textContent = t('flight.airportsError')));
  show(initial);
  return h('div', { class: 'field' }, h('label', { for: id, text: label }), input, chosen, list);
}

export function installFlight(ctx) {
  const store = ctx.travelStore;

  /** Where along the route an event happens: a country, or over the sea. */
  function overWhere(pos, airports) {
    const near = airports && nearestAirport(pos.lat, pos.lon, airports);
    if (!near || near.km > OVER_LAND_KM) return t('flight.overSea');
    return t('flight.over', { country: countryName(near.airport.cc) });
  }

  function renderResults(box, flight, airports) {
    clear(box);
    const v = ctx.values();
    const dep = new Date(flight.departure);
    const arr = new Date(flight.arrival);
    let result;
    try {
      result = flightPrayers({
        from: flight.from,
        to: flight.to,
        departure: dep,
        arrival: arr,
        values: v,
        methodCountry: flight.from.cc,
      });
    } catch {
      box.append(h('p', { class: 'hint', role: 'alert', text: t('flight.badTimes') }));
      return null;
    }
    const fromTz = flight.from.tz;
    const toTz = flight.to.tz;
    const both = (d) =>
      fromTz === toTz
        ? t('flight.timeOne', { time: fmtTime(d, fromTz) })
        : t('flight.timeBoth', {
            dep: fmtTime(d, fromTz),
            depCode: flight.from.iata,
            arr: fmtTime(d, toTz),
            arrCode: flight.to.iata,
          });

    box.append(
      h('h2', { text: `${flight.from.iata} → ${flight.to.iata}` }),
      h('p', {
        class: 'hint',
        text: t('flight.summary', {
          distance: fmtDistance(result.distanceKm, v['travel.units']),
          duration: fmtDuration(arr - dep),
          date: fmtDate(dep, fromTz, { weekday: 'short', day: 'numeric', month: 'short' }),
        }),
      }),
    );
    if (result.atDeparture) {
      box.append(
        h('p', {
          class: 'travel-line',
          text: t('flight.atDeparture', { prayer: t(`prayer.${result.atDeparture}`) }),
        }),
      );
    }

    if (!result.events.length) {
      box.append(h('p', { class: 'travel-line', text: t('flight.none') }));
    } else {
      const list = h('ol', { class: 'flight-timeline' });
      for (const e of result.events) {
        const isSunrise = e.prayer === 'sunrise';
        list.append(
          h(
            'li',
            { class: ['flight-event', isSunrise && 'is-minor'] },
            h('strong', { text: isSunrise ? t('flight.fajrEnds') : t(`prayer.${e.prayer}`) }),
            h('span', { class: 'num', text: ` ≈ ${both(e.time)}` }),
            h('br'),
            h('span', {
              class: 'hint',
              text: t('flight.where', {
                where: overWhere(e.position, airports),
                after: fmtDuration(e.minutesAfterDeparture * MINUTE),
              }),
            }),
            isSunrise
              ? null
              : h(
                  'span',
                  { class: 'hint flight-qibla' },
                  icon('qibla', { size: 16 }),
                  ` ${t('flight.qibla', { deg: fmtNum(Math.round(e.qibla)) })}`,
                ),
          ),
        );
      }
      box.append(list);
    }
    for (const n of result.nearMisses) {
      box.append(
        h('p', {
          class: 'hint',
          text: t('flight.nearMiss', {
            prayer: t(`prayer.${n.prayer}`),
            minutes: fmtNum(n.minutes),
          }),
        }),
      );
    }

    // Guidance from js/config/travel-rules.js (not invented here).
    const r = ctx.travel.rules();
    const guidance = h('ul', { class: 'travel-rules' });
    if (r.flight.seatedIfCannotStand) guidance.append(h('li', { text: t('flight.guideSeated') }));
    if (r.flight.combineIfAllowed && r.combining.length)
      guidance.append(h('li', { text: t('flight.guideCombine') }));
    guidance.append(h('li', { text: t('flight.guideQibla') }));
    box.append(h('h3', { class: 'set-group-title', text: t('flight.guidance') }), guidance);

    box.append(
      h(
        'details',
        { class: 'travel-sources' },
        h('summary', { text: t('flight.howTitle') }),
        h(
          'ul',
          null,
          ['flight.howRoute', 'flight.howAltitude', 'flight.howPolar', 'flight.howCompare'].map(
            (k) => h('li', { text: t(k) }),
          ),
        ),
      ),
    );
    return result;
  }

  ctx.hooks.travelSubviews.flight = (el, [savedId]) => {
    el.append(h('h1', { class: 'view-title', text: t('flight.title') }), disclaimer());
    const saved = savedId ? store.get().flights.find((f) => f.id === savedId) : null;
    let from = saved?.from ?? null;
    let to = saved?.to ?? null;
    let mode = 'duration';
    const results = h('section', { class: 'card flight-results', 'aria-live': 'polite' });
    results.hidden = true;
    let airportsCache = null;
    loadAirports()
      .then((a) => (airportsCache = a))
      .catch(() => {});

    const n = ctx.now();
    const depDate = h('input', {
      id: nextId('fd'),
      type: 'date',
      class: 'input',
      value: ymd(n, from?.tz),
    });
    const depTime = h('input', { id: nextId('ft'), type: 'time', class: 'input', value: '14:00' });
    const hours = h('input', {
      id: nextId('fh'),
      type: 'number',
      class: 'input',
      min: 0,
      max: MAX_HOURS,
      value: 7,
      inputmode: 'numeric',
    });
    const mins = h('input', {
      id: nextId('fm'),
      type: 'number',
      class: 'input',
      min: 0,
      max: 59,
      value: 0,
      inputmode: 'numeric',
    });
    const arrDate = h('input', {
      id: nextId('ad'),
      type: 'date',
      class: 'input',
      value: ymd(n, to?.tz),
    });
    const arrTime = h('input', { id: nextId('at'), type: 'time', class: 'input', value: '19:30' });
    if (saved) {
      const d = new Date(saved.departure);
      const local = toZonedInput(d, saved.from.tz);
      depDate.value = local.slice(0, 10);
      depTime.value = local.slice(11, 16);
      const total = Math.round((new Date(saved.arrival) - d) / MINUTE);
      hours.value = Math.floor(total / 60);
      mins.value = total % 60;
    }
    const error = h('p', { class: 'hint', role: 'alert' });
    const durationBox = h(
      'div',
      { class: 'flight-pair' },
      h('div', { class: 'field' }, h('label', { for: hours.id, text: t('flight.hours') }), hours),
      h('div', { class: 'field' }, h('label', { for: mins.id, text: t('flight.minutes') }), mins),
    );
    const arrivalBox = h(
      'div',
      { class: 'flight-pair', hidden: true },
      h(
        'div',
        { class: 'field' },
        h('label', { for: arrDate.id, text: t('flight.arrDate') }),
        arrDate,
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: arrTime.id, text: t('flight.arrTime') }),
        arrTime,
      ),
    );
    const modeButtons = ['duration', 'arrival'].map((m) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(m === mode),
        text: t(`flight.mode.${m}`),
        onclick: () => {
          mode = m;
          for (const b of modeButtons)
            b.setAttribute('aria-pressed', String(b === modeButtons[m === 'duration' ? 0 : 1]));
          durationBox.hidden = m !== 'duration';
          arrivalBox.hidden = m !== 'arrival';
        },
      }),
    );

    let current = saved;
    const calculate = () => {
      error.textContent = '';
      if (!from || !to) {
        error.textContent = t('flight.needAirports');
        return;
      }
      const departure = zonedTimeToDate(`${depDate.value}T${depTime.value}`, from.tz);
      let arrival;
      if (mode === 'duration') {
        const total = (Number(hours.value) || 0) * 60 + (Number(mins.value) || 0);
        arrival = departure && new Date(departure.getTime() + total * MINUTE);
      } else {
        arrival = zonedTimeToDate(`${arrDate.value}T${arrTime.value}`, to.tz);
      }
      if (
        !departure ||
        !arrival ||
        arrival <= departure ||
        arrival - departure > MAX_HOURS * 60 * MINUTE
      ) {
        error.textContent = t('flight.badTimes');
        return;
      }
      current = {
        id: current?.id ?? newTripId(),
        from,
        to,
        departure: departure.toISOString(),
        arrival: arrival.toISOString(),
        remind: current?.remind ?? false,
      };
      results.hidden = false;
      const result = renderResults(results, current, airportsCache);
      if (!result) return;
      current.events = result.events
        .filter((e) => e.prayer !== 'sunrise')
        .map((e) => ({
          prayer: e.prayer,
          time: e.time.toISOString(),
          lat: e.position.lat,
          lon: e.position.lon,
        }));
      results.append(remindBlock());
      results.scrollIntoView({ block: 'start' });
    };

    const remindBlock = () => {
      const box = h('div', { class: 'btn-row' });
      const on = store.get().flights.some((f) => f.id === current.id && f.remind);
      box.append(
        h('button', {
          type: 'button',
          class: ['btn', !on && 'btn-primary'],
          text: on ? t('flight.remindOff') : t('flight.remindOn'),
          onclick: () => {
            current = { ...current, remind: !on };
            if (current.remind) store.saveFlight(current);
            else store.deleteFlight(current.id);
            toast(current.remind ? t('flight.remindSaved') : t('flight.remindRemoved'));
            box.replaceWith(remindBlock());
          },
        }),
      );
      return h('div', null, box, h('p', { class: 'hint', text: t('flight.remindNote') }));
    };

    el.append(
      h(
        'section',
        { class: 'card' },
        h('p', { class: 'hint', text: t('flight.intro') }),
        airportField(
          t('flight.from'),
          (a) => {
            from = a;
            depDate.value = ymd(ctx.now(), a.tz);
          },
          from,
        ),
        airportField(t('flight.to'), (a) => (to = a), to),
        h(
          'div',
          { class: 'flight-pair' },
          h(
            'div',
            { class: 'field' },
            h('label', { for: depDate.id, text: t('flight.depDate') }),
            depDate,
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: depTime.id, text: t('flight.depTime') }),
            depTime,
          ),
        ),
        h('div', { class: 'seg', role: 'group', 'aria-label': t('flight.modeLabel') }, modeButtons),
        durationBox,
        arrivalBox,
        error,
        h(
          'button',
          { type: 'button', class: 'btn btn-primary btn-block', onclick: calculate },
          icon('alarm'),
          t('flight.calculate'),
        ),
      ),
      results,
    );

    // Saved flights (with reminders).
    const flights = store.get().flights.filter((f) => f.from && f.to);
    if (flights.length) {
      el.append(
        h(
          'section',
          { class: 'card' },
          h('h2', { text: t('flight.saved') }),
          h(
            'ul',
            { class: 'trip-list' },
            flights.map((f) =>
              h(
                'li',
                { class: 'card-row' },
                h(
                  'a',
                  { class: 'trip-link grow', href: `#travel/flight/${f.id}` },
                  h('strong', { text: `${airportLabel(f.from)} → ${airportLabel(f.to)}` }),
                  h('span', {
                    class: 'hint',
                    text: fmtDate(new Date(f.departure), f.from.tz, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    }),
                  }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn',
                    'aria-label': t('flight.delete', { route: `${f.from.iata} → ${f.to.iata}` }),
                    onclick: () => store.deleteFlight(f.id),
                  },
                  icon('trash'),
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (saved) calculate();
  };

  ctx.hooks.travelSubviews.flight.keepOnStoreChange = true;

  // Reminders for saved flights (only while the app is open, like all reminders).
  ctx.hooks.moreAlerts = ctx.hooks.moreAlerts ?? [];
  ctx.hooks.moreAlerts.push(() => {
    const now = ctx.now();
    return store
      .get()
      .flights.filter((f) => f.remind && Array.isArray(f.events))
      .flatMap((f) =>
        f.events.map((e, i) => {
          const time = new Date(e.time);
          return {
            // Ids start with the date so old ones are pruned like other alerts.
            id: `${ymd(time, f.to.tz)}:flight:${f.id}:${e.prayer}:${i}`,
            kind: 'flight',
            prayer: e.prayer,
            day: ymd(time, f.to.tz),
            time,
            target: time,
            sound: 'chime',
            quiet: false,
            onlyIf: null,
            title: t('flight.alertTitle', { prayer: t(`prayer.${e.prayer}`) }),
            body: t('flight.alertBody', { route: `${f.from.iata} → ${f.to.iata}` }),
          };
        }),
      )
      .filter((a) => a.time > now - 3 * MINUTE);
  });

  // Entry point on the Travel screen.
  ctx.hooks.travelSections.push((el) => {
    el.append(
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'flight-entry' },
        h('h2', { id: 'flight-entry', text: t('flight.title') }),
        h('p', { class: 'hint', text: t('flight.entry') }),
        h(
          'a',
          { class: 'btn btn-primary', href: '#travel/flight' },
          icon('alarm'),
          t('flight.open'),
        ),
      ),
    );
  });
}
