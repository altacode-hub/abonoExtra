let fcmInitialized = false;

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'FIREBASE_CONFIG' && !fcmInitialized) {
    const senderId = data.messagingSenderId;
    if (!senderId) return;
    try {
      importScripts('https://www.gstatic.com/firebasejs/9.6.11/firebase-app-compat.js');
      importScripts('https://www.gstatic.com/firebasejs/9.6.11/firebase-messaging-compat.js');
      firebase.initializeApp({ messagingSenderId: String(senderId) });
      const messaging = firebase.messaging();
      messaging.onBackgroundMessage((payload) => {
        console.log('Received background message ', payload);
        const title = (payload && payload.notification && payload.notification.title) || 'Nova notificação';
        const body = (payload && payload.notification && payload.notification.body) || '';
        const link = (payload && payload.data && payload.data.link) || '/';
        const options = { body, icon: '/favicon.ico', badge: '/favicon.ico', data: { url: link } };
        self.registration.showNotification(title, options);
      });
      fcmInitialized = true;
    } catch (e) {}
  }
});

self.addEventListener('notificationclick', function (event) {
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
