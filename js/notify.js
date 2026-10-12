// Notifications and reminders while Iman is open (foreground or background
// tab). Alerts are shown through the service worker registration so they
// work on Android and iOS Home Screen apps.
//
// Closed-app alerts are NOT guaranteed for a web app. Where the browser
// supports them we additionally use Notification Triggers (scheduled
// notifications) and Periodic Background Sync, both feature-detected.

import { buildAlerts, dueAlerts, passesCondition } from './reminders.js';
import { playSound, isPlaying, stopSound } from './audio.js';
import { idbSet } from './idb.js';
import { t, fmtTime, fmtDuration } from './i18n/index.js';
import { toast, isIOS, isStandalone } from './ui.js';
import { addDays, ymd, DAY, HOUR } from './time.js';

const ICON = 'assets/icons/icon-192.png';
const BADGE = 'assets/icons/badge-96.png';

/** "granted" | "denied" | "default" | "unsupported" | "ios-install" */
export function notificationSupport() {
  if (!('Notification' in globalThis)) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  return Notification.permission;
}

export const supportsTriggers = () =>
  typeof globalThis.TimestampTrigger === 'function' &&
  'showTrigger' in (globalThis.Notification?.prototype ?? {});

/** Title and body for an alert, in the current language. */
export function renderAlert(alert, ctx) {
  const tz = ctx.location()?.tz;
  const prayer = t(`prayer.${alert.prayer}`);
  const mins = fmtDuration(alert.target - alert.time);
  const time = fmtTime(alert.target, tz);
  switch (alert.kind) {
    case 'at':
      return {
        title: t('notify.at.title', { prayer }),
        body: t('notify.at.body', { time, place: ctx.locationName(ctx.location()) }),
      };
    case 'before':
      return {
        title: t('notify.before.title', { prayer, duration: mins }),
        body: t('notify.before.body', { time }),
      };
    case 'windowEnd':
      return {
        title: t('notify.windowEnd.title', { prayer, duration: mins }),
        body: t('notify.windowEnd.body', { time }),
      };
    case 'sunrise':
      return {
        title: t('notify.sunrise.title', { duration: mins }),
        body: t('notify.sunrise.body'),
      };
    case 'jumuah':
      return {
        title: t('notify.jumuah.title', { duration: mins }),
        body: t('notify.jumuah.body', { time }),
      };
    case 'fill':
      return { title: t('notify.fill.title'), body: t('notify.fill.body') };
    case 'combined':
      return {
        title: t('notify.combined.title', { pair: `${prayer} + ${t(`prayer.${alert.partner}`)}` }),
        body: t(`notify.combined.body.${alert.combineType}`, { time }),
      };
    case 'stay':
    case 'flight':
      return { title: alert.title, body: alert.body };
    default:
      return { title: t('app.name'), body: '' };
  }
}

