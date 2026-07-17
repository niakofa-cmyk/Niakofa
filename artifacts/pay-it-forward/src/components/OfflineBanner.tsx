/**
 * OfflineBanner — Phase 9C
 *
 * Thin sticky banner shown at the top of the app when:
 *  - User is offline (red)
 *  - Requests are queued and syncing (amber)
 *  - Queue just flushed (green, auto-dismisses after 3s)
 */
import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useOfflineQueue } from "@/lib/useOfflineQueue";

export function OfflineBanner() {
  const { pendingCount, isSyncing, lastSynced, isOnline } = useOfflineQueue();
  const [showSynced, setShowSynced] = useState(false);

  useEffect(() => {
    if (lastSynced && pendingCount === 0) {
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [lastSynced, pendingCount]);

  if (isOnline && pendingCount === 0 && !showSynced) return null;

  if (showSynced) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-green-600 text-white text-xs font-semibold py-2 px-4 animate-in slide-in-from-top-2">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        Queued requests synced successfully
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-destructive text-white text-xs font-semibold py-2 px-4 animate-in slide-in-from-top-2">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        You're offline — new requests will be queued and sent when you reconnect
        {pendingCount > 0 && (
          <span className="ml-1 bg-white/20 rounded-full px-2 py-0.5">
            {pendingCount} queued
          </span>
        )}
      </div>
    );
  }

  if (isSyncing && pendingCount > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-semibold py-2 px-4 animate-in slide-in-from-top-2">
        <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
        Syncing {pendingCount} queued request{pendingCount !== 1 ? "s" : ""}…
      </div>
    );
  }

  return null;
}
