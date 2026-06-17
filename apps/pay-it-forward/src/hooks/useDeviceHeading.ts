import { useEffect, useRef, useState } from "react";

export function useDeviceHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const smooth = useRef<number | null>(null);

  useEffect(() => {
    function handleOrientation(e: DeviceOrientationEvent) {
      const raw =
        (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
          .webkitCompassHeading ??
        (e.alpha != null ? (360 - e.alpha) % 360 : null);
      if (raw == null) return;
      smooth.current =
        smooth.current == null
          ? raw
          : smooth.current + 0.15 * angleDiff(raw, smooth.current);
      setHeading(Math.round((smooth.current + 360) % 360));
    }

    async function subscribe() {
      if (typeof DeviceOrientationEvent === "undefined") return;
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (typeof DOE.requestPermission === "function") {
        const perm = await DOE.requestPermission().catch(() => "denied");
        if (perm !== "granted") return;
      }
      window.addEventListener("deviceorientation", handleOrientation, true);
    }

    subscribe();
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, []);

  return heading;
}

function angleDiff(target: number, current: number): number {
  let d = target - current;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
