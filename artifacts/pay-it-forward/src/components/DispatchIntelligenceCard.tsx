/**
 * DispatchIntelligenceCard.tsx — Enhanced
 *
 * Audit findings fixed:
 *  1. Nia summary fetch had no AbortController — dangling fetches on fast
 *     navigation could resolve after component unmount and setState on dead tree
 *  2. No skeleton loader — card jumped layout on load
 *  3. Error state showed raw error message (potentially leaking API details)
 *  4. "Assign helper" action had no optimistic UI — felt broken on slow connections
 *  5. Helper distance shown as raw meters string — needed formatting
 *  6. No empty state when no helpers are available
 *  7. Card didn't refresh if request status changed externally (WebSocket update)
 *  8. `key` on helper list items used array index — wrong if list reorders
 *
 * Enhancements:
 *  - Abort fetch on unmount / prop change
 *  - Skeleton loader matching card layout
 *  - Formatted distance (mi) + ETA on each helper row
 *  - Optimistic "Assigning…" state with rollback on error
 *  - WebSocket-aware: re-fetches when requestId changes or ws event fires
 *  - Empty state with actionable copy
 *  - Confidence bar for Nia's dispatch recommendation
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NearbyHelper {
  id: number;
  name: string;
  avatar_url: string | null;
  trust_score: number | null;
  help_count: number | null;
  distance_meters: number | null;
  eta_minutes: number | null;
}

interface DispatchSummary {
  summary: string;
  recommended_helper_id: number | null;
  confidence: number; // 0–1
  helpers: NearbyHelper[];
}

interface DispatchIntelligenceCardProps {
  requestId: number;
  requestTitle: string;
  requestCategory: string;
  onHelperAssigned?: (helperId: number) => void;
  /** Pass latest WS event version so card re-fetches on external updates */
  wsVersion?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDistance(meters: number | null): string {
  if (meters == null) return "—";
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.round(meters)} m`;
  return `${miles.toFixed(1)} mi`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse"
      aria-busy="true"
      aria-label="Loading dispatch intelligence"
    >
      <div className="h-3 bg-muted rounded w-1/3" />
      <div className="h-4 bg-muted rounded w-full" />
      <div className="h-4 bg-muted rounded w-4/5" />
      <div className="space-y-2 pt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-2.5 bg-muted rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DispatchIntelligenceCard({
  requestId,
  requestTitle,
  requestCategory,
  onHelperAssigned,
  wsVersion,
}: DispatchIntelligenceCardProps) {
  const [data, setData] = useState<DispatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [assignedId, setAssignedId] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchDispatch = useCallback(async () => {
    // Cancel any in-flight fetch
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/dispatch/intelligence?request_id=${requestId}`,
        { signal: abortRef.current.signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as DispatchSummary;
      setData(json);
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // unmounted, ignore
      setError("Could not load dispatch info — tap to retry.");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  // Fetch on mount, requestId change, or WS update
  useEffect(() => {
    fetchDispatch();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDispatch, wsVersion]);

  const handleAssign = useCallback(
    async (helperId: number) => {
      if (assigningId != null || assignedId != null) return;

      // Optimistic UI
      setAssigningId(helperId);

      try {
        const res = await fetch(`/api/requests/${requestId}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ helper_id: helperId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setAssignedId(helperId);
        onHelperAssigned?.(helperId);
      } catch {
        // Rollback optimistic state
        setAssigningId(null);
        setError("Failed to assign helper — please try again.");
      }
    },
    [requestId, assigningId, assignedId, onHelperAssigned]
  );

  // ─── Render states ────────────────────────────────────────────────────────

  if (loading) return <CardSkeleton />;

  if (error) {
    return (
      <div
        className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        role="alert"
      >
        <p>{error}</p>
        <button
          className="mt-2 text-xs underline font-semibold"
          onClick={fetchDispatch}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.helpers.length === 0) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-5 text-center"
        role="status"
      >
        <div className="text-2xl mb-2">🔍</div>
        <div className="text-sm font-semibold">No helpers nearby right now</div>
        <div className="text-xs text-muted-foreground mt-1">
          Nia will notify you as helpers come online in your area.
        </div>
      </div>
    );
  }

  const recommended = data.recommended_helper_id
    ? data.helpers.find((h) => h.id === data.recommended_helper_id)
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            Dispatch Intelligence
          </span>
          <button
            className="text-[10px] text-muted-foreground underline"
            onClick={fetchDispatch}
            aria-label="Refresh dispatch"
          >
            Refresh
          </button>
        </div>
        <p className="text-xs text-foreground/80 leading-snug">{data.summary}</p>

        {/* Confidence bar */}
        {recommended && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${Math.round(data.confidence * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {Math.round(data.confidence * 100)}% match
            </span>
          </div>
        )}
      </div>

      {/* Helper list */}
      <ul className="divide-y divide-border/40" role="list" aria-label="Available helpers">
        {data.helpers.map((helper) => {
          const isRecommended = helper.id === data.recommended_helper_id;
          const isAssigning = assigningId === helper.id;
          const isAssigned = assignedId === helper.id;
          const initial = helper.name ? [...helper.name][0] ?? "?" : "?";

          return (
            <li
              key={helper.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                isRecommended ? "bg-primary/5" : ""
              }`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-background shadow-sm">
                  {helper.avatar_url ? (
                    <img
                      src={helper.avatar_url}
                      alt=""
                      aria-hidden="true"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full bg-muted flex items-center justify-center text-[11px] font-bold text-foreground"
                      aria-hidden="true"
                    >
                      {initial}
                    </div>
                  )}
                </div>
                {isRecommended && (
                  <div
                    className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center"
                    title="Nia's top pick"
                    aria-label="Nia's recommended helper"
                  >
                    <span className="text-[8px] text-primary-foreground font-bold">★</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold truncate">{helper.name}</span>
                  {isRecommended && (
                    <span className="text-[9px] text-primary font-bold">Top pick</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5 flex-wrap">
                  {helper.trust_score != null && (
                    <span>{helper.trust_score}% trust</span>
                  )}
                  {helper.help_count != null && (
                    <span>{helper.help_count} helps</span>
                  )}
                  {helper.distance_meters != null && (
                    <span>{formatDistance(helper.distance_meters)}</span>
                  )}
                  {helper.eta_minutes != null && (
                    <span className="text-primary font-medium">
                      ~{helper.eta_minutes} min
                    </span>
                  )}
                </div>
              </div>

              {/* Assign button */}
              <button
                className={`flex-shrink-0 text-xs font-semibold rounded-xl px-3 py-1.5 transition-colors ${
                  isAssigned
                    ? "bg-green-500/20 text-green-600 cursor-default"
                    : isAssigning
                    ? "bg-primary/20 text-primary cursor-wait"
                    : assignedId != null
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
                }`}
                onClick={() => handleAssign(helper.id)}
                disabled={isAssigning || assignedId != null}
                aria-label={
                  isAssigned
                    ? `${helper.name} assigned`
                    : isAssigning
                    ? `Assigning ${helper.name}`
                    : `Assign ${helper.name}`
                }
              >
                {isAssigned ? "Assigned ✓" : isAssigning ? "Assigning…" : "Assign"}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground">
          Ranked by trust score, distance, and category match for{" "}
          <span className="font-medium">{requestCategory}</span> requests.
        </p>
      </div>
    </div>
  );
}
