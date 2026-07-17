import { useState, useCallback, useRef, useEffect, type RefObject } from "react";
import type mapboxgl from "mapbox-gl";
import { shortestDelta, stepToward } from "@/lib/heading-math";

export type OrientationMode = "north-up" | "heading-up";

interface UseMapOrientationReturn {
  mode: OrientationMode;
  setMode: (mode: OrientationMode) => void;
  applyHeading: (headingDeg: number) => void;
  /** True when the user manually rotated the map — auto-follow is paused. */
  followPaused: boolean;
  /** Re-enable heading-follow after a manual rotate (shown as a HUD button). */
  resumeFollow: () => void;
}

/**
 * useMapOrientation
 *
 * Root cause of the original "jumping/malfunctioning" bug: `applyHeading`
 * called `map.easeTo({ bearing, duration: 300 })` directly from a React
 * effect that ran on EVERY heading update (potentially 20+ times/second).
 * Mapbox's `easeTo` starts a brand-new tweened animation each call — so a
 * new 300ms animation was kicked off before the previous one finished,
 * over and over, each one interrupting the last mid-flight. That interrupt-
 * and-restart cycle IS the visible jump/stutter; it's not a rendering glitch,
 * it's dozens of competing animations fighting for the same property.
 *
 * Fix: decouple "new heading arrived" from "map camera moves." Heading
 * updates just record a target. A single requestAnimationFrame loop, running
 * at display refresh rate, continuously steps the camera's actual bearing
 * toward that target at a capped angular velocity (deg/frame). One
 * animation driver, never competing with itself, and visually silky because
 * it's frame-locked instead of event-locked.
 *
 * Also fixes: map fighting the user's own rotate gesture. Real navigation
 * apps (Google Maps, Waze) pause heading-follow the instant you manually
 * rotate the map, and show a small "resume compass" affordance rather than
 * snapping back on the next sensor tick. We listen for Mapbox's own
 * `rotatestart` (drag-rotate / two-finger twist) to detect that.
 */
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

  // Max angular speed the auto-follow camera is allowed to rotate at, in
  // degrees per frame at ~60fps → ~180°/sec ceiling. Fast enough to keep up
  // with a car turning a corner, slow enough to never feel like a snap.
  const MAX_DEG_PER_FRAME = 3;
  // Below this delta we consider the camera "arrived" — avoids a
  // never-quite-zero float creeping the animation loop forever.
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
      // setBearing (via jumpTo) is a direct, cheap camera write — no tween
      // queue, so it can never "stack" with itself the way easeTo did.
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

    // Stop any in-flight camera animation before taking over — prevents the
    // stale-hangover jump that happened when a previous easeTo() was still
    // finishing when the mode switch fired.
    map.stop();

    if (next === "north-up") {
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

  // Detect the user manually grabbing the map (drag-rotate or two-finger
  // twist) and pause auto-follow so we don't fight their fingers. Mapbox
  // fires `rotatestart` only for user-initiated rotation, never for our own
  // jumpTo/easeTo calls, so this can't self-trigger.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onRotateStart = () => {
      if (modeRef.current !== "heading-up") return;
      pausedRef.current = true;
      setFollowPaused(true);
    };

    map.on("rotatestart", onRotateStart);
    return () => { map.off("rotatestart", onRotateStart); };
    // mapRef.current identity can change after the map first mounts, so this
    // effect intentionally re-runs whenever the caller re-renders post-load
    // (cheap no-op re-subscribe if already attached to the same instance).
  }, [mapRef, mapRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return { mode, setMode, applyHeading, followPaused, resumeFollow };
}
