/**
 * Niakofa Service Worker v4
 *
 * Phase 9C additions:
 *  3. Offline POST queue — queues /api/requests POSTs when offline,
 *     replays them via Background Sync ("niakofa-request-sync") when
 *     connectivity is restored, and notifies the app via postMessage.
 */

const CACHE_NAME = "niakofa-v4";
const PRECACHE_ASSETS = ["/offline.html", "/favicon.svg", "/manifest.json"];
const QUEUE_KEY = "niakofa-offline-queue";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function readQueue() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("queue", "readonly");
    const req = tx.objectStore("queue").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => resolve([]);
  });
}

async function writeQueue(items) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    store.clear();
    items.forEach((item) => store.add(item));
    tx.oncomplete = () => resolve();
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("niakofa-sw", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("queue", { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(entry) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("queue", "readwrite");
    tx.objectStore("queue").add(entry);
    tx.oncomplete = () => resolve();
  });
}

async function notifyClients(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage(msg));
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.headers.get("upgrade") === "websocket") return;

  // Phase 9C: Queue offline POST /api/requests
  if (
    url.pathname.startsWith("/api/requests") &&
    request.method === "POST"
  ) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        const body = await request.clone().text();
        const authHeader = request.headers.get("Authorization") ?? "";
        await enqueue({ url: request.url, body, authHeader, ts: Date.now() });
        await self.registration.sync?.register("niakofa-request-sync").catch(() => {});
        await notifyClients({ type: "OFFLINE_QUEUED", count: (await readQueue()).length });
        return new Response(
          JSON.stringify({ queued: true, offline: true }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // All other API calls: network-only
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || caches.match("/offline.html")
          )
        )
    );
    return;
  }

  // Static assets: cache-first → network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request).then((r) => {
          if (r?.ok) caches.open(CACHE_NAME).then((c) => c.put(request, r));
        }).catch(() => {});
        return cached;
      }
      return fetch(request).then((response) => {
        if (!response?.ok || response.type === "opaque") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "niakofa-request-sync") {
    event.waitUntil(replayQueue());
  }
});

async function replayQueue() {
  const items = await readQueue();
  if (!items.length) return;

  const remaining = [];
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(item.authHeader ? { Authorization: item.authHeader } : {}),
        },
        body: item.body,
      });
      if (!res.ok) remaining.push(item);
      else {
        const data = await res.json().catch(() => ({}));
        await notifyClients({ type: "OFFLINE_SYNCED", request: data });
      }
    } catch {
      remaining.push(item);
    }
  }

  await writeQueue(remaining);
  await notifyClients({ type: "OFFLINE_QUEUE_STATUS", pending: remaining.length });
}

// ── Push ──────────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {
    data = { title: "Niakofa", body: event.data ? event.data.text() : "New notification" };
  }
  const title = data.title || "Niakofa — Community Help";
  const options = {
    body: data.body || "Help Today. Pay It Forward Tomorrow.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    vibrate: data.urgency === "emergency" ? [500, 200, 500, 200, 500] : [200, 100, 200],
    tag: data.requestId ? `request-${data.requestId}` : "niakofa-notification",
    renotify: true,
    requireInteraction: data.urgency === "emergency",
    data: { requestId: data.requestId || null, url: data.requestId ? `/?open_request=${data.requestId}` : "/" },
    actions: data.requestId
      ? [{ action: "view", title: "View Request" }, { action: "dismiss", title: "Dismiss" }]
      : [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) { c.focus(); c.postMessage({ type: "NOTIFICATION_CLICK", url: targetUrl }); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ── Message ───────────────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_QUEUE_STATUS") {
    readQueue().then((items) =>
      event.source?.postMessage({ type: "OFFLINE_QUEUE_STATUS", pending: items.length })
    );
  }
});
