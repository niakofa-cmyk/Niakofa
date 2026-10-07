/**
 * Niakofa Service Worker
 *
 * Responsibilities:
 *  1. Web Push notifications for Fort Worth neighbors.
 *  2. Offline fallback — shows /offline.html instead of a blank screen
 *     when the user navigates with no network connection.
 *
 * Caching strategy:
 *  - Navigation requests  : network-first → cache → offline.html fallback
 *    (Legacy routes are network-only so old HTML cannot reference deleted
 *     hashed chunks after a deployment.)
 *  - Static assets        : cache-first → network (stale-while-revalidate feel)
 *  - API requests (/api/) : network-only — never cache, let the app handle errors
 */

const CACHE_NAME = "niakofa-v6";

// Assets to pre-cache during install — ensures core app shell works offline
const PRECACHE_ASSETS = [
  "/offline.html",
  "/favicon.svg",
  "/favicon-16.png",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/sankofa-bird.png",
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests; let cross-origin (Mapbox tiles, CDNs) pass through
  if (url.origin !== self.location.origin) return;

  // API calls: network-only — never serve stale data for mutations or live queries
  if (url.pathname.startsWith("/api/")) return;

  // WebSocket upgrade requests: pass through untouched
  if (request.headers.get("upgrade") === "websocket") return;

  if (request.mode === "navigate") {
    const isLegacyNavigation = /^\/legacy(?:\/|$)/i.test(url.pathname);

    // Legacy is the public, deep-linked game entry point. Never serve a
    // cached HTML document for it: a previous deployment may have removed the
    // hashed lazy chunks referenced by that document, which otherwise turns a
    // healthy route into a blank screen or a cascade of 404s.
    if (isLegacyNavigation) {
      event.respondWith(
        fetch(new Request(request, { cache: "reload" })).catch(() =>
          caches.match("/offline.html")
        )
      );
      return;
    }

    // Other navigation (HTML page loads): network-first → cache → offline page.
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Never cache an error document (including a Railway 429/5xx
          // response) as the next navigation's app shell.
          if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          // Network failed — try the cache first, then the offline page
          caches.match(request).then(
            (cached) =>
              cached ||
              caches.match("/offline.html")
          )
        )
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first → network fallback
  const cachedResponsePromise = caches.match(request);
  event.respondWith(
    cachedResponsePromise.then((cached) => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache the result
      return fetch(request).then((response) => {
        if (!response || !response.ok || response.type === "opaque") {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
  // Keep the worker alive for stale-while-revalidate work after returning the
  // cached response; otherwise the browser may stop the worker before refresh
  // failures can be observed or a successful response can replace the cache.
  event.waitUntil(
    cachedResponsePromise
      .then((cached) => {
        if (!cached) return;

        return fetch(request).then((response) => {
          if (response && response.ok) {
            return caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, response));
          }
          if (self.navigator.onLine) {
            const reason = response && Number.isInteger(response.status)
              ? `HTTP ${response.status}`
              : "no response";
            console.warn("[service-worker] Background asset refresh returned a non-success response:", reason);
          }
        });
      })
      .catch((error) => {
        if (self.navigator.onLine) {
          const reason = error instanceof Error ? error.name : "unknown error";
          console.warn("[service-worker] Background asset refresh failed:", reason);
        }
      })
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "Niakofa",
      body: event.data ? event.data.text() : "New notification",
    };
  }

  const title = data.title || "Niakofa — Community Help";
  const options = {
    body: data.body || "Help Today. Pay It Forward Tomorrow.",
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    vibrate: [200, 100, 200],
    tag: data.requestId
      ? `request-${data.requestId}`
      : "niakofa-notification",
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

// ── Notification click ────────────────────────────────────────────────────────
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

// ── Message (from app) ────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
