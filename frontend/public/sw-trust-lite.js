const CACHE_NAME = 'trust-lite-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest-trust-lite.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.map((cacheName) => {
        if (cacheName !== CACHE_NAME && cacheName.startsWith('trust-lite-')) {
          return caches.delete(cacheName);
        }
        return undefined;
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
