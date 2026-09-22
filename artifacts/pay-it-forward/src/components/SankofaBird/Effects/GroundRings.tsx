/**
 * SankofaBird/Effects/GroundRings.tsx
 *
 * Two concentric ping rings beneath the bird — pulse faster while moving.
 * Renders in the outermost container, behind the bird container.
 */

import React from "react";
import { useBird } from "../Core/Context";

export function GroundRings(): React.ReactElement {
  const { isMoving, size } = useBird();

  return (
    <>
      <div
        className="absolute rounded-full bg-primary opacity-15 animate-ping"
        style={{
          width: size,
          height: size,
          animationDuration: isMoving ? "1.2s" : "2s",
        }}
      />
      <div
        className="absolute rounded-full bg-primary opacity-25 animate-ping"
        style={{
          width: size * 0.6,
          height: size * 0.6,
          animationDuration: isMoving ? "1.2s" : "2s",
          animationDelay: "0.5s",
        }}
      />
    </>
  );
}
