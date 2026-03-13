self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch (error) {
    }

    const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const client of clientsList) {
      client.postMessage({ type: 'SW_CLEANED' });
    }

    await self.registration.unregister();
  })());
});

self.addEventListener('fetch', () => {
  // Intentionally pass through: this file only exists to clean stale PWA state.
});
