import { useEffect, useRef } from "react";

interface ResilientQuery<TData> {
  data: TData | undefined;
  isSuccess: boolean;
  isError?: boolean;
}

/**
 * Data-loss fix (see niakofa map.tsx): `placeholderData: keepPreviousData`
 * (set on the query itself) already stops the UI from resetting to
 * `undefined` while a *new* fetch is in flight. But if that new fetch fails
 * — a dropped connection, a backend hiccup, a rate limit — React Query's
 * `data` collapses to `undefined` anyway, because placeholderData only
 * applies while the query is `pending`, not once it's settled as `error`.
 * Downstream code destructuring `const { data: requests = [] } = query`
 * would then render zero pins/rows for that render, indistinguishable from
 * "there's genuinely nothing here" — which is exactly the kind of moment
 * that gets reported as "the app lost my requests/helpers/civic data".
 *
 * useResilientData keeps its own ref of the last value that arrived via a
 * *successful* fetch and returns that instead of undefined/fallback on any
 * render where the query has errored or is still pending for the first
 * time. Once a new fetch actually succeeds, the ref is updated and the new
 * data is returned immediately — nothing here can serve permanently-stale
 * data, it only refuses to go backwards to empty on a transient failure.
 *
 * Usage:
 *   const requestsQuery = useGetNearbyRequests(params, { query: { placeholderData: keepPreviousData } });
 *   const requests = useResilientData(requestsQuery, []);
 */
export function useResilientData<TData>(
  query: ResilientQuery<TData>,
  fallback: TData
): TData {
  const lastGoodRef = useRef<TData>(fallback);

  useEffect(() => {
    if (query.isSuccess && query.data !== undefined) {
      lastGoodRef.current = query.data;
    }
  }, [query.isSuccess, query.data]);

  if (query.data !== undefined) return query.data;
  return lastGoodRef.current;
}
