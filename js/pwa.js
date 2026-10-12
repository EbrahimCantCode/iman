// Service worker registration, the "Update available" prompt, and install
// help: the browser install prompt (Android/desktop) or Add to Home Screen
// instructions (iPhone).

import { h, toast, isIOS, isStandalone } from './ui.js';
import { icon } from './icons.js';
import { t } from './i18n/index.js';

let deferredPrompt = null;
const listeners = new Set();

globalThis.addEventListener?.('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  for (const fn of listeners) fn();
});
globalThis.addEventListener?.('appinstalled', () => {
  deferredPrompt = null;
  for (const fn of listeners) fn();
});

/** Register sw.js and show "Update available, tap to refresh" for new versions. */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  let reg;
  try {
    reg = await navigator.serviceWorker.register('sw.js');
  } catch (err) {
    console.warn('Service worker registration failed', err);
    return null;
  }
  const prompt = (worker) =>
    toast(t('update.available'), {
      action: t('update.refresh'),
      onAction: () => worker.postMessage({ type: 'SKIP_WAITING' }),
      duration: 0,
    });
  if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) prompt(worker);
    });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  // Look for a new version whenever the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
  return reg;
}

/** Install card for the Today screen (null when installed or dismissed). */
export function installCard(ctx) {
  if (isStandalone() || ctx.state.get('installDismissed')) return null;
  const ios = isIOS();
  if (!ios && !deferredPrompt) return null;
  const notSafari = ios && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  const card = h(
    'section',
    { class: 'card install-card', 'aria-labelledby': 'install-title' },
    h(
      'div',
      { class: 'card-row' },
      icon('download'),
      h('h2', { id: 'install-title', class: 'grow', text: t('install.title') }),
    ),
    h('p', {
      text: ios ? t(notSafari ? 'install.iosNotSafari' : 'install.iosBody') : t('install.body'),
    }),
    h(
      'div',
      { class: 'btn-row' },
      ios
        ? h('a', { class: 'btn btn-primary', href: '#guide', text: t('install.howTo') })
        : h('button', {
            type: 'button',
            class: 'btn btn-primary',
            text: t('install.button'),
            onclick: async () => {
              const prompt = deferredPrompt;
              deferredPrompt = null;
              await prompt?.prompt();
              card.remove();
            },
          }),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost',
        text: t('install.dismiss'),
        onclick: () => {
          ctx.state.set('installDismissed', true);
          card.remove();
        },
      }),
    ),
  );
  return card;
}

/** Re-render something when installability changes. */
export function onInstallChange(fn) {
  listeners.add(fn);
}
