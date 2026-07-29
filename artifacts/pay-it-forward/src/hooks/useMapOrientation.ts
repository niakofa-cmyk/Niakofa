import { useState, useCallback, useRef, useEffect, type RefObject } from "react";
import type * as mapboxgl from "mapbox-gl";
import { shortestDelta, stepToward } from "@/lib/heading-math";

export type OrientationMode = "north-up" | "heading-up" | "locked-north";

interface UseMapOrientationReturn {
  mode: OrientationMode;
  setMode: (mode: OrientationMode) => void;
  applyHeading: (headingDeg: number) => void;
  followPaused: boolean;
  resumeFollow: () => void;
}

export function useMapOrientation(
  mapRef: RefObject<mapboxgl.Map | null>,
): UseMapOrientationReturn {
  const [mode, setModeState] = useState<OrientationMode>("heading-up");
  const [followPaused, setFollowPaused] = useState(false);

  const targetBearingRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const modeRef = useRef(mode);
  const pausedRef = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  const MAX_DEG_PER_FRAME = 3;
  const ARRIVED_EPSILON = 0.05;

  const tick = useCallback(() => {
    const map = mapRef.current;
    if (!map || modeRef.current !== "heading-up" || pausedRef.current) {
      rafIdRef.current = null;
      return;
    }

    const current = map.getBearing();
    const delta = shortestDelta(current, targetBearingRef.current);

    if (Math.abs(delta) > ARRIVED_EPSILON) {
      const next = stepToward(current, targetBearingRef.current, MAX_DEG_PER_FRAME);
      map.jumpTo({ bearing: next });
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, [mapRef]);

  const ensureLoopRunning = useCallback(() => {
    if (rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  const setMode = useCallback((next: OrientationMode) => {
    setModeState(next);
    setFollowPaused(false);
    pausedRef.current = false;
    const map = mapRef.current;
    if (!map) return;

    map.stop();

    if (next === "north-up" || next === "locked-north") {
      map.easeTo({ bearing: 0, duration: 500, easing: (t) => t * (2 - t) });
    } else {
      ensureLoopRunning();
    }
  }, [mapRef, ensureLoopRunning]);

  const applyHeading = useCallback((headingDeg: number) => {
    targetBearingRef.current = headingDeg;
    if (modeRef.current === "heading-up" && !pausedRef.current) {
      ensureLoopRunning();
    }
  }, [ensureLoopRunning]);

  const resumeFollow = useCallback(() => {
    pausedRef.current = false;
    setFollowPaused(false);
    ensureLoopRunning();
  }, [ensureLoopRunning]);

  const ROTATE_INTENT_THRESHOLD_DEG = 8;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let gestureStartBearing = 0;
    let committed = false;

    const onRotateStart = () => {
      if (modeRef.current !== "heading-up") return;
      gestureStartBearing = map.getBearing();
      committed = false;
    };

    const onRotate = () => {
      if (modeRef.current !== "heading-up" || committed || pausedRef.current) return;
      const delta = Math.abs(shortestDelta(gestureStartBearing, map.getBearing()));
      if (delta >= ROTATE_INTENT_THRESHOLD_DEG) {
        committed = true;
        pausedRef.current = true;
        setFollowPaused(true);
      }
    };

    map.on("rotatestart", onRotateStart);
    map.on("rotate", onRotate);
    return () => {
      map.off("rotatestart", onRotateStart);
      map.off("rotate", onRotate);
    };
  }, [mapRef, mapRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return { mode, setMode, applyHeading, followPaused, resumeFollow };
}
