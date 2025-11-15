// Minimal service worker: App Shell-style with cache-first for static assets.
const CACHE = 'otg-cache-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // For JS/CSS assets built by Vite, prefer network then cache fallback.
  if (req.destination === 'script' || req.destination === 'style' || req.destination === 'document') {
    event.respondWith(
      fetch(req).then(resp => {
        const respClone = resp.clone();
        caches.open(CACHE).then(cache => cache.put(req, respClone));
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // For other stuff, try cache first then network.
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
