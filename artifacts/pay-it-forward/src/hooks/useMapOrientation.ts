import { useState, useCallback, useRef, useEffect, type RefObject } from "react";
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
 * Manages north-up vs heading-up map rotation using a single continuous
 * requestAnimationFrame loop that chases a target bearing at a capped
 * angular velocity (deg/sec), always taking the shortest path across the
 * 0°/360° boundary.
 *
 * This replaces the old approach of calling map.easeTo() on every heading
 * update, which stacked competing animations and produced visible jumps —
 * each new easeTo() canceled the previous one mid-flight.
 */

const TURN_RATE_DEG_PER_SEC = 180;
const SNAP_THRESHOLD_DEG = 0.3;

export function useMapOrientation(
  mapRef: RefObject<mapboxgl.Map | null>
): UseMapOrientationReturn {
  const [mode, setModeState] = useState<OrientationMode>("heading-up");
  const targetBearingRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const now = performance.now();
    const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0;
    lastFrameRef.current = now;

    const current = map.getBearing();
    const target = targetBearingRef.current;
    const diff = ((target - current + 540) % 360) - 180;

    if (Math.abs(diff) > SNAP_THRESHOLD_DEG) {
      const maxStep = TURN_RATE_DEG_PER_SEC * dt;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
      map.setBearing((current + step + 360) % 360);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [mapRef]);

  useEffect(() => {
    if (mode === "heading-up") {
      lastFrameRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      stopLoop();
    }
    return stopLoop;
  }, [mode, tick, stopLoop]);

  const setMode = useCallback((next: OrientationMode) => {
    setModeState(next);
    const map = mapRef.current;
    if (!map) return;

    if (next === "north-up") {
      stopLoop();
      map.easeTo({ bearing: 0, duration: 600, easing: (t) => t * (2 - t) });
    }
    // heading-up: the rAF loop (re-armed by the effect above) takes over
    // smoothly from whatever bearing the map is currently at.
  }, [mapRef, stopLoop]);

  const applyHeading = useCallback((headingDeg: number) => {
    targetBearingRef.current = headingDeg;
  }, []);

  return { mode, setMode, applyHeading };
}
