/**
 * SankofaBird/Behavior/Idle.ts
 *
 * Idle behavior — activity tier, blink period, and auto-saccade phase.
 *
 * Saccade model (Phase 20+):
 *   Real birds don't smoothly swivel their heads — they snap to a new fixation
 *   angle in ~60-100ms (saccade), hold dead-still for 500-1400ms (dwell),
 *   then snap again. Occasionally a quick double-take fires (~20% of snaps):
 *   a tiny pause of 150-280ms, then a second snap.
 *
 *   `saccadeSnapping` is true for the 80ms immediately after a snap fires.
 *   Renderer.tsx writes it as data-gaze-snap so CSS can suppress the ease-out
 *   transition on the head group, producing an instant jump rather than smooth
 *   tracking. After the 80ms window the attribute reverts and CSS ease-out
 *   applies to subsequent non-saccade motion.
 */

import { useEffect, useRef, useState } from "react";
import { nextSaccadePhase, type SaccadePhase } from "@/lib/sankofa-bird-math";

export type ActivityTier = "quiet" | "normal" | "busy" | "peak";

export interface IdleState {
  /** Community-activity-driven posture tier. */
  activityTier: ActivityTier;
  /** Eye blink period in ms (driven by activityTier). */
  blinkPeriodMs: number;
  /** Current 0–7 auto-saccade phase for idle gaze drift. */
  saccadePhase: SaccadePhase;
  /**
   * True for ~80ms after each saccade snap fires.
   * Renderer writes this as data-gaze-snap="true" so CSS removes the
   * ease-out transition, producing an instant jump (real bird behaviour).
   */
  saccadeSnapping: boolean;
}

// ── Dwell time ranges per activity tier (ms) ───────────────────────────────
// Busier activity → shorter dwells (more alert, quicker gaze shifts).
const DWELL_MIN: Record<ActivityTier, number> = {
  quiet:  900,
  normal: 700,
  busy:   550,
  peak:   400,
};
const DWELL_MAX: Record<ActivityTier, number> = {
  quiet:  1600,
  normal: 1200,
  busy:   900,
  peak:   700,
};

// Navigation scans are quicker than rest scans, but remain lightweight.
// Route turns, approach, nearby presence, and notifications still override
// these scans in computeGazeVector().
const NAV_DWELL_MIN: Record<ActivityTier, number> = {
  quiet:  650,
  normal: 520,
  busy:   420,
  peak:   320,
};
const NAV_DWELL_MAX: Record<ActivityTier, number> = {
  quiet:  1000,
  normal: 820,
  busy:   680,
  peak:   540,
};

// Probability of a double-take (second snap after a short micro-pause).
const DOUBLE_TAKE_PROB = 0.18;

/**
 * useIdleState — activity tier, blink period, and snap-hold-snap saccade timer.
 *
 * @param activityLevel - Community activity level 0–1.
 * @param navigating - True during active navigation.
 * @param celebrating - True during celebration reaction.
 * @param newNotification - True when a notification just arrived.
 */
export function useIdleState(
  activityLevel: number,
  navigating: boolean,
  celebrating: boolean,
  newNotification: boolean,
): IdleState {
  const activityTier: ActivityTier =
    activityLevel >= 0.85 ? "peak"   :
    activityLevel >= 0.60 ? "busy"   :
    activityLevel >= 0.20 ? "normal" : "quiet";

  const blinkPeriodMs =
    activityTier === "peak"  ? 3500 :
    activityTier === "busy"  ? 5000 :
    activityTier === "quiet" ? 9000 : 7000;

  const [saccadePhase, setSaccadePhase] = useState<SaccadePhase>(0);
  const [saccadeSnapping, setSaccadeSnapping] = useState(false);

  // Track current tier in a ref so the saccade timer always reads the latest
  // without needing to be in the dependency array (would reset the timer).
  const tierRef = useRef<ActivityTier>(activityTier);
  tierRef.current = activityTier;

  useEffect(() => {
    if (celebrating || newNotification) return;

    let cancelled = false;

    const scheduleNextSnap = (dwellMs: number) => {
      const id = setTimeout(() => {
        if (cancelled) return;

        // ── Snap: instantly set new phase (CSS transition suppressed) ──
        setSaccadeSnapping(true);
        setSaccadePhase(p => nextSaccadePhase(p));

        // Clear the snap flag after 80ms (head has jumped; ease-out can resume).
        const snapFlagId = setTimeout(() => {
          if (!cancelled) setSaccadeSnapping(false);
        }, 80);

        // ── Double-take: 18% chance of a quick second snap ──
        const doDoubleTake = Math.random() < DOUBLE_TAKE_PROB;
        if (doDoubleTake) {
          const microPause = 150 + Math.random() * 130;
          const dtId = setTimeout(() => {
            if (cancelled) return;
            setSaccadeSnapping(true);
            setSaccadePhase(p => nextSaccadePhase(p));
            setTimeout(() => { if (!cancelled) setSaccadeSnapping(false); }, 80);
            // Schedule the next regular dwell after the double-take
            const tier = tierRef.current;
            const min = navigating ? NAV_DWELL_MIN[tier] : DWELL_MIN[tier];
            const max = navigating ? NAV_DWELL_MAX[tier] : DWELL_MAX[tier];
            scheduleNextSnap(min + Math.random() * (max - min));
          }, microPause);
          // Cleanup for the double-take timer is handled by the outer cancelled flag.
          void dtId;
        } else {
          // Schedule next snap after dwell
          const tier = tierRef.current;
          const min = navigating ? NAV_DWELL_MIN[tier] : DWELL_MIN[tier];
          const max = navigating ? NAV_DWELL_MAX[tier] : DWELL_MAX[tier];
          scheduleNextSnap(min + Math.random() * (max - min));
        }

        void snapFlagId;
      }, dwellMs);
      return id;
    };

    // Initial dwell before first snap (randomised so birds don't sync)
    const tier = tierRef.current;
    const min = navigating ? NAV_DWELL_MIN[tier] : DWELL_MIN[tier];
    const max = navigating ? NAV_DWELL_MAX[tier] : DWELL_MAX[tier];
    const initialDwell = min + Math.random() * (max - min);
    const id = scheduleNextSnap(initialDwell);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [navigating, celebrating, newNotification]); // NOT saccadePhase — timer is self-scheduling

  return { activityTier, blinkPeriodMs, saccadePhase, saccadeSnapping };
}
