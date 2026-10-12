// Prayer focus lock. A web app cannot block other apps, so this is the
// closest thing inside Iman: a calm full-screen overlay at prayer time (plus
// an offset) for a set duration. Real app blocking is done with the phone's
// Focus mode / Digital Wellbeing (see the setup guide).
//
// It never traps the user: "I've prayed", the timer, or a long-press exit
// (also works with a held Space/Enter key) always close it.

import { h, longPress, toast } from './ui.js';
import { t, digits, fmtTime, fmtNum, currentLanguage } from './i18n/index.js';
import { formatCountdown, addDays, MINUTE } from './time.js';
import { AR_NAMES } from './config/constants.js';

/**
 * The focus window containing `now`, if any.
 * @returns {{id: string, prayer: string, day: string, adhan: Date, start: Date, end: Date} | null}
 */
export function activeFocusWindow(now, schedule, values) {
  if (!values['focus.enabled'] || !schedule) return null;
  const offset = values['focus.offset'] * MINUTE;
  const duration = values['focus.duration'] * MINUTE;
  for (const day of [schedule.yesterday, schedule.today]) {
    for (const prayer of values['focus.prayers']) {
      const adhan = day[prayer];
      if (!adhan) continue;
      const start = new Date(adhan.getTime() + offset);
      const end = new Date(start.getTime() + duration);
      if (now >= start && now < end) {
        return { id: `${day.day}:${prayer}`, prayer, day: day.day, adhan, start, end };
      }
    }
  }
  return null;
}

export function createFocusLock(ctx) {
  const handled = new Set(ctx.state.get('focusHandled', []));
  let open = null; // { win, dlg, test, wakeLock, timer }

  function remember(id, today) {
    handled.add(id);
    const cutoff = addDays(today, -2);
    for (const x of handled) if (x.slice(0, 10) < cutoff) handled.delete(x);
    ctx.state.set('focusHandled', [...handled]);
  }

  function tick(now) {
    if (open) {
      update(now);
      return;
    }
    const win = activeFocusWindow(now, ctx.schedule(), ctx.values());
    if (win && !handled.has(win.id)) show(win);
  }

  async function acquireWakeLock() {
    try {
      if (open && navigator.wakeLock && document.visibilityState === 'visible') {
        open.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch {
      /* not allowed (battery saver, iOS Home Screen < 18.4, ...) */
    }
  }

  function onVisible() {
    // Wake locks are released when the page is hidden; take it again.
    if (open && document.visibilityState === 'visible') acquireWakeLock();
  }

  function show(win, { test = false } = {}) {
    const values = ctx.values();
    const tz = ctx.location()?.tz;
    const name = t(`prayer.${win.prayer}`);
    const message = values['focus.message'] || t('focus.defaultMessage');
    const remaining = h('p', { class: 'focus-remaining num', role: 'timer', 'aria-live': 'off' });
    const holdSeconds = values['focus.exitHold'];

    const prayed = h('button', {
      type: 'button',
      class: 'btn btn-primary btn-lg btn-block',
      text: t('focus.prayed'),
      onclick: () => close('prayed'),
    });
    const exit = h(
      'button',
      {
        type: 'button',
        class: 'hold-btn',
        'aria-label': t('focus.holdAria', { s: fmtNum(holdSeconds) }),
      },
      h('span', { class: 'hold-ring', 'aria-hidden': 'true' }),
      h('span', { text: t('focus.hold', { s: fmtNum(holdSeconds) }) }),
    );
    longPress(
      exit,
      holdSeconds * 1000,
      () => close('exit'),
      (p) => exit.style.setProperty('--p', `${Math.round(p * 360)}deg`),
    );

    const dlg = h(
      'dialog',
      { class: 'focus-overlay', 'aria-labelledby': 'focus-title' },
      h(
        'div',
        { class: 'focus-inner' },
        h('p', { class: 'focus-kicker', text: test ? t('focus.testLabel') : t('focus.kicker') }),
        h(
          'h2',
          { id: 'focus-title', class: 'focus-title' },
          t('focus.title', { prayer: name }),
          currentLanguage() === 'ar'
            ? null
            : h('span', { class: 'ar', lang: 'ar', text: AR_NAMES[win.prayer] }),
        ),
        h('p', { class: 'focus-time', text: fmtTime(win.adhan, tz) }),
        h('p', { class: 'focus-message', text: message }),
        remaining,
        h('div', { class: 'focus-actions' }, prayed, exit),
      ),
    );
    // Escape would bypass the long-press, so it is ignored; the hold works by keyboard too.
    dlg.addEventListener('cancel', (e) => e.preventDefault());
    document.body.append(dlg);
    dlg.showModal();
    prayed.focus();

    open = { win, dlg, test, remaining, wakeLock: null };
    document.documentElement.requestFullscreen?.().catch(() => {});
    acquireWakeLock();
    document.addEventListener('visibilitychange', onVisible);
    navigator.vibrate?.([120, 80, 120]);
    update(ctx.now());
  }

  function update(now) {
    if (!open) return;
    const left = open.win.end - now;
    if (left <= 0) {
      close('timeout');
      return;
    }
    open.remaining.textContent = t('focus.remaining', {
      time: digits(formatCountdown(left).replace(/^00:/, '')),
    });
  }

  function close(reason) {
    if (!open) return;
    const { win, dlg, test, wakeLock } = open;
    open = null;
    document.removeEventListener('visibilitychange', onVisible);
    wakeLock?.release?.().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    dlg.close();
    dlg.remove();
    if (!test) remember(win.id, win.day);
    if (reason === 'prayed' && !test && ctx.values()['focus.autoMark']) {
      ctx.tracker.setStatus(win.day, win.prayer, 'prayed');
      toast(t('focus.marked', { prayer: t(`prayer.${win.prayer}`) }));
    } else if (reason === 'timeout') {
      toast(t('focus.ended'));
    }
  }

  /** "Test focus lock": opens now for the current or next prayer. */
  function test() {
    const schedule = ctx.schedule();
    const now = ctx.now();
    const prayer = schedule
      ? (['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].find((p) => schedule.today[p] > now) ?? 'isha')
      : 'dhuhr';
    const adhan = schedule?.today[prayer] ?? now;
    show(
      {
        id: 'test',
        prayer,
        day: schedule?.today.day ?? '',
        adhan,
        start: now,
        end: new Date(now.getTime() + ctx.values()['focus.duration'] * MINUTE),
      },
      { test: true },
    );
  }

  return { tick, test, isOpen: () => open !== null };
}

/** Settings widget: a short explanation and the test button. */
export function focusWidget(ctx, lock) {
  return h(
    'div',
    null,
    h('p', { class: 'hint', text: t('focus.explain') }),
    h(
      'div',
      { class: 'btn-row' },
      h('button', {
        type: 'button',
        class: 'btn',
        text: t('focus.test'),
        onclick: () => lock.test(),
      }),
      h('a', { class: 'btn btn-ghost', href: '#guide', text: t('focus.guideLink') }),
    ),
  );
}
