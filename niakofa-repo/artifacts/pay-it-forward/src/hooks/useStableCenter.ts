import { useEffect, useRef, useState } from "react";

interface LatLng {
  lat: number;
  lng: number;
}

interface StableCenterOptions {
  /** Decimal places to round to before comparing/using as a query key.
   *  3 ≈ 111 meters of precision — plenty for a "requests/helpers near me"
   *  radius query, and coarse enough that ordinary GPS jitter and walking
   *  speed don't produce a new value on every render. */
  precision?: number;
  /** Minimum time between accepted center changes, in ms. Even after
   *  rounding, someone actually driving will still cross precision
   *  boundaries fairly often — the debounce caps how frequently that's
   *  allowed to trigger a brand-new query-cache entry. */
  debounceMs?: number;
}

/**
 * Data-loss fix (see niakofa map.tsx): live GPS coordinates change on nearly
 * every render while a user is moving. Any React Query call that puts the
 * raw lat/lng straight into its params/queryKey creates a brand-new cache
 * entry each time — which starts as `data: undefined` — every single tick.
 * Downstream code that does `const { data: foo = [] } = useSomeQuery(...)`
 * then renders an empty list for a moment on every GPS update, which reads
 * to the user as their open requests / online helpers / civic pins
 * "disappearing" while they use the app.
 *
 * useStableCenter rounds the incoming center to a fixed precision and only
 * lets a new value through after `debounceMs` of no further change AND an
 * actual rounded-value change — so the map still tracks the user in real
 * time visually (that still uses the raw, unrounded `myLocation`/
 * `effectiveCenter` directly), but the *queries* driven by that center stay
 * on one stable cache key until the user has genuinely moved somewhere new.
 *
 * Usage:
 *   const queryCenter = useStableCenter(effectiveCenter, { precision: 3, debounceMs: 4000 });
 *   useGetNearbyRequests({ lat: queryCenter?.lat ?? 0, lng: queryCenter?.lng ?? 0, ... })
 */
export function useStableCenter<T extends LatLng | null | undefined>(
  center: T,
  options: StableCenterOptions = {}
): LatLng | null {
  const { precision = 3, debounceMs = 4000 } = options;

  const rounded = center
    ? {
        lat: Number(center.lat.toFixed(precision)),
        lng: Number(center.lng.toFixed(precision)),
      }
    : null;

  const [stable, setStable] = useState<LatLng | null>(rounded);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedRef = useRef<LatLng | null>(rounded);

  useEffect(() => {
    // No location yet, or unchanged since the last accepted value — nothing to do.
    if (!rounded) {
      if (lastAppliedRef.current !== null) {
        lastAppliedRef.current = null;
        setStable(null);
      }
      return;
    }
    const prev = lastAppliedRef.current;
    if (prev && prev.lat === rounded.lat && prev.lng === rounded.lng) return;

    // First-ever fix: apply immediately so the map isn't stuck waiting on
    // its very first load — only subsequent moves are debounced.
    if (prev === null) {
      lastAppliedRef.current = rounded;
      setStable(rounded);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastAppliedRef.current = rounded;
      setStable(rounded);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounded?.lat, rounded?.lng, debounceMs]);

  return stable;
}
