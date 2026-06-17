import { useCallback, useRef, useState } from "react";
import type { Map } from "mapbox-gl";

export type OrientationMode = "heading-up" | "north-up";

const PITCH_3D = 55;
const PITCH_2D = 0;
const EASE_MS  = 200;

export function useMapOrientation(mapRef: React.RefObject<Map | null>) {
  const [mode, setModeState] = useState<OrientationMode>("north-up");
  const modeRef = useRef<OrientationMode>("north-up");

  const setMode = useCallback((next: OrientationMode) => {
    modeRef.current = next;
    setModeState(next);
    const map = mapRef.current;
    if (!map) return;
    if (next === "north-up") {
      map.easeTo({ bearing: 0, pitch: PITCH_2D, duration: EASE_MS });
    } else {
      map.easeTo({ pitch: PITCH_3D, duration: EASE_MS });
    }
  }, [mapRef]);

  const applyHeading = useCallback((bearing: number) => {
    if (modeRef.current !== "heading-up") return;
    const map = mapRef.current;
    if (!map) return;
    map.rotateTo(bearing, { duration: 150, easing: (t) => t });
  }, [mapRef]);

  return { mode, setMode, applyHeading };
}
