// Service Worker Push Notification Handler for ValidaMerc
self.addEventListener('push', function (event) {
  let payload = {
    title: 'ValidaMerc — Alerta de Validade',
    body: 'Existem produtos próximos do vencimento ou vencidos no estoque.',
    url: '/',
    tag: 'validamerc-expiry',
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = { ...payload, ...data };
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || 'validamerc-expiry',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: payload.url || '/' },
    actions: [
      { action: 'open', title: 'Ver Produtos' },
    ],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
