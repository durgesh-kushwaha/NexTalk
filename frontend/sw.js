/* NexTalk Service Worker — Firebase Cloud Messaging + push notifications */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBxLYNdJBqSJbKG8j185JdQ3RJw4MS_K24',
  authDomain: 'nextalk-ff7ad.firebaseapp.com',
  projectId: 'nextalk-ff7ad',
  storageBucket: 'nextalk-ff7ad.firebasestorage.app',
  messagingSenderId: '1007904785580',
  appId: '1:1007904785580:web:nextalk-web'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'NexTalk';
  const body = data.body || payload.notification?.body || 'You have a new message';
  const tag = data.type === 'call'
    ? 'nextalk-call'
    : 'nextalk-msg-' + (data.conversationId || 'default');

  return self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    tag,
    renotify: true,
    data: data,
    requireInteraction: data.type === 'call',
  });
});

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
    await self.clients.claim();
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = '/chat.html';
  if (data.conversationId) {
    targetUrl = '/chat.html?open=' + data.conversationId;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('chat.html') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', () => {
  // Pass through: no caching strategy
});
