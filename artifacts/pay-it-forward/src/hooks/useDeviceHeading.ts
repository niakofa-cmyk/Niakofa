import { useState, useEffect, useRef } from "react";

/**
 * useDeviceHeading
 *
 * Returns the device's compass heading in degrees (0–360, true north = 0),
 * or null if the device doesn't support orientation events.
 *
 * Raw magnetometer data is noisy (several degrees of jitter even when
 * stationary), so we apply circular exponential smoothing and throttle
 * emitted updates to ~8/sec — plenty for visual map rotation, and far less
 * likely to fight with the map's own animation loop.
 */

declare global {
  interface DeviceOrientationEvent {
    webkitCompassHeading?: number;
  }
}
interface DeviceOrientationEventConstructor {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

const SMOOTHING = 0.15;
const UPDATE_INTERVAL_MS = 120;

function circularSmooth(prev: number | null, next: number, alpha: number): number {
  if (prev == null) return next;
  const diff = ((next - prev + 540) % 360) - 180;
  return (prev + diff * alpha + 360) % 360;
}

export function useDeviceHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const lastEmitRef = useRef<number>(0);

  useEffect(() => {
    let active = true;

    function handleOrientation(e: DeviceOrientationEvent) {
      if (!active) return;

      let raw: number | null = null;
      if (typeof e.webkitCompassHeading === "number") {
        raw = e.webkitCompassHeading;
      } else if (e.alpha != null) {
        raw = (360 - e.alpha) % 360;
      }
      if (raw == null) return;

      smoothedRef.current = circularSmooth(smoothedRef.current, raw, SMOOTHING);

      const now = performance.now();
      if (now - lastEmitRef.current >= UPDATE_INTERVAL_MS) {
        lastEmitRef.current = now;
        setHeading(smoothedRef.current);
      }
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
