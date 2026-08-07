/**
 * SankofaBird/Navigation/Altitude.ts
 *
 * Altitude / zoom system — derives rendering LOD tier, auto-escalating
 * navigation LOD, and off-screen detection via IntersectionObserver.
 */

import { useEffect, useRef, useState } from "react";

export type ZoomTier = "low" | "mid" | "high" | "street";

export interface AltitudeState {
  /** Zoom-driven rendering tier. */
  zoomTier: ZoomTier;
  /** Auto-escalating navigation LOD (0 = full, 1 = reduce, 2 = minimal). */
  navLod: number;
  /** True when the bird rig div is fully off-screen. */
  isOffScreen: boolean;
}

/**
 * useAltitude — zoom tier, navLod escalation, and IntersectionObserver.
 *
 * @param mapZoom - Current Mapbox zoom level (0–22).
 * @param navigating - True during active navigation.
 * @param rigRef - Ref to the bird rig div for IntersectionObserver.
 * @param navLodOverride - Optional external LOD override.
 */
export function useAltitude(
  mapZoom: number,
  navigating: boolean,
  rigRef: React.RefObject<HTMLDivElement | null>,
  navLodOverride?: number,
): AltitudeState {
  const zoomTier: ZoomTier =
    mapZoom < 10   ? "low"    :
    mapZoom >= 17  ? "street" :
    mapZoom >= 14  ? "high"   : "mid";

  const navStartRef = useRef<number | null>(null);
  const [navLod, setNavLod] = useState(0);
  const [isOffScreen, setIsOffScreen] = useState(false);

  // Navigation session LOD escalation.
  useEffect(() => {
    if (navigating) {
      if (navStartRef.current === null) navStartRef.current = Date.now();
      const id = setInterval(() => {
        const elapsed = Date.now() - (navStartRef.current ?? Date.now());
        if      (elapsed >= 30 * 60_000) setNavLod(2);
        else if (elapsed >= 10 * 60_000) setNavLod(1);
        else                              setNavLod(0);
      }, 60_000);
      return () => clearInterval(id);
    } else {
      navStartRef.current = null;
      setNavLod(0);
      return undefined;
    }
  }, [navigating]);

  // Off-screen detection.
  useEffect(() => {
    const el = rigRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsOffScreen(!entry.isIntersecting),
      { rootMargin: "40px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { zoomTier, navLod: navLodOverride ?? navLod, isOffScreen };
}
