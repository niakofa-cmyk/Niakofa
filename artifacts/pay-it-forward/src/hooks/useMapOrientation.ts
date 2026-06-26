import { useState, useCallback, useRef, type RefObject } from "react";
import type mapboxgl from "mapbox-gl";

export type OrientationMode = "north-up" | "heading-up";

interface UseMapOrientationReturn {
  mode: OrientationMode;
  setMode: (mode: OrientationMode) => void;
  applyHeading: (headingDeg: number) => void;
}

/**
 * useMapOrientation
 *
 * Manages north-up vs heading-up map rotation.
 * Receives a ref to the raw mapboxgl.Map instance resolved inside effects —
 * never at render time — so it is safe even when the map is not yet mounted.
 */
export function useMapOrientation(
  mapRef: RefObject<mapboxgl.Map | null>
): UseMapOrientationReturn {
  const [mode, setModeState] = useState<OrientationMode>("heading-up");
  const lastBearingRef = useRef<number>(0);

  const setMode = useCallback((next: OrientationMode) => {
    setModeState(next);
    const map = mapRef.current;
    if (!map) return;

    if (next === "north-up") {
      map.easeTo({ bearing: 0, duration: 600, easing: (t) => t * (2 - t) });
    } else {
      map.easeTo({
        bearing: lastBearingRef.current,
        duration: 400,
        easing: (t) => t,
      });
    }
  }, [mapRef]);

  const applyHeading = useCallback((headingDeg: number) => {
    lastBearingRef.current = headingDeg;
    if (mode !== "heading-up") return;

    const map = mapRef.current;
    if (!map) return;

    const current = map.getBearing();
    const diff = Math.abs(((headingDeg - current + 540) % 360) - 180);
    if (diff < 1.5) return;

    map.easeTo({
      bearing: headingDeg,
      duration: 300,
      easing: (t) => t,
    });
  }, [mode, mapRef]);

  return { mode, setMode, applyHeading };
}
