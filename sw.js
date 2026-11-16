// sw.js - Offline-First Service Worker (Cache-First for App Shell & Static Assets)
const CACHE_NAME = 'steady-signal-shell-v5';
const RUNTIME_CACHE = 'steady-signal-runtime-v5';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './manifest.json',
  './icon.svg',
  './logo.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

const EXTERNAL_CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://esm.sh/@supabase/supabase-js@2'
];

// 1. Install: Pre-cache all local App Shell files and external libraries
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL_ASSETS);
      for (const url of EXTERNAL_CDN_ASSETS) {
        try {
          const req = new Request(url, { mode: 'cors' });
          const res = await fetch(req);
          if (res.ok) await cache.put(req, res);
        } catch {
          // Ignore individual CDN pre-cache failure during install
        }
      }
    })
  );
});

// 2. Activate: Delete outdated caches from previous versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// 3. Fetch: Cache-First for App Shell, Static Assets, Fonts & CDN scripts
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache live Supabase API / Edge Function calls in the static cache
  // (Data persistence is handled in IndexedDB via db.js)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Navigation requests (HTML): Cache-First so opening the PWA on iPhone/Android is instant offline
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cachedHtml) => {
        const networkFetch = fetch(request)
          .then((networkRes) => {
            if (networkRes && networkRes.ok) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
            }
            return networkRes;
          })
          .catch(() => cachedHtml);

        return cachedHtml || networkFetch;
      })
    );
    return;
  }

  // Static App Shell, JS, CSS, Fonts, Icons, Logos: Cache-First with background update
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in background when online
        fetch(request)
          .then((netRes) => {
            if (netRes && netRes.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, netRes));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const respClone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, respClone));
          }
          return networkResponse;
        })
        .catch(() => {
          if (request.destination === 'image') {
            return caches.match('./icon.svg');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    })
  );
});

// 4. Push Notifications & Click Handling
self.addEventListener('push', (event) => {
  let payload = { title: 'Steady Signal', body: 'Nueva señal de trading disponible.' };
  try {
    if (event.data) payload = event.data.json();
  } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Steady Signal', {
      body: payload.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      data: payload.data || { tab: 'signals' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'OPEN_TAB', tab: event.notification.data?.tab || 'signals' });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
