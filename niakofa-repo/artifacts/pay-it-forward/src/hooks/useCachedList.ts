/**
 * useCachedList — stale-while-revalidate list fetcher for screens that use
 * plain fetch() instead of React Query (e.g. audio-circles.tsx).
 *
 * WHY THIS EXISTS
 * ----------------
 * The map, requests, and civic-needs screens already get "never show empty
 * on navigate/refresh" for free from the global QueryClient defaults in
 * App.tsx (staleTime, gcTime: 10min, placeholderData: keepPreviousData).
 * Audio Circles does NOT go through React Query — it's a local useState +
 * useEffect + fetch, so every remount (leave the page, come back; or a hard
 * refresh) starts from `circles = null` and shows "Loading circles…" before
 * repainting the list a moment later. The DB rows themselves are never lost
 * (see migration 0073 + ensureCirclesForCity), but that loading flash reads
 * to a user as "my circles disappeared," which is the exact complaint this
 * closes.
 *
 * WHAT IT DOES
 * ------------
 * 1. On mount, synchronously hydrates state from sessionStorage (if present)
 *    so the last-known-good list paints immediately — no blank/loading frame.
 * 2. Revalidates in the background against the network.
 * 3. On success, updates state + sessionStorage.
 * 4. On failure (network blip, brief server restart, a poll tick racing a
 *    slow response), the last-known-good list is left exactly as-is. Nothing
 *    is ever cleared by a failed request — same rule already used for the
 *    circles fetch itself.
 *
 * USAGE (drop-in replacement for the manual state in audio-circles.tsx)
 * ------------------------------------------------------------------
 *   const { data: circles, loading, refresh } = useCachedList<CircleSummary[]>({
 *     cacheKey: `niakofa_circles_cache_${city}`,
 *     fetcher: () => fetch(`${base}/api/audio-circles?city=${encodeURIComponent(city)}`, { headers: authHeaders() })
 *       .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
 *       .then(d => d.circles ?? []),
 *     pollMs: 15000,
 *   });
 *
 * Generic — works for any list-shaped screen (Circles today; drop-in for any
 * future raw-fetch screen that shouldn't flash empty on remount).
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface UseCachedListOptions<T> {
  /** Unique per-dataset key, e.g. `niakofa_circles_cache_${city}`. Include
   *  any parameter (city, filter, etc.) that changes what "the list" means —
   *  otherwise you'll flash stale data for the wrong city/filter. */
  cacheKey: string;
  /** Fetches fresh data. Must throw / reject on failure — never resolve with
   *  an empty/placeholder value to represent an error, or that failure will
   *  be persisted as if it were real data. */
  fetcher: () => Promise<T>;
  /** Optional background poll interval (ms). Omit to fetch once per mount /
   *  cacheKey change only. */
  pollMs?: number;
  /** Skip fetching (e.g. while a required param like city is empty). */
  enabled?: boolean;
}

interface UseCachedListResult<T> {
  /** Cached-then-fresh data. Null only before the very first cache read AND
   *  first network response have both had a chance to resolve. */
  data: T | null;
  /** True only while there is nothing at all to show yet (no cache, no
   *  successful fetch) AND a fetch has not yet completed (success or failure).
   *  Never true again once any fetch has resolved — a failed first fetch must
   *  surface an error/retry state, not collapse to a blank screen. */
  loading: boolean;
  /** Set when the most recent fetch failed. Data (if any) is still valid —
   *  this is purely informational so the UI can show a subtle "reconnecting"
   *  hint without ever wiping the list. */
  stale: boolean;
  /** True once the first fetch attempt has completed (success or failure).
   *  Lets the UI distinguish "still loading" from "first fetch failed, show
   *  an explicit error/retry state instead of a blank void." */
  hasFetchedOnce: boolean;
  /** Manually trigger a revalidation (e.g. pull-to-refresh, after an action). */
  refresh: () => Promise<void>;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full/blocked (private browsing, etc.) — degrade to
    // network-only for this session. Never let a cache-write failure
    // affect the in-memory state the user is currently looking at.
  }
}

export function useCachedList<T>({
  cacheKey,
  fetcher,
  pollMs,
  enabled = true,
}: UseCachedListOptions<T>): UseCachedListResult<T> {
  // Lazy initializer runs synchronously on first render — this is what
  // avoids the "loading" flash: by the time the component paints, cached
  // data (if any) is already in state.
  const [data, setData] = useState<T | null>(() => readCache<T>(cacheKey));
  const [stale, setStale] = useState(false);
  // Tracks whether the first fetch attempt has resolved at all (success or
  // failure). Without this, a failed first-ever fetch collapses to a blank
  // screen: `loading` would be false (stale is true) and `data` is null, so
  // none of the loading/empty/list branches in the render ever fire.
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  // Re-hydrate from cache whenever the key itself changes (e.g. switching
  // city) — otherwise the old dataset would keep rendering under the new key
  // until the new fetch resolves.
  useEffect(() => {
    setData(readCache<T>(cacheKey));
    setStale(false);
    setHasFetchedOnce(false);
  }, [cacheKey]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const fresh = await fetcherRef.current();
      // Guard against a stale response landing after the cacheKey changed
      // (e.g. user switched city mid-request) — never let an old-city
      // response overwrite the new-city cache/state.
      if (cacheKeyRef.current !== cacheKey) return;
      setData(fresh);
      setStale(false);
      writeCache(cacheKeyRef.current, fresh);
    } catch {
      // Network/server failure: leave `data` (and the sessionStorage cache)
      // completely untouched. This is the core "never disappear" guarantee —
      // a failed request is not evidence the data is gone.
      if (cacheKeyRef.current === cacheKey) setStale(true);
    } finally {
      // Whether the first fetch succeeded or failed, it has now completed —
      // the UI can stop showing "loading" and instead show an explicit
      // error/retry state when there is no data to fall back on.
      if (cacheKeyRef.current === cacheKey) setHasFetchedOnce(true);
    }
  }, [cacheKey, enabled]);

  useEffect(() => {
    load();
    if (!pollMs) return;
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return {
    data,
    // Loading only while we have no data AND the first fetch hasn't
    // completed yet. Once a fetch has resolved (even by failing), loading
    // is false so the caller can render an error/empty/retry state instead
    // of a blank void.
    loading: data === null && !hasFetchedOnce,
    stale,
    hasFetchedOnce,
    refresh: load,
  };
}