/** Show a notification via the service worker (falls back to `new Notification`). */
export async function showNotification(title, options = {}) {
  const opts = {
    icon: ICON,
    badge: BADGE,
    lang: document.documentElement.lang,
    dir: 'auto',
    ...options,
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { data: { url: './#today' }, ...opts });
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      globalThis.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function createNotifier(ctx) {
  let cacheKey = null;
  let alerts = [];
  const fired = new Set(ctx.state.get('firedAlerts', []));

  function persistFired(today) {
    // Keep only recent ids so the list doesn't grow forever.
    const cutoff = addDays(today, -2);
    for (const id of fired) if (id.slice(0, 10) < cutoff) fired.delete(id);
    ctx.state.set('firedAlerts', [...fired]);
  }

  function currentAlerts() {
    const schedule = ctx.schedule();
    const values = ctx.values();
    if (!schedule) return [];
    const extra = ctx.hooks.alertsVersion?.() ?? 0;
    if (
      cacheKey?.schedule !== schedule ||
      cacheKey?.values !== values ||
      cacheKey?.extra !== extra
    ) {
      cacheKey = { schedule, values, extra };
      alerts = [
        ...buildAlerts({
          days: [schedule.yesterday, schedule.today, schedule.tomorrow],
          values,
          tz: schedule.tz,
          combine: ctx.hooks.combineAlerts?.() ?? null,
        }),
        // Travel extras: stay-limit reminder, flight prayer reminders.
        ...(values['reminders.enabled'] ? (ctx.hooks.extraAlerts?.(schedule) ?? []) : []),
      ].sort((a, b) => a.time - b.time);
      syncBackground(alerts).catch(() => {});
    }
    return alerts;
  }

  async function fire(alert) {
    const { title, body } = renderAlert(alert, ctx);
    const values = ctx.values();
    const silent = alert.sound === 'silent';
    await showNotification(title, {
      body,
      tag: alert.id,
      silent,
      vibrate: values['reminders.vibrate'] && !silent ? [200, 100, 200] : undefined,
      timestamp: alert.time.getTime(),
    });
    if (values['reminders.vibrate'] && !silent) navigator.vibrate?.([200, 100, 200]);
    const played = await playSound(alert.sound, values['reminders.volume'] / 100);
    if (document.visibilityState === 'visible') {
      toast(
        title,
        played === 'adhan'
          ? { action: t('notify.stopAdhan'), onAction: stopSound, duration: 15000 }
          : { duration: 5000 },
      );
    }
  }

  function tick(now) {
    const values = ctx.values();
    if (!values['reminders.enabled'] || notificationSupport() !== 'granted') return;
    const list = currentAlerts();
    const { due, stale } = dueAlerts(list, now, fired);
    if (!due.length && !stale.length) return;
    for (const a of stale) fired.add(a.id);
    for (const a of due) {
      fired.add(a.id);
      if (passesCondition(a, ctx.tracker.getDay(a.day))) fire(a).catch(console.error);
    }
    persistFired(ymd(now, ctx.location()?.tz));
  }

  /** Turn notifications on (asks for permission). Call from a user gesture. */
  async function enable() {
    const support = notificationSupport();
    if (support === 'ios-install' || support === 'unsupported') {
      ctx.settings.set('reminders.enabled', false);
      toast(t(support === 'ios-install' ? 'notify.iosInstall' : 'notify.unsupported'), {
        duration: 6000,
      });
      return false;
    }
    let perm = support;
    if (perm === 'default') {
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = 'denied';
      }
    }
    if (perm !== 'granted') {
      ctx.settings.set('reminders.enabled', false);
      toast(t('notify.denied'), { duration: 6000 });
      return false;
    }
    ctx.settings.set('reminders.enabled', true);
    registerPeriodicSync().catch(() => {});
    return true;
  }

  // Ask for permission as soon as the switch is turned on (still inside the tap).
  ctx.settings.subscribe((keys, values) => {
    if (
      keys.includes('reminders.enabled') &&
      values['reminders.enabled'] &&
      notificationSupport() !== 'granted'
    ) {
      enable();
    }
  });

  /**
   * Best-effort closed-app delivery: store the next 48 h for the service
   * worker and schedule Notification Triggers where supported.
   */
  async function syncBackground(list) {
    const now = ctx.now();
    const upcoming = list
      .filter((a) => a.time > now && a.time - now < 2 * DAY && !a.onlyIf)
      .map((a) => ({
        id: a.id,
        time: a.time.getTime(),
        ...renderAlert(a, ctx),
        silent: a.sound === 'silent',
      }));
    await idbSet('alerts', {
      savedAt: Date.now(),
      alerts: ctx.values()['reminders.enabled'] ? upcoming : [],
    });
    if (!supportsTriggers() || notificationSupport() !== 'granted') return;
    const reg = await navigator.serviceWorker?.ready;
    if (!reg) return;
    const wanted = new Set(upcoming.map((a) => a.id));
    for (const n of await reg.getNotifications({ includeTriggered: true })) {
      if (n.showTrigger && !wanted.has(n.tag)) n.close();
    }
    for (const a of upcoming) {
      await reg.showNotification(a.title, {
        body: a.body,
        tag: a.id,
        icon: ICON,
        badge: BADGE,
        silent: a.silent,
        data: { url: './#today' },
        // eslint-disable-next-line no-undef
        showTrigger: new TimestampTrigger(a.time),
      });
    }
  }

  async function registerPeriodicSync() {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.periodicSync) return;
    const status = await navigator.permissions
      ?.query({ name: 'periodic-background-sync' })
      .catch(() => null);
    if (status && status.state !== 'granted') return;
    await reg.periodicSync.register('iman-alerts', { minInterval: 12 * HOUR });
  }

  return {
    tick,
    enable,
    upcoming: () => currentAlerts().filter((a) => a.time > ctx.now()),
    test: () =>
      showNotification(t('notify.testTitle'), { body: t('notify.testBody'), tag: 'iman-test' }),
    isPlaying,
  };
}
