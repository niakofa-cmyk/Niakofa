/** Shows an honest connectivity warning; mutations are not stored offline. */
import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/lib/useNetworkStatus";

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-destructive text-white text-xs font-semibold py-2 px-4 animate-in slide-in-from-top-2"
      >
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        You're offline — actions aren't queued. Reconnect and retry any action that didn't complete.
      </div>
    );
  }

  return null;
}
