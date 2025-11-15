// Minimal service worker: cache shell + network-first for JS/CSS.
const CACHE = 'nebula-cache-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.destination === 'script' || req.destination === 'style' || req.destination === 'document') {
    event.respondWith(
      fetch(req).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(cache => cache.put(req, clone));
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(caches.match(req).then(c => c || fetch(req)));
});
