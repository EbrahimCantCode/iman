// Location picker dialog: GPS, city search (bundled list) or manual coordinates.

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

/** Settings patch for a chosen location. */
export function locationPatch({ mode, lat, lon, city, name, tz }) {
  return {
    'location.mode': mode,
    'location.lat': Number(lat.toFixed(4)),
    'location.lon': Number(lon.toFixed(4)),
    'location.name': name ?? city?.name ?? '',
    'location.nameAr': name ? '' : (city?.ar ?? ''),
    'location.country': city?.cc ?? '',
    'location.tz': tz || city?.tz || deviceTimeZone(),
  };
}

/** Resolve a GPS fix into a settings patch (nearest city for name/country). */
export async function gpsPatch() {
  const pos = await getPosition();
  let city = null;
  try {
    city = nearestCity(pos.lat, pos.lon, await loadCities())?.city ?? null;
  } catch {
    /* city list unavailable: keep coordinates only */
  }
  // In GPS mode the device is physically there, so its own time zone is right.
  return locationPatch({ mode: 'gps', lat: pos.lat, lon: pos.lon, city, tz: deviceTimeZone() });
}

export function gpsErrorMessage(err) {
  return err?.code === 'denied' ? t('loc.denied') : t('loc.unavailable');
}

/**
 * Open the picker. Resolves once a location was saved or the dialog closed.
 * @param {object} ctx app context
 * @param {{tab?: 'gps'|'city'|'manual'}} opts
 */
export function openLocationPicker(ctx, { tab } = {}) {
  return new Promise((resolve) => {
    let saved = false;
    const panel = h('div', { class: 'loc-panel' });
    const tabs = ['gps', 'city', 'manual'];
    const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': t('loc.title') });
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
    seg.append(...buttons);
    panel.id = 'loc-panel';
    panel.setAttribute('role', 'tabpanel');

    const dlg = openDialog({
      title: t('loc.title'),
      content: [seg, panel],
      onClose: () => resolve(saved),
    });

    function save(patch) {
      ctx.settings.setMany(patch);
      saved = true;
      toast(t('loc.saved', { name: ctx.locationName(ctx.location()) }));
      dlg.close();
    }

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
            save(await gpsPatch());
          } catch (err) {
            status.textContent = gpsErrorMessage(err);
            btn.disabled = false;
          }
        },
      });
      panel.append(h('p', { text: t('loc.gpsWhy') }), btn, status);
    }

    function cityPanel() {
      const status = h('p', {
        class: 'hint',
        role: 'status',
        'aria-live': 'polite',
        text: t('loc.searchHint'),
      });
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
                {
                  type: 'button',
                  onclick: () =>
                    save(locationPatch({ mode: 'city', lat: c.lat, lon: c.lon, city: c })),
                },
                h('span', { text: lang === 'ar' && c.ar ? c.ar : c.name }),
                h('br'),
                h('small', { text: cityLabel(c, { lang, country: countryName }) }),
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
      const values = ctx.values();
      const lat = h('input', {
        id: 'loc-lat',
        class: 'input',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: values['location.lat'] ?? '',
        placeholder: '26.2235',
      });
      const lon = h('input', {
        id: 'loc-lon',
        class: 'input',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: values['location.lon'] ?? '',
        placeholder: '50.5876',
      });
      const name = h('input', {
        id: 'loc-name',
        class: 'input',
        maxlength: 120,
        value: values['location.mode'] === 'manual' ? values['location.name'] : '',
      });
      const zones = supportedZones();
      const tz = h(
        'select',
        { id: 'loc-tz', class: 'input' },
        zones.map((z) => h('option', { value: z, text: z.replaceAll('_', ' ') })),
      );
      tz.value = values['location.tz'] || deviceTimeZone();
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
          let city = null;
          try {
            city = nearestCity(la, lo, await loadCities())?.city ?? null;
          } catch {
            /* no city list: coordinates only */
          }
          const typed = name.value.trim();
          save(
            locationPatch({
              mode: 'manual',
              lat: la,
              lon: lo,
              city,
              name:
                typed ||
                `${fmtNum(la, { maximumFractionDigits: 4 })}, ${fmtNum(lo, { maximumFractionDigits: 4 })}`,
              tz: tz.value,
            }),
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

    const start =
      tab ??
      (ctx.values()['location.mode'] === 'manual'
        ? 'manual'
        : ctx.values()['location.mode'] === 'city'
          ? 'city'
          : 'gps');
    show(start);
  });
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
