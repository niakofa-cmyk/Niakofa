/**
 * Niakofa Service Worker
 * Handles Web Push notifications for Fort Worth neighbors.
 */

const CACHE_NAME = "niakofa-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Niakofa", body: event.data ? event.data.text() : "New notification" };
  }

  const title = data.title || "Niakofa — Community Help";
  const options = {
    body: data.body || "Help Today. Pay It Forward Tomorrow.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    vibrate: [200, 100, 200],
    tag: data.requestId ? `request-${data.requestId}` : "niakofa-notification",
    renotify: true,
    data: {
      requestId: data.requestId || null,
      url: data.requestId ? `/?open_request=${data.requestId}` : "/",
    },
    actions: data.requestId
      ? [
          { action: "view", title: "View Request" },
          { action: "dismiss", title: "Dismiss" },
        ]
      : [],
  };

  if (data.urgency === "emergency") {
    options.vibrate = [500, 200, 500, 200, 500];
    options.requireInteraction = true;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            client.postMessage({ type: "NOTIFICATION_CLICK", url: targetUrl });
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener("notificationclose", (_event) => {});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
