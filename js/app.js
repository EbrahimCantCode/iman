// Iman bootstrap: settings, language, appearance, tab routing and the 1 s tick.

import { initClock, now, isDebugTime } from './clock.js';
import { getStorage } from './storage.js';
import { createSettingsStore } from './settings.js';
import { createState } from './state.js';
import {
  setLanguage,
  resolveLanguage,
  t,
  dir,
  currentLanguage,
  fmtNum,
  fmtTime,
  fmtDate,
} from './i18n/index.js';
import { locationFromSettings } from './location.js';
import { getSchedule } from './prayer.js';
import { ymd } from './time.js';
import { h, clear } from './ui.js';
import { icon } from './icons.js';
import { createTodayView } from './views/today.js';
import { createSettingsView } from './views/settings.js';
import { openLocationPicker } from './views/location-picker.js';
import { createWidgets } from './views/widgets.js';
import { runOnboarding, shouldOnboard } from './views/onboarding.js';
import { gpsPatch } from './views/location-picker.js';

const TABS = ['today', 'qibla', 'tracker', 'settings'];

initClock();
const storage = getStorage();
const settings = createSettingsStore({ storage });
const state = createState({ storage });

let values = settings.all();
let revision = 0;
let scheduleCache = { key: '', value: null };
const tickers = new Set();

/** Feature hooks filled in by feature modules (tracker, notifications, ...). */
const hooks = {};

const ctx = {
  settings,
  state,
  storage,
  hooks,
  now,
  values: () => values,
  location: () => locationFromSettings(values),
  locationName,
  schedule,
  navigate: (route) => (location.hash = route),
  openLocationPicker: (opts) => openLocationPicker(ctx, opts),
  isDev: () => values['advanced.devMode'],
  /** Subscribe to settings while `el` stays in the document. */
  onSettings(el, fn) {
    // Elements are often built before they are attached, so only unsubscribe
    // once the element has been in the document and was then removed.
    let seen = false;
    const off = settings.subscribe((keys, v) => {
      if (el.isConnected) {
        seen = true;
        fn(keys, v);
      } else if (seen) off();
    });
    requestAnimationFrame(() => (seen ||= el.isConnected));
    return off;
  },
  addTicker: (fn) => tickers.add(fn),
  views: {},
  /** App-wide events: 'settings' (detail = changed keys) and 'language'. */
  bus: new EventTarget(),
};

hooks.runOnboarding = () => runOnboarding(ctx);

function locationName(loc) {
  if (!loc) return t('loc.none');
  const name =
    currentLanguage() === 'ar' && values['location.nameAr'] ? values['location.nameAr'] : loc.name;
  if (name) return name;
  const f = (n) => fmtNum(n, { maximumFractionDigits: 3 });
  return `${f(loc.lat)}, ${f(loc.lon)}`;
}

function schedule() {
  const loc = ctx.location();
  if (!loc) return null;
  const n = now();
  const key = `${ymd(n, loc.tz)}|${revision}|${loc.lat}|${loc.lon}`;
  if (scheduleCache.key !== key) scheduleCache = { key, value: getSchedule(n, loc, values) };
  return scheduleCache.value;
}

// ------------------------------------------------------------ appearance & language

function applyAppearance() {
  const root = document.documentElement;
  const theme = values['appearance.theme'];
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  const accent = values['appearance.accent'];
  if (accent === 'gold') root.removeAttribute('data-accent');
  else root.dataset.accent = accent;
  const font = values['appearance.fontSize'];
  if (font === 'normal') root.removeAttribute('data-font');
  else root.dataset.font = font;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#061617';
}

async function applyLanguage() {
  const code = resolveLanguage(values['appearance.language']);
  await setLanguage(code, {
    numerals: values['appearance.numerals'],
    timeFormat: values['prayer.timeFormat'],
  });
  document.documentElement.lang = code;
  document.documentElement.dir = dir();
  const skip = document.getElementById('skip-link');
  if (skip) skip.textContent = t('common.skipToContent');
  document.getElementById('tabbar')?.setAttribute('aria-label', t('nav.main'));
}

// ------------------------------------------------------------ shell & routing

const main = document.getElementById('main');
const tabbar = document.getElementById('tabbar');
const bannerSlot = h('div', { id: 'banner-slot' });
const viewSlot = h('div', { id: 'view' });
let active = null;
const dirty = new Set();

