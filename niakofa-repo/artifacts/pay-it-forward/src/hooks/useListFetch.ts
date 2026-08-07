import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useListFetch — no-flash list fetching hook.
 *
 * Problem: Every raw fetch+useState pattern that calls `setLoading(true)` at
 * the start of each fetch causes existing data to vanish behind a spinner
 * while the re-fetch resolves. This reads to users as their data disappearing.
 *
 * Fix: Only show the loading skeleton on the very first fetch (when there is
 * genuinely nothing to show yet). Subsequent refreshes keep existing data
 * visible and just silently update in-place when the new data arrives.
 *
 * Usage:
 *   const [items, loading, error, refetch] = useListFetch<MyType>(
 *     () => fetch(`/api/my-endpoint`, { headers: authHeaders() }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
 *     []       // dep array — re-fetches when any dep changes
 *   );
 */
export function useListFetch<T>(
  fetcher: () => Promise<T[]>,
  deps: readonly unknown[] = []
): [T[], boolean, string | null, () => void] {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetch_ = useCallback(async () => {
    // Only show full loading skeleton on first load — keeps existing data
    // visible during background re-fetches (no flash-empty).
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        hasLoadedRef.current = true;
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(typeof e === "string" ? e : "Could not reach server");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return [data, loading, error, fetch_];
}

/**
 * useItemFetch — same pattern for single-item (non-array) data.
 * Only shows loading on first fetch; subsequent refreshes keep previous value.
 */
export function useItemFetch<T>(
  fetcher: () => Promise<T | null>,
  deps: readonly unknown[] = []
): [T | null, boolean, string | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetch_ = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        hasLoadedRef.current = true;
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(typeof e === "string" ? e : "Could not reach server");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return [data, loading, error, fetch_];
}
