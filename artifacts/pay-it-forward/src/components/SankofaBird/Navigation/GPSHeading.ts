/**
 * SankofaBird/Navigation/GPSHeading.ts
 *
 * GPS heading system — converts raw GPS heading + map bearing into
 * a screen-relative rotation, with cumulative unwrapping to prevent
 * 0°↔360° CSS-transition snaps during U-turns.
 */

import { useRef } from "react";
import { computeScreenRotation } from "@/lib/sankofa-bird-math";

export interface GPSHeadingState {
  /** True when heading is a valid finite number. */
  hasHeading: boolean;
  /** Screen-relative heading in degrees (0–360). */
  screenRotationDeg: number;
  /** Cumulative unwrapped heading ref (prevents U-turn snap). */
  cumulativeHeadingRef: React.RefObject<number | null>;
  /** Previous screen-rotation ref for delta computation. */
  prevScreenRotForSvgRef: React.RefObject<number | null>;
}

/**
 * useGPSHeading — computes screen-relative rotation and maintains
 * cumulative heading unwrapping for smooth U-turn animations.
 *
 * Called synchronously during render (ref mutation pattern — safe).
 *
 * @param heading - World-frame heading in degrees (0 = north), or null.
 * @param mapBearing - Current map camera bearing in degrees.
 */
export function useGPSHeading(
  heading: number | null,
  mapBearing: number,
): GPSHeadingState {
  // Refs must be declared unconditionally.
  const cumulativeHeadingRef   = useRef<number | null>(null);
  const prevScreenRotForSvgRef = useRef<number | null>(null);

  const hasHeading = typeof heading === "number" && !Number.isNaN(heading);
  const screenRotationDeg = hasHeading
    ? computeScreenRotation(heading as number, mapBearing)
    : 0;

  // Synchronous ref update during render — safe ref mutation (not state).
  // The bird SVG is drawn facing LEFT in SVG coords. Rotating by
  // (screenRotationDeg + 90°) calibrates it so heading=0 puts the head up.
  if (hasHeading) {
    if (cumulativeHeadingRef.current === null || prevScreenRotForSvgRef.current === null) {
      cumulativeHeadingRef.current = screenRotationDeg;
    } else {
      // Shortest-path delta: 359°→1° adds +2°, not -358°.
      let delta = screenRotationDeg - prevScreenRotForSvgRef.current;
      if (delta >  180) delta -= 360;
      if (delta < -180) delta += 360;
      cumulativeHeadingRef.current += delta;
    }
    prevScreenRotForSvgRef.current = screenRotationDeg;
  } else {
    // Lost GPS — reset so next navigation start is fresh.
    prevScreenRotForSvgRef.current = null;
    cumulativeHeadingRef.current   = null;
  }

  return {
    hasHeading,
    screenRotationDeg,
    cumulativeHeadingRef,
    prevScreenRotForSvgRef,
  };
}
