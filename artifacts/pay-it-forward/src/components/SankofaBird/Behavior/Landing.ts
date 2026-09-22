/**
 * SankofaBird/Behavior/Landing.ts
 *
 * Landing-sequence behavior — manages the multi-stage takeoff + landing
 * state machine: idle → takeoff → flying → dive → slowflap → hover → perch → idle.
 */

import { useEffect, useRef, useState } from "react";
import type { LandingPhase } from "@/lib/sankofa-bird-math";

export type { LandingPhase };

export interface LandingState {
  landingPhase: LandingPhase;
}

/**
 * useLanding — multi-stage takeoff + landing sequence.
 *
 * Timing matches the documented cinematic sequence:
 *   Takeoff: 1200ms ramp to flying
 *   Landing: dive(600) → slowflap(800) → hover(1400) → perch(2000) → idle
 *
 * @param navigating - True while navigation is active.
 */
export function useLanding(navigating: boolean): LandingState {
  const [landingPhase, setLandingPhase] = useState<LandingPhase>(
    () => navigating ? "flying" : "idle",
  );
  const prevNavigatingRef = useRef(navigating);

  useEffect(() => {
    const wasNavigating = prevNavigatingRef.current;
    prevNavigatingRef.current = navigating;

    if (!wasNavigating && navigating) {
      setLandingPhase("takeoff");
      const t = setTimeout(() => setLandingPhase("flying"), 1200);
      return () => clearTimeout(t);
    }

    if (wasNavigating && !navigating) {
      setLandingPhase("dive");
      const t0 = setTimeout(() => setLandingPhase("slowflap"),  600);
      const t1 = setTimeout(() => setLandingPhase("hover"),    1400);
      const t2 = setTimeout(() => setLandingPhase("perch"),    2800);
      const t3 = setTimeout(() => setLandingPhase("idle"),     4800);
      return () => {
        clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      };
    }

    return undefined;
  }, [navigating]);

  return { landingPhase };
}
