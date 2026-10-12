// Place picker dialog: GPS, city search (bundled list) or manual coordinates.
// pickPlace() returns a place without saving it, so the same dialog picks
// the prayer location, the home location and trip destinations.

import { h, clear, openDialog, toast } from '../ui.js';
import { t, currentLanguage, countryName, fmtNum } from '../i18n/index.js';
import {
  getPosition,
  loadCities,
  searchCities,
  nearestCity,
  cityLabel,
  parseCoordinate,
  validCoords,
} from '../location.js';
import { deviceTimeZone } from '../time.js';

/**
 * A place: { lat, lon, name, nameAr, country, tz }.
 * `tz` is the place's own IANA time zone, never just the device's: when you
 * travel, the phone may not have switched zones yet.
 */
export function placeFromCity(city, overrides = {}) {
  return {
    lat: Number(city.lat.toFixed(4)),
    lon: Number(city.lon.toFixed(4)),
    name: city.name,
    nameAr: city.ar ?? '',
    country: city.cc ?? '',
    tz: city.tz || deviceTimeZone(),
    ...overrides,
  };
}

/** Nearest bundled city closer than this is trusted for name, country and time zone. */
export const NEAR_CITY_KM = 300;

/** A place for coordinates, named and zoned after the nearest city when it is close. */
export async function placeForCoords(lat, lon, { name, tz } = {}) {
  let near = null;
  try {
    near = nearestCity(lat, lon, await loadCities());
  } catch {
    /* city list unavailable: coordinates only */
  }
  const city = near && near.km <= NEAR_CITY_KM ? near.city : null;
  return {
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
    name: name ?? city?.name ?? '',
    nameAr: name ? '' : (city?.ar ?? ''),
    country: city?.cc ?? '',
    tz: tz || city?.tz || deviceTimeZone(),
  };
}

/** The device's current position as a place. */
export async function gpsPlace() {
  const pos = await getPosition();
  return placeForCoords(pos.lat, pos.lon);
}

/** Settings patch for the prayer location. */
export function locationPatch(place, mode) {
  return {
    'location.mode': mode,
    'location.lat': place.lat,
    'location.lon': place.lon,
    'location.name': place.name,
    'location.nameAr': place.nameAr,
    'location.country': place.country,
    'location.tz': place.tz,
  };
}

/** Settings patch for the home location (travel mode). */
export function homePatch(place) {
  return {
    'home.lat': place.lat,
    'home.lon': place.lon,
    'home.name': place.name,
    'home.nameAr': place.nameAr,
    'home.country': place.country,
    'home.tz': place.tz,
  };
}

/** Resolve a GPS fix into a location settings patch. */
export async function gpsPatch() {
  return locationPatch(await gpsPlace(), 'gps');
}

export function gpsErrorMessage(err) {
  return err?.code === 'denied' ? t('loc.denied') : t('loc.unavailable');
}

/**
 * Let the user pick a place. Resolves to { place, mode } or null if closed.
 * @param {object} ctx app context
 * @param {{tab?: 'gps'|'city'|'manual', tabs?: string[], title?: string, initial?: object}} opts
 */
