/**
 * LastUpdated — small reusable "Updated Xm ago" label + manual refresh
 * button, for pages that poll for data (Griot Globe hubs, hub-leader
 * dashboard) so it's always visually clear how fresh what's on screen is
 * and there's an obvious way to force a refresh rather than waiting for
 * the next poll tick.
 *
 * Mirrors the timestamp format used in NotificationsDrawer/BestMatchCard's
 * local `timeAgo` helpers and the refresh-button styling from
 * AdminLiveBanner, so all three "how fresh is this" indicators in the app
 * look and behave the same way.
 */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

function timeAgo(d: Date): string {
  const secs = (Date.now() - d.getTime()) / 1000;
  if (secs < 10) return "just now";
  if (secs < 60) return `${Math.floor(secs)}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function LastUpdated({
  lastUpdated,
  refreshing = false,
  onRefresh,
  staleAfterMs = 5 * 60 * 1000, // flag as stale after 5 minutes with no refresh
  className = "",
}: {
  lastUpdated: Date | null;
  refreshing?: boolean;
  onRefresh: () => void;
  staleAfterMs?: number;
  className?: string;
}) {
  // Re-render every ~10s purely to keep the "Xm ago" text and stale flag live
  // without requiring a data refetch.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const isStale = lastUpdated != null && Date.now() - lastUpdated.getTime() > staleAfterMs;

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      title="Refresh"
      className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border transition-colors ${
        isStale
          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-border/60 bg-muted/40 text-muted-foreground"
      } hover:bg-muted/70 disabled:opacity-60 ${className}`}
      data-testid="last-updated-indicator"
    >
      <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
      {refreshing
        ? "Refreshing…"
        : lastUpdated
          ? `${isStale ? "Stale — " : "Updated "}${timeAgo(lastUpdated)}`
          : "Not yet loaded"}
    </button>
  );
}
