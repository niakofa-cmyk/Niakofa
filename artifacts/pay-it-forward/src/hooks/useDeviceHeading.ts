import { useState, useEffect } from "react";

/**
 * useDeviceHeading
 *
 * Returns the device's compass heading in degrees (0–360, true north = 0),
 * or null if the device doesn't support orientation events.
 *
 * On iOS 13+ we must request permission before reading DeviceOrientationEvent.
 * We do this lazily on the first user gesture that calls requestPermission().
 */

declare global {
  interface DeviceOrientationEvent {
    webkitCompassHeading?: number;
  }
  interface DeviceOrientationEventConstructor {
    requestPermission?: () => Promise<"granted" | "denied" | "default">;
  }
}

export function useDeviceHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    function handleOrientation(e: DeviceOrientationEvent) {
      if (!active) return;

      // iOS: webkitCompassHeading is already absolute clockwise from north
      if (typeof e.webkitCompassHeading === "number") {
        setHeading(e.webkitCompassHeading);
        return;
      }

      // Android/Chrome: alpha is counter-clockwise from north
      if (e.absolute && e.alpha != null) {
        setHeading((360 - e.alpha) % 360);
        return;
      }

      if (e.alpha != null) {
        setHeading((360 - e.alpha) % 360);
      }
    }

    async function start() {
      const DC = DeviceOrientationEvent as DeviceOrientationEventConstructor;
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
