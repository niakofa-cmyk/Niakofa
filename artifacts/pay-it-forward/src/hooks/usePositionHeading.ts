import { useEffect, useRef, useState } from "react";
import { computeBearingDeg, haversineDistanceMeters, smoothHeading } from "@/lib/heading-math";

/**
 * usePositionHeading
 *
 * Third and final fallback tier in the Sankofa Bird heading pipeline —
 * derives a real-world heading purely from consecutive GPS fixes (lat/lon),
 * with no dependency on the compass (`useDeviceHeading`) or on the GPS
 * chipset's own course-over-ground field (`coords.heading`).
 *
 * ── Why a third tier is necessary ────────────────────────────────────────
 * `useFusedHeading` already blends compass + `coords.heading`, but BOTH can
 * be null simultaneously for long stretches of real usage:
 *   • Desktop / laptop browsers never expose `deviceorientation` — no compass.
 *   • iOS 13+ requires an explicit `DeviceOrientationEvent.requestPermission()`
 *     prompt that Niakofa doesn't currently trigger, so `useDeviceHeading`
 *     silently returns null on iPhone until that's wired up.
 *   • `coords.heading` is defined by the Geolocation spec to be null "if the
 *     implementation cannot provide it" — in practice this means null at
 *     rest AND on many Android devices even while moving slowly, since the
 *     chipset only derives course confidently above a device-specific speed
 *     floor.
 * When both are null, `useFusedHeading` returns null, `heading` reaching
 * SankofaBirdSvg is null, `hasHeading` is false, and the bird's entire
 * directional system (facing flip, bank, head-lead, neck curve, gaze) goes
 * idle — this is the actual mechanism behind "the bird only ever faces one
 * direction."
 *
 * A bearing computed directly from two GPS fixes needs nothing but the
 * Geolocation API itself (available on every browser Niakofa supports) and
 * is therefore the one heading source that's *always* eventually available
 * once the user has moved at all — making it the correct final fallback.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 * ```tsx
 * const positionHeading = usePositionHeading(myLocation?.lat, myLocation?.lng);
 * const heading = fusedHeading ?? myLocation?.heading ?? positionHeading ?? null;
 * ```
 */

const MIN_MOVEMENT_METERS = 3; // below this, treat as GPS jitter — don't derive a bearing
const HEADING_SMOOTHING_ALPHA = 0.35;

export function usePositionHeading(
  lat: number | null | undefined,
  lon: number | null | undefined,
): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const lastFixRef = useRef<{ lat: number; lon: number } | null>(null);
  const smoothedRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
      return;
    }

    const prev = lastFixRef.current;
    lastFixRef.current = { lat, lon };

    if (prev === null) return; // need a second fix to derive a bearing

    const distance = haversineDistanceMeters(prev.lat, prev.lon, lat, lon);
    if (distance < MIN_MOVEMENT_METERS) return; // GPS jitter — don't rotate the bird on noise

    const bearing = computeBearingDeg(prev.lat, prev.lon, lat, lon);
    const smoothed = smoothHeading(smoothedRef.current, bearing, HEADING_SMOOTHING_ALPHA);
    smoothedRef.current = smoothed;
    setHeading(smoothed);
  }, [lat, lon]);

  return heading;
}
