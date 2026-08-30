'use strict';

const CACHE_NAME = 'school-smart-pwa-v1.4.1-schedule-8-ios-bell';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/default-data.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
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
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
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
