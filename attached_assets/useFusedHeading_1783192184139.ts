import { useEffect, useRef, useState } from "react";
import { useDeviceHeading } from "./useDeviceHeading";
import { smoothHeading, weightedCircularMean } from "@/lib/heading-math";

/**
 * useFusedHeading
 *
 * This is the "out of the box" fix, not just a bug patch. The previous
 * heading-up implementation used ONLY the phone's magnetometer. That's the
 * single least reliable heading source available on a moving vehicle or
 * device — magnetometers are wrecked by nearby metal, car bodies, and
 * electrical interference, which is exactly why every serious turn-by-turn
 * navigation product (Google Maps, Waze, Apple Maps) does NOT rely on the
 * compass alone while you're moving. They fuse it with GPS course-over-
 * ground, which comes from the GPS chipset comparing consecutive fixes and
 * is dramatically more stable in a car — and Niakofa's AppContext was
 * already computing this (`myLocation.heading` / `.speed`) for the "my
 * location" dot, it just was never wired into the map's orientation system.
 *
 * Fusion rule (a standard complementary filter, weighted by speed):
 *   - Below ~0.6 m/s (roughly standing still / very slow shuffle): GPS
 *     course is meaningless (undefined heading at near-zero speed), so
 *     trust the compass almost entirely. This is also the case where you
 *     actually want the compass — turning to look around while stationary.
 *   - Above ~2.5 m/s (brisk walk/jog and up, including all driving speeds):
 *     GPS course is trustworthy and far more stable than the compass, so
 *     it dominates the blend.
 *   - Between those, blend proportionally — a smooth handoff, not a snap.
 *
 * The result is smoothed again (circular EMA) so neither sensor's noise
 * leaks through, then handed to the map as a single stable heading.
 */

const GPS_TRUST_MIN_SPEED = 0.6; // m/s — below this, GPS course is unreliable
const GPS_TRUST_FULL_SPEED = 2.5; // m/s — at/above this, trust GPS course fully
const FUSED_SMOOTHING_ALPHA = 0.2;

export interface FusedHeadingInput {
  gpsHeading?: number | null;
  gpsSpeed?: number | null;
}

export function useFusedHeading(input: FusedHeadingInput): number | null {
  const compassHeading = useDeviceHeading();
  const [fused, setFused] = useState<number | null>(null);
  const fusedRef = useRef<number | null>(null);

  const { gpsHeading, gpsSpeed } = input;

  useEffect(() => {
    const hasGps = typeof gpsHeading === "number" && !Number.isNaN(gpsHeading);
    const hasCompass = typeof compassHeading === "number" && !Number.isNaN(compassHeading);

    let target: number | null = null;

    if (hasGps && hasCompass) {
      const speed = gpsSpeed ?? 0;
      const gpsWeight = Math.max(
        0,
        Math.min(1, (speed - GPS_TRUST_MIN_SPEED) / (GPS_TRUST_FULL_SPEED - GPS_TRUST_MIN_SPEED)),
      );
      target = weightedCircularMean(compassHeading, 1 - gpsWeight, gpsHeading as number, gpsWeight);
    } else if (hasGps) {
      target = gpsHeading as number;
    } else if (hasCompass) {
      target = compassHeading as number;
    }

    if (target == null) return;

    const smoothed = smoothHeading(fusedRef.current, target, FUSED_SMOOTHING_ALPHA);
    fusedRef.current = smoothed;
    setFused(smoothed);
  }, [compassHeading, gpsHeading, gpsSpeed]);

  return fused;
}
