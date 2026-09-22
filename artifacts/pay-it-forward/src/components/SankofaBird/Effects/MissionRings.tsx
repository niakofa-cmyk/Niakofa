/**
 * SankofaBird/Effects/MissionRings.tsx
 *
 * Phase 14: Mission-complete ripple rings.
 * Three expanding gold-tinted rings representing a "pay it forward" pulse.
 */

import React from "react";
import { useBird } from "../Core/Context";

export function MissionRings(): React.ReactElement | null {
  const { missionComplete, batterySaver, size } = useBird();

  if (!missionComplete || batterySaver) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="absolute rounded-full sankofa-mission-ripple"
          style={{
            width: size * 1.8,
            height: size * 1.8,
            border: "1.5px solid rgba(245,217,138,0.75)",
            opacity: 0,
            animationDelay: `${i * 520}ms`,
          }}
        />
      ))}
    </div>
  );
}
