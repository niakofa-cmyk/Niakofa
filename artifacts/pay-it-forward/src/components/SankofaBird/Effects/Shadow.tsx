import React from "react";
import { useBird } from "../Core/Context";

/** Dynamic ground shadow ellipse (altitude illusion) + ambient glow layer. */
export function Shadow(): React.ReactElement {
  const { isGliding, isMoving, speedMs, landingPhase } = useBird();
  return (
    <>
            <ellipse
              className="sankofa-bird-shadow"
              cx="20"
              cy="39.5"
              rx={isGliding ? 10
                : isMoving ? 7 + Math.min(speedMs * 0.25, 3)
                : (landingPhase === "hover" || landingPhase === "slowflap") ? 8
                : landingPhase === "perch" ? 6.5
                : landingPhase === "dive" ? 7.5
                : 5}
              ry={isGliding ? 0.7
                : isMoving ? 0.9
                : (landingPhase === "hover" || landingPhase === "slowflap") ? 1.1
                : landingPhase === "perch" ? 1.25
                : landingPhase === "dive" ? 1.0
                : 1.4}
              fill="rgba(0,0,0,0.22)"
              style={{
                transition: "rx 0.6s ease-out, ry 0.6s ease-out",
                filter: "blur(1px)",
              }}
            />

            {/* Ambient glow layer — blurred ellipse behind all feathers and body.
                CSS animates its opacity when navigating, celebrating, or donating. */}
            <ellipse
              className="sankofa-glow-layer"
              cx="20" cy="21"
              rx="13" ry="11"
              fill="hsl(190, 100%, 55%)"
              opacity={0}
              style={{ filter: "blur(4px)" }}
            />
    </>
  );
}
