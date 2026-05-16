// First Warn Weather — Service Worker
// Caches core assets for offline use and fast loading

const CACHE_NAME = 'firstwarnwx-v1';
const OFFLINE_URL = '/offline.html';

// Files to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/forecast.html',
  '/offline.html',
  '/fw-logo.png',
  '/fw-hero-new.png',
  '/manifest.json'
];

// ── INSTALL: pre-cache core assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS.map(url => {
        return new Request(url, { cache: 'reload' });
      })).catch(() => {
        // If some assets fail, continue anyway
        return Promise.resolve();
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: remove old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first for API calls, cache-first for assets ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for API calls (NWS alerts, Tempest, forecast.json)
  const isAPI =
    url.hostname.includes('weather.gov') ||
    url.hostname.includes('weatherflow.com') ||
    url.hostname.includes('windy.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('formspree.io') ||
    url.pathname.includes('forecast.json') ||
    url.pathname.includes('weather-blog.json');

  if (isAPI) {
    // Network-only for live data — no caching
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // For navigate requests (page loads): network first, fallback to cache, then offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh response
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // For everything else: cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Only cache valid responses for same-origin assets
        if (response && response.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

// ── PUSH NOTIFICATIONS (ready for future use) ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '⚡ First Warn Weather Alert';
  const options = {
    body: data.body || 'Tap to check the latest weather update.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: 'firstwarnwx-alert',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/index.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
