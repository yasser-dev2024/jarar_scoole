'use strict';

const APP_VERSION = '1.5.3';
const CACHE_PREFIX = 'school-smart-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v${APP_VERSION}`;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const VERSION_URL = new URL('./version.json', self.registration.scope).href;
const APP_SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/default-data.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png',
  './sounds/school_bell.wav',
  './sounds/class_start.wav',
  './sounds/class_end.wav',
  './sounds/period_1_start.mp3',
  './sounds/period_1_end.mp3',
  './sounds/period_2_start.mp3',
  './sounds/period_2_end.mp3',
  './sounds/period_3_start.mp3',
  './sounds/period_3_end.mp3',
  './sounds/period_4_start.mp3',
  './sounds/period_4_end.mp3',
  './sounds/period_5_start.mp3',
  './sounds/period_5_end.mp3',
  './sounds/period_6_start.mp3',
  './sounds/period_6_end.mp3',
  './sounds/period_7_start.mp3',
  './sounds/period_7_end.mp3',
  './sounds/break_start.mp3',
  './sounds/break_end.mp3',
  './sounds/break_end_start_period_4.mp3',
  './vendor/fflate.js',
  './vendor/sql-wasm.js',
  './vendor/sql-wasm.wasm',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const requests = APP_SHELL.map((path) => new Request(path, { cache: 'reload' }));
    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const outdatedAppCaches = keys.filter(
      (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
    );
    await Promise.all(outdatedAppCaches.map((key) => caches.delete(key)));
    await self.clients.claim();

    if (outdatedAppCaches.length) {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        void client.navigate(client.url).catch(() => null);
      });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (requestUrl.href === VERSION_URL) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(INDEX_URL, response.clone());
        }
        return response;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(INDEX_URL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic') await cache.put(event.request, response.clone());
    return response;
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const current = clients.find((client) => 'focus' in client);
      if (current) return current.focus();
      return self.clients.openWindow('./');
    }),
  );
});
