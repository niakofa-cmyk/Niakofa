import { useEffect, useCallback, useState } from "react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function usePushNotifications(userId: number | null) {
  const [permission, setPermission] = useState<PushPermission>(
    () => {
      if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
      return Notification.permission as PushPermission;
    }
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-register service worker (without subscribing)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Check if already subscribed
          return reg.pushManager.getSubscription().then((sub) => {
            setIsSubscribed(!!sub);
          });
        })
        .catch(() => {});
    }
  }, []);

  const requestPermissionAndSubscribe = useCallback(async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }
    if (!userId) return false;

    setIsLoading(true);
    try {
      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") return false;

      // Ensure SW is registered
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // Fetch VAPID public key
      const keyRes = await fetch(`${BASE}/api/push/vapid-public-key`);
      if (!keyRes.ok) return false;
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      if (!publicKey) return false;

      // Subscribe
      const applicationServerKey = await urlBase64ToUint8Array(publicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      // Send subscription to server
      const res = await fetch(`${BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subscription }),
      });

      const ok = res.ok;
      setIsSubscribed(ok);
      return ok;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!("serviceWorker" in navigator) || !userId) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch(`${BASE}/api/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, endpoint: sub.endpoint }),
        });
      }
      setIsSubscribed(false);
    } catch {}
  }, [userId]);

  return { permission, isSubscribed, isLoading, requestPermissionAndSubscribe, unsubscribe };
}
