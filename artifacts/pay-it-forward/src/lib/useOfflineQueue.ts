/**
 * useOfflineQueue — Phase 9C
 *
 * Listens to the service worker for offline queue events and exposes:
 *  - pendingCount: number of requests queued offline
 *  - isSyncing: true while SW is replaying the queue
 *  - lastSynced: timestamp of last successful sync
 *
 * The SW posts these message types:
 *  OFFLINE_QUEUED       — a request was queued (offline)
 *  OFFLINE_SYNCED       — a queued request was replayed successfully
 *  OFFLINE_QUEUE_STATUS — current pending count (response to GET_QUEUE_STATUS)
 */
import { useEffect, useState, useCallback } from "react";

export interface OfflineQueueState {
  pendingCount: number;
  isSyncing: boolean;
  lastSynced: Date | null;
  isOnline: boolean;
  checkStatus: () => void;
}

export function useOfflineQueue(): OfflineQueueState {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const checkStatus = useCallback(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: "GET_QUEUE_STATUS" });
  }, []);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); setIsSyncing(true); checkStatus(); };
    const onOffline = () => { setIsOnline(false); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [checkStatus]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      const { data } = event;
      if (!data?.type) return;

      if (data.type === "OFFLINE_QUEUED") {
        setPendingCount(data.count ?? 1);
      } else if (data.type === "OFFLINE_SYNCED") {
        setLastSynced(new Date());
        setPendingCount(prev => Math.max(0, prev - 1));
        setIsSyncing(false);
      } else if (data.type === "OFFLINE_QUEUE_STATUS") {
        setPendingCount(data.pending ?? 0);
        if (data.pending === 0) setIsSyncing(false);
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    // Ask SW for current status on mount
    checkStatus();
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [checkStatus]);

  return { pendingCount, isSyncing, lastSynced, isOnline, checkStatus };
}
