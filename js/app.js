// Iman bootstrap: settings, language, appearance, tab routing and the 1 s tick.

import { initClock, now, isDebugTime } from './clock.js';
import { getStorage } from './storage.js';
import { createSettingsStore } from './settings.js';
import { createTracker } from './tracker.js';
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
import { createTrackerView, createStatusButton, todaySunnahCard } from './views/tracker.js';
import { openLocationPicker } from './views/location-picker.js';
import { createQiblaView } from './views/qibla.js';
import { createNotifier, notificationSupport } from './notify.js';
import { remindersWidget } from './views/reminders-widget.js';
import { setupAudioUnlock } from './audio.js';
import { idbClose } from './idb.js';
import { createFocusLock, focusWidget } from './focus.js';
import { createWidgets } from './views/widgets.js';
import { runOnboarding, shouldOnboard } from './views/onboarding.js';
import { gpsPatch } from './views/location-picker.js';

const TABS = ['today', 'qibla', 'tracker', 'settings'];

initClock();
const storage = getStorage();
const settings = createSettingsStore({ storage });
const state = createState({ storage });
const tracker = createTracker({ storage });

let values = settings.all();
let revision = 0;
let scheduleCache = { key: '', value: null };
const tickers = new Set();

/** Feature hooks filled in by feature modules (tracker, notifications, ...). */
const hooks = { todayExtras: [], sectionWidgets: {}, tickers: [] };

const ctx = {
  settings,
  tracker,
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

// Tracker
hooks.statusButton = (prayer, day, time) => createStatusButton(ctx, prayer, day, time);
hooks.todayExtras.push((el) => {
  const card = todaySunnahCard(ctx);
  if (card) el.append(card);
});
hooks.trackerExport = () => tracker.exportData();
hooks.trackerImport = (text) => tracker.importData(text);

// Notifications and reminders
const notifier = createNotifier(ctx);
ctx.notifier = notifier;
ctx.addTicker((n) => notifier.tick(n));
hooks.enableNotifications = () => notifier.enable();
hooks.sectionWidgets.reminders = () => remindersWidget(ctx, notifier);
hooks.notifyNote = () =>
  notificationSupport() === 'ios-install'
    ? h('p', { class: 'hint', text: t('notify.iosInstall') })
    : null;
hooks.deleteFiles = () => idbClose();

// Prayer focus lock
const focusLock = createFocusLock(ctx);
ctx.addTicker((n) => focusLock.tick(n));
hooks.sectionWidgets.focus = () => focusWidget(ctx, focusLock);
hooks.placeholder = (def) => (def.key === 'focus.message' ? t('focus.defaultMessage') : '');

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
ctx.markDirty = (name) => dirty.add(name);

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
  // Recalculate when the app regains focus. The schedule cache is keyed by the
  // location's calendar day, so a new day (or a midnight passed while the app
  // was asleep) is picked up here without re-rendering otherwise.
  if (document.visibilityState === 'visible') tick();
});

// ------------------------------------------------------------ boot

async function boot() {
  setupAudioUnlock();
  applyAppearance();
  await applyLanguage();

  clear(main);
  main.append(bannerSlot, viewSlot);

  const widgets = createWidgets(ctx);
  ctx.views.today = createTodayView(ctx);
  ctx.views.settings = createSettingsView(ctx, widgets);
  ctx.views.qibla = createQiblaView(ctx);
  ctx.views.tracker = createTrackerView(ctx);

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

boot().catch((err) => {
  console.error(err);
  main.textContent = t('common.error');
});

export { ctx };
