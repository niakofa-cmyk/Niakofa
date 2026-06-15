import { getStoredToken } from "./AppContext";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL }
    );
    return reg;
  } catch (err) {
    console.warn("SW registration failed:", err);
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function subscribeToPush(userId: number): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn("VITE_VAPID_PUBLIC_KEY not set — push disabled");
    return false;
  }
  try {
    const reg = await registerServiceWorker();
    if (!reg) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await sendSubscriptionToServer(userId, existing);
      return true;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
    });

    await sendSubscriptionToServer(userId, subscription);
    return true;
  } catch (err) {
    console.warn("Push subscription failed:", err);
    return false;
  }
}

async function sendSubscriptionToServer(userId: number, sub: PushSubscription): Promise<void> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  await fetch(`${base}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ userId, subscription: sub.toJSON() }),
  });
}

export async function unsubscribeFromPush(userId?: number): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    if (userId) {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await fetch(`${base}/api/push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ userId, endpoint: sub.endpoint }),
      }).catch(() => {});
    }
    await sub.unsubscribe();
  }
}
