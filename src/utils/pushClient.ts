function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToWebPush(): Promise<{
  granted: boolean;
  subscribed: boolean;
  error?: string;
}> {
  if (!('Notification' in window)) {
    return { granted: false, subscribed: false, error: 'Navegador não suporta notificações.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { granted: false, subscribed: false, error: 'Permissão de notificação negada.' };
  }

  try {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      const res = await fetch('/api/push/vapid-public-key');
      const { publicKey } = (await res.json()) as { publicKey: string };

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      return { granted: true, subscribed: true };
    }
  } catch {
    // Fallback to ServiceWorker / Notification API if PushManager is restricted in iframe
  }

  return { granted: true, subscribed: false };
}

export async function showLocalPushNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `validamerc-${Date.now()}`,
      });
      return;
    }
  } catch {
    // Fallback to standard Notification constructor
  }
  new Notification(title, {
    body,
    icon: '/pwa-192x192.png',
  });
}