function renderTabbar() {
  clear(tabbar);
  for (const name of TABS) {
    tabbar.append(
      h(
        'a',
        { class: 'tab', href: `#${name}`, 'aria-current': name === active ? 'page' : null },
        icon(name),
        h('span', { text: t(`tab.${name}`) }),
      ),
    );
  }
}

function parseRoute() {
  const [name = '', sub = ''] = location.hash.replace(/^#/, '').split('/');
  return { name, sub };
}

function show(name, sub) {
  const view = ctx.views[name];
  if (!view) return;
  const switching = active !== name;
  if (switching) {
    ctx.views[active]?.onHide?.();
    active = name;
    viewSlot.replaceChildren(view.el);
    window.scrollTo(0, 0);
  }
  if (switching && (dirty.has(name) || !view.rendered)) {
    view.render();
    view.rendered = true;
    dirty.delete(name);
  }
  view.onShow?.(sub);
  view.update?.(now());
  document.title = `${view.title()} · ${t('app.name')}`;
  renderTabbar();
}

function onRoute() {
  const { name, sub } = parseRoute();
  if (ctx.views[name]) show(name, sub);
  else if (!active) show(values['appearance.startScreen'], '');
}

function rerenderAll() {
  for (const [name, view] of Object.entries(ctx.views)) {
    if (name === active) {
      view.render();
      view.rendered = true;
      view.update?.(now());
    } else dirty.add(name);
  }
  renderTabbar();
  renderBanner();
}

function renderBanner() {
  clear(bannerSlot);
  if (isDebugTime()) {
    const loc = ctx.location();
    const n = now();
    bannerSlot.append(
      h('p', {
        class: 'banner',
        role: 'note',
        text: t('today.debug', {
          time: `${fmtDate(n, loc?.tz, { day: 'numeric', month: 'short' })} ${fmtTime(n, loc?.tz)}`,
        }),
      }),
    );
  }
}

settings.subscribe(async (keys) => {
  values = settings.all();
  revision += 1;
  if (keys.some((k) => k.startsWith('appearance.'))) applyAppearance();
  if (
    keys.some((k) =>
      ['appearance.language', 'appearance.numerals', 'prayer.timeFormat'].includes(k),
    )
  ) {
    await applyLanguage();
    rerenderAll();
    ctx.bus.dispatchEvent(new CustomEvent('settings', { detail: keys }));
    ctx.bus.dispatchEvent(new Event('language'));
    return;
  }
  for (const [name, view] of Object.entries(ctx.views)) {
    if (name === active) {
      if (!view.keepOnChange) {
        view.render();
        view.update?.(now());
      }
    } else dirty.add(name);
  }
  ctx.bus.dispatchEvent(new CustomEvent('settings', { detail: keys }));
});

// ------------------------------------------------------------ tick

let tickTimer;
function tick() {
  const n = now();
  try {
    ctx.views[active]?.update?.(n);
    for (const fn of tickers) fn(n);
  } catch (err) {
    console.error(err);
  }
  clearTimeout(tickTimer);
  tickTimer = setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Recalculate when the app regains focus (time zone or date may have changed).
    revision += 1;
    tick();
  }
});

// ------------------------------------------------------------ boot

async function boot() {
  applyAppearance();
  await applyLanguage();

  clear(main);
  main.append(bannerSlot, viewSlot);

  const widgets = createWidgets(ctx);
  ctx.views.today = createTodayView(ctx);
  ctx.views.settings = createSettingsView(ctx, widgets);
  ctx.views.qibla = placeholderView('qibla');
  ctx.views.tracker = placeholderView('tracker');

  document.getElementById('skip-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    main.focus();
  });

  window.addEventListener('hashchange', onRoute);
  renderBanner();
  if (!parseRoute().name) history.replaceState(null, '', `#${values['appearance.startScreen']}`);
  onRoute();
  tick();

  if (shouldOnboard(ctx)) runOnboarding(ctx);
  else refreshGpsLocation();
}

/** "Refresh location when the app opens" (GPS mode only, silent on failure). */
async function refreshGpsLocation() {
  if (values['location.mode'] !== 'gps' || !values['location.autoRefresh']) return;
  try {
    settings.setMany(await gpsPatch());
  } catch {
    /* keep the cached location */
  }
}

function placeholderView(name) {
  const el = h('section', { class: 'view' });
  return {
    el,
    render: () => el.replaceChildren(h('h1', { class: 'view-title', text: t(`tab.${name}`) })),
    title: () => t(`tab.${name}`),
  };
}

boot().catch((err) => {
  console.error(err);
  main.textContent = t('common.error');
});

export { ctx };
