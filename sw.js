// Iman service worker: offline cache, update flow and notifications.
//
// - App shell (HTML, CSS, JS, city list, icons, adhan-js) is precached and
//   served cache-first. The cache name carries the version; old caches are
//   deleted on activate.
// - The wake check's TensorFlow.js + COCO-SSD files (~19 MB) are cached on
//   first use in a separate cache that survives app updates.
// - A new version waits until the page asks it to take over ("Update
//   available, tap to refresh").
// - After install, the app makes no network requests except to its own origin.

const CACHE_VERSION = '0.1.0';
const SHELL_CACHE = `iman-shell-${CACHE_VERSION}`;
// Bump when lib/tfjs or lib/coco-ssd change (see scripts/vendor.mjs).
const MODEL_CACHE = 'iman-model-tfjs-4.22.0-cocossd-2.2.3';
const RUNTIME_CACHE = 'iman-runtime-v1';

const SHELL = [
  './',
  'index.html',
  'wake.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/audio.js',
  'js/boot.js',
  'js/clock.js',
  'js/config/constants.js',
  'js/config/defaults.js',
  'js/config/methods.js',
  'js/config/schema.js',
  'js/focus.js',
  'js/i18n/ar.js',
  'js/i18n/en.js',
  'js/i18n/index.js',
  'js/icons.js',
  'js/idb.js',
  'js/location.js',
  'js/notify.js',
  'js/prayer.js',
  'js/pwa.js',
  'js/qibla.js',
  'js/reminders.js',
  'js/settings.js',
  'js/sink-check.js',
  'js/state.js',
  'js/storage.js',
  'js/time.js',
  'js/tracker.js',
  'js/ui.js',
  'js/version.js',
  'js/views/guide.js',
  'js/views/location-picker.js',
  'js/views/onboarding.js',
  'js/views/qibla.js',
  'js/views/reminders-widget.js',
  'js/views/settings.js',
  'js/views/today.js',
  'js/views/tracker.js',
  'js/views/wake-widget.js',
  'js/views/widgets.js',
  'js/wake-logic.js',
  'js/wake-params.js',
  'js/wake.js',
  'lib/adhan/adhan.esm.min.js',
  'data/cities.json',
  'assets/audio/sounds.json',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/badge-96.png',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-512.png',
  'LICENSE',
  'THIRD_PARTY_LICENSES.md',
];

// On localhost, prefer the network so code edits show up without bumping the
// version (the cache is still filled, so offline testing keeps working).
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

const isModelAsset = (path) => /\/lib\/(tfjs|coco-ssd)\//.test(path);
const isRuntimeAsset = (path) => /\/assets\/audio\//.test(path);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, MODEL_CACHE, RUNTIME_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith('iman-') && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request, cacheName, { ignoreSearch = false } = {}) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request, { ignoreSearch })) ?? Response.error();
  }
}

async function cacheFirst(request, cacheName, { ignoreSearch = false } = {}) {
  if (DEV) return networkFirst(request, cacheName, { ignoreSearch });
  const cached = await caches.match(request, { ignoreSearch });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: cache-first (query strings like ?debugTime or wake parameters
  // don't change the file), falling back to the app shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        if (DEV) {
          try {
            return await fetch(request);
          } catch {
            /* offline: use the cache below */
          }
        }
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch {
          return (await caches.match('index.html')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (isModelAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, MODEL_CACHE));
    return;
  }
  if (isRuntimeAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }
  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});

// ------------------------------------------------------------ notifications

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client && !client.url.includes('wake.html'))
            client.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Periodic Background Sync (Chromium, installed apps only): re-arm scheduled
// notifications from the schedule the page saved in IndexedDB. Best effort.
function readSchedule() {
  return new Promise((resolve) => {
    const req = indexedDB.open('iman', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const get = req.result.transaction('kv', 'readonly').objectStore('kv').get('alerts');
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
  });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'iman-alerts') return;
  event.waitUntil(
    (async () => {
      const saved = await readSchedule();
      if (!saved?.alerts?.length || typeof self.TimestampTrigger !== 'function') return;
      const now = Date.now();
      for (const a of saved.alerts) {
        if (a.time <= now) continue;
        await self.registration.showNotification(a.title, {
          body: a.body,
          tag: a.id,
          silent: a.silent,
          icon: 'assets/icons/icon-192.png',
          badge: 'assets/icons/badge-96.png',
          data: { url: './#today' },
          showTrigger: new self.TimestampTrigger(a.time),
        });
      }
    })(),
  );
});
