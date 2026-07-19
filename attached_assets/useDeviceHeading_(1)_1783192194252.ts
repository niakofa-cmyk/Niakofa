import { useState, useEffect, useRef } from "react";
import { smoothHeading } from "@/lib/heading-math";

/**
 * useDeviceHeading
 *
 * Returns the device's MAGNETOMETER compass heading in degrees (0–360, true
 * north = 0), or null if unsupported/unavailable. This is one input into
 * navigation heading — see useFusedHeading for the version that also blends
 * in GPS course-over-ground, which is what actually fixes the "jumping"
 * heading-up bug for anyone moving (walking or driving).
 *
 * Fixes applied vs. the previous version (root causes of the reported bug):
 *
 * 1. DOUBLE LISTENERS: the old code registered BOTH `deviceorientationabsolute`
 *    AND `deviceorientation` at the same time. On Android devices that fire
 *    both, two slightly different heading values race each other on every
 *    tick, producing visible snapping between the two readings. Fixed: we
 *    listen for both but LATCH onto whichever one fires first each session
 *    and ignore the other — never mix sources mid-stream.
 *
 * 2. NO SCREEN-ORIENTATION COMPENSATION: raw `alpha` is relative to the
 *    device's natural (portrait) orientation. If the OS has rotated the
 *    screen (landscape lock, auto-rotate), the heading is off by whatever
 *    `screen.orientation.angle` is — and it SNAPS by that amount the instant
 *    the OS flips orientation. Fixed: we subtract `screen.orientation.angle`
 *    from the Android/Chrome (non-webkit) path.
 *
 * 3. NO SMOOTHING: raw magnetometer readings are noisy (±2–8° is normal,
 *    worse near cars/metal/indoors) and were being pushed straight into
 *    React state on every single event — often 30–60 times/second. Fixed:
 *    circular (mod-360-safe) exponential smoothing + a small time-based
 *    throttle, so consumers get a stable value, not raw sensor noise.
 */

declare global {
  interface DeviceOrientationEvent {
    webkitCompassHeading?: number;
  }
  interface DeviceOrientationEventConstructor {
    requestPermission?: () => Promise<"granted" | "denied" | "default">;
  }
}

const SMOOTHING_ALPHA = 0.25;
const MIN_UPDATE_INTERVAL_MS = 50; // ~20Hz ceiling — plenty smooth, far less churn

export function useDeviceHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);
  const sourceLatchedRef = useRef<"webkit" | "absolute" | "relative" | null>(null);

  useEffect(() => {
    let active = true;

    function commit(raw: number) {
      const now = performance.now();
      if (now - lastUpdateRef.current < MIN_UPDATE_INTERVAL_MS) return;
      lastUpdateRef.current = now;
      const smoothed = smoothHeading(smoothedRef.current, raw, SMOOTHING_ALPHA);
      smoothedRef.current = smoothed;
      setHeading(smoothed);
    }

    function handleOrientation(e: DeviceOrientationEvent) {
      if (!active) return;

      // iOS Safari: webkitCompassHeading is already true-north-referenced,
      // clockwise, and NOT subject to screen-orientation drift the way
      // alpha is. Always prefer it and latch this as the session's source.
      if (typeof e.webkitCompassHeading === "number") {
        if (sourceLatchedRef.current && sourceLatchedRef.current !== "webkit") return;
        sourceLatchedRef.current = "webkit";
        commit(e.webkitCompassHeading);
        return;
      }

      if (e.alpha == null) return;

      // Screen-orientation compensation: alpha is relative to the device's
      // natural orientation, not the current on-screen orientation. Without
      // this, rotating the phone (or the OS auto-rotating) causes an instant
      // 90°/180°/270° jump in the reported heading.
      const screenAngle =
        typeof screen !== "undefined" && screen.orientation?.angle != null
          ? screen.orientation.angle
          : 0;
      const compensated = (360 - e.alpha + screenAngle) % 360;

      const thisSource = e.absolute ? "absolute" : "relative";
      // Prefer whichever fires first; once latched, ignore the other event
      // type so we never blend two different reference frames mid-stream.
      if (sourceLatchedRef.current && sourceLatchedRef.current !== thisSource) return;
      sourceLatchedRef.current = thisSource;
      commit(compensated);
    }

    async function start() {
      const DC = DeviceOrientationEvent as unknown as DeviceOrientationEventConstructor;
      if (typeof DC.requestPermission === "function") {
        try {
          const perm = await DC.requestPermission();
          if (perm !== "granted") return;
        } catch {
          return;
        }
      }

      // Register both — handleOrientation itself latches onto the first
      // source that actually fires and ignores the other from then on, so
      // this is safe even on devices/browsers that fire both event types.
      window.addEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
      window.addEventListener("deviceorientation", handleOrientation as EventListener, true);
    }

    start();

    return () => {
      active = false;
      window.removeEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
      window.removeEventListener("deviceorientation", handleOrientation as EventListener, true);
    };
  }, []);

  return heading;
}
