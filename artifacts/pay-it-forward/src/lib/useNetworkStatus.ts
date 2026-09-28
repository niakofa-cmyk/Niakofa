/**
 * Browser connectivity status only.
 *
 * The public service worker does not queue API requests, so this hook
 * deliberately tracks network state without implying offline persistence.
 */
import { useEffect, useState } from "react";

function browserIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(browserIsOnline);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setIsOnline(browserIsOnline());
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { isOnline };
}