/**
 * SankofaBird/Effects/ParticleTrail.tsx
 *
 * Speed-tiered trailing particle system.
 */

import React from "react";
import { useBird } from "../Core/Context";
import { getSpeedTier } from "@/lib/sankofa-bird-math";

export function ParticleTrail(): React.ReactElement | null {
  const { isMoving, landingPhase, speedMs, size } = useBird();

  const showTrail =
    isMoving ||
    landingPhase === "slowflap" ||
    landingPhase === "dive" ||
    landingPhase === "takeoff";

  if (!showTrail) return null;

  const tier = getSpeedTier(speedMs);

  let particles: React.ReactElement[];

  if (tier === "airplane") {
    particles = [0, 1].map(i => (
      <div
        key={i}
        className="absolute bg-primary sankofa-trail"
        style={{
          width:          size * (0.28 - i * 0.06),
          height:         size * 0.025,
          borderRadius:   "3px",
          left:           size * (0.22 + i * 0.18),
          top:            size * (0.76 + i * 0.04),
          opacity:        0.6 - i * 0.12,
          animationDelay: `${i * 80}ms`,
        }}
      />
    ));
  } else if (tier === "driving") {
    particles = [0, 1, 2, 3].map(i => (
      <div
        key={i}
        className="absolute bg-primary sankofa-trail"
        style={{
          width:          size * 0.055,
          height:         size * 0.028,
          borderRadius:   "2px",
          left:           size * (0.28 + i * 0.12),
          top:            size * 0.78,
          opacity:        0.58 - i * 0.08,
          animationDelay: `${i * 110}ms`,
        }}
      />
    ));
  } else if (tier === "running") {
    particles = [0, 1, 2].map(i => (
      <div
        key={i}
        className="absolute bg-primary sankofa-trail"
        style={{
          width:          size * 0.1,
          height:         size * 0.055,
          borderRadius:   "50%",
          left:           size * (0.32 + i * 0.13),
          top:            size * 0.79,
          opacity:        0.75 - i * 0.15,
          animationDelay: `${i * 160}ms`,
        }}
      />
    ));
  } else {
    particles = [0, 1, 2].map(i => (
      <div
        key={i}
        className="absolute bg-primary sankofa-trail"
        style={{
          width:          size * 0.075,
          height:         size * 0.075,
          borderRadius:   "50%",
          left:           size * (0.38 + i * 0.09),
          top:            size * 0.80,
          opacity:        0.55 - i * 0.1,
          animationDelay: `${i * 240}ms`,
        }}
      />
    ));
  }

  return <>{particles}</>;
}