export function pickPlace(ctx, { tab, tabs = ['gps', 'city', 'manual'], title, initial } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const panel = h('div', { class: 'loc-panel', id: 'loc-panel', role: 'tabpanel' });
    const buttons = tabs.map((name) =>
      h('button', {
        type: 'button',
        role: 'tab',
        id: `loc-tab-${name}`,
        'aria-controls': 'loc-panel',
        text: t(`loc.mode.${name}`),
        onclick: () => show(name),
      }),
    );
    const seg = h(
      'div',
      { class: 'seg', role: 'tablist', 'aria-label': title ?? t('loc.title') },
      buttons,
    );

    const dlg = openDialog({
      title: title ?? t('loc.title'),
      content: [tabs.length > 1 ? seg : null, panel],
      onClose: () => resolve(result),
    });

    const done = (place, mode) => {
      result = { place, mode };
      dlg.close();
    };

    function show(name) {
      for (const b of buttons) b.setAttribute('aria-selected', String(b.id === `loc-tab-${name}`));
      panel.setAttribute('aria-labelledby', `loc-tab-${name}`);
      clear(panel);
      ({ gps: gpsPanel, city: cityPanel, manual: manualPanel })[name]();
    }

    function gpsPanel() {
      const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
      const btn = h('button', {
        type: 'button',
        class: 'btn btn-primary btn-block',
        text: t('loc.gps'),
        onclick: async () => {
          btn.disabled = true;
          status.textContent = t('loc.locating');
          try {
            done(await gpsPlace(), 'gps');
          } catch (err) {
            status.textContent = gpsErrorMessage(err);
            btn.disabled = false;
          }
        },
      });
      panel.append(h('p', { text: t('loc.gpsWhy') }), btn, status);
    }

    function cityPanel() {
      const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
      const list = h('ul', { class: 'city-list' });
      const input = h('input', {
        type: 'search',
        class: 'input',
        placeholder: t('loc.search'),
        'aria-label': t('loc.search'),
        autocomplete: 'off',
        enterkeyhint: 'search',
      });
      let cities = null;
      let timer;
      const lang = currentLanguage();
      const run = () => {
        clear(list);
        if (!cities) return;
        const results = searchCities(input.value, cities);
        if (input.value.trim().length < 2) status.textContent = t('loc.searchHint');
        else status.textContent = results.length ? '' : t('loc.noCities');
        for (const c of results) {
          list.append(
            h(
              'li',
              null,
              h(
                'button',
                { type: 'button', onclick: () => done(placeFromCity(c), 'city') },
                h('span', { text: lang === 'ar' && c.ar ? c.ar : c.name }),
                h('br'),
                h('small', { text: cityLabel(c, { lang, country: countryName, withName: false }) }),
              ),
            ),
          );
        }
      };
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(run, 120);
      });
      panel.append(input, status, list);
      input.focus();
      status.textContent = t('loc.loadingCities');
      loadCities()
        .then((c) => {
          cities = c;
          status.textContent = t('loc.searchHint');
          if (input.value) run();
        })
        .catch(() => (status.textContent = t('loc.citiesError')));
    }

    function manualPanel() {
      const lat = h('input', {
        id: 'loc-lat',
        class: 'input',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: initial?.lat ?? '',
        placeholder: '26.2235',
      });
      const lon = h('input', {
        id: 'loc-lon',
        class: 'input',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: initial?.lon ?? '',
        placeholder: '50.5876',
      });
      const name = h('input', {
        id: 'loc-name',
        class: 'input',
        maxlength: 120,
        value: initial?.manualName ?? '',
      });
      const zones = supportedZones();
      const tz = h(
        'select',
        { id: 'loc-tz', class: 'input' },
        zones.map((z) => h('option', { value: z, text: z.replaceAll('_', ' ') })),
      );
      tz.value = initial?.tz || deviceTimeZone();
      const error = h('p', { class: 'hint', role: 'alert' });

      // Suggest the time zone of the nearest city once coordinates are typed.
      const suggestTz = async () => {
        const la = parseCoordinate(lat.value);
        const lo = parseCoordinate(lon.value);
        if (!validCoords(la, lo)) return;
        try {
          const near = nearestCity(la, lo, await loadCities());
          if (near && zones.includes(near.city.tz)) tz.value = near.city.tz;
        } catch {
          /* keep current */
        }
      };
      lat.addEventListener('change', suggestTz);
      lon.addEventListener('change', suggestTz);

      const submit = h('button', {
        type: 'button',
        class: 'btn btn-primary btn-block',
        text: t('loc.useThis'),
        onclick: async () => {
          const la = parseCoordinate(lat.value);
          const lo = parseCoordinate(lon.value);
          if (!validCoords(la, lo)) {
            error.textContent = t('loc.invalid');
            return;
          }
          const typed = name.value.trim();
          const fmt = (n) => fmtNum(n, { maximumFractionDigits: 4 });
          done(
            await placeForCoords(la, lo, {
              name: typed || `${fmt(la)}, ${fmt(lo)}`,
              tz: tz.value,
            }),
            'manual',
          );
        },
      });
      panel.append(
        h('div', { class: 'field' }, h('label', { for: 'loc-lat', text: t('loc.lat') }), lat),
        h('div', { class: 'field' }, h('label', { for: 'loc-lon', text: t('loc.lon') }), lon),
        h('div', { class: 'field' }, h('label', { for: 'loc-name', text: t('loc.name') }), name),
        h('div', { class: 'field' }, h('label', { for: 'loc-tz', text: t('loc.tz') }), tz),
        h('p', { class: 'hint', text: t('loc.mapHint') }),
        error,
        submit,
      );
    }

    show(tab && tabs.includes(tab) ? tab : tabs[0]);
  });
}

/** Pick and save the prayer location. Resolves to true if one was saved. */
export async function openLocationPicker(ctx, { tab } = {}) {
  const v = ctx.values();
  const mode = v['location.mode'];
  const picked = await pickPlace(ctx, {
    tab: tab ?? (mode === 'manual' || mode === 'city' ? mode : 'gps'),
    initial: {
      lat: v['location.lat'],
      lon: v['location.lon'],
      tz: v['location.tz'],
      manualName: mode === 'manual' ? v['location.name'] : '',
    },
  });
  if (!picked) return false;
  ctx.settings.setMany(locationPatch(picked.place, picked.mode));
  toast(t('loc.saved', { name: ctx.locationName(ctx.location()) }));
  return true;
}

function supportedZones() {
  try {
    const zones = Intl.supportedValuesOf('timeZone');
    const dev = deviceTimeZone();
    return dev && !zones.includes(dev) ? [dev, ...zones] : zones;
  } catch {
    return [deviceTimeZone() || 'UTC'];
  }
}
