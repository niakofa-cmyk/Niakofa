/**
 * SankofaBird/Effects/Particles.tsx
 *
 * DOM-layer celebration / notification particle effects:
 *  - Heart pulse ring (single expanding ring on celebrating)
 *  - Teal particle burst (8 outward dots on celebrating)
 *  - Golden sparkle particles (6 rotating diamonds on donated)
 */

import React from "react";
import { useBird } from "../Core/Context";

export function Particles(): React.ReactElement | null {
  const { celebrating, donated, size } = useBird();

  return (
    <>
      {celebrating && (
        <div
          className="absolute rounded-full border-2 border-primary sankofa-heart-pulse pointer-events-none"
          style={{ width: size * 1.3, height: size * 1.3 }}
        />
      )}

      {celebrating && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
            <div
              key={deg}
              className="absolute w-1 h-1 rounded-full bg-primary sankofa-particle"
              style={{
                "--deg": `${deg}deg`,
                animationDelay: `${deg * 2}ms`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {donated && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[0, 60, 120, 180, 240, 300].map(deg => (
            <div
              key={deg}
              className="absolute sankofa-golden-sparkle"
              style={{
                "--deg": `${deg}deg`,
                width: size * 0.12,
                height: size * 0.12,
                background: "#f5d98a",
                borderRadius: "2px",
                animationDelay: `${deg * 3}ms`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}
    </>
  );
}
