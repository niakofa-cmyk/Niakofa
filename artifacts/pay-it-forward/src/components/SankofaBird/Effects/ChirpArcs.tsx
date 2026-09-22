/**
 * SankofaBird/Effects/ChirpArcs.tsx
 *
 * Phase 14: Chirp DOM arc rings.
 * Three small expanding circles near the beak — convey sound wave character.
 *
 * Note: these are DOM <div> rings in the outer container.
 * The SVG chirp-ring-1/2/3 circles are a separate component (Anatomy/Head.tsx).
 */

import React from "react";
import { useBird } from "../Core/Context";

export function ChirpArcs(): React.ReactElement | null {
  const { chirp, batterySaver, size } = useBird();

  if (!chirp || batterySaver) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="absolute rounded-full sankofa-chirp-arc-ring"
          style={{
            width: size * (0.6 + i * 0.28),
            height: size * (0.6 + i * 0.28),
            border: "1px solid rgba(0,212,255,0.65)",
            opacity: 0,
            animationDelay: `${i * 140}ms`,
          }}
        />
      ))}
    </div>
  );
}
