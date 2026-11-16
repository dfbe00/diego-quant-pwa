const CACHE_NAME = 'zesty-quant-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon.svg',
  './logo.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Handle Push Notifications & Notification Clicks
self.addEventListener('push', (event) => {
  let payload = { title: 'Zesty Quant AI', body: 'Nueva señal de trading disponible para confirmar.' };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // fallback
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Zesty Quant AI', {
      body: payload.body,
      icon: './icon.svg',
      badge: './icon.svg',
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
