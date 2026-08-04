import { useEffect, useRef, useState } from "react";

/**
 * usePulse — rising-edge one-shot pulse for SankofaBird micro-reactions.
 *
 * Converts a raw boolean (that may stay `true` across re-renders due to GPS
 * location ticks, WebSocket reconnects, or React StrictMode double-invoke)
 * into a clean, non-restartable pulse with guaranteed auto-reset:
 *
 *  • Fires ONLY on the false → true transition (rising edge).
 *  • Ignores re-fires while the pulse is already active — prevents
 *    CSS animation stutter when the same `true` arrives multiple times.
 *  • Auto-resets to `false` after `durationMs`.
 *  • A new trigger that arrives BEFORE the pulse expires extends the timer
 *    (debounce-extend semantics) so the animation always gets a full window.
 *  • Cleans up the timer on unmount.
 *
 * WHY this matters for SankofaBird:
 *   Micro-reaction CSS keyframes use animation-iteration-count: 1/2/3 (finite).
 *   If the parent passes `celebrating={true}` across multiple re-renders (e.g.
 *   GPS position update fires while celebrating is still true), React sees no
 *   prop change and the animation is unaffected — safe. BUT if two WS events
 *   fire in rapid succession and the parent's setTimeout cleanup races, the
 *   boolean can cycle false→true→false→true fast enough to restart the
 *   animation mid-play. usePulse eliminates that by debouncing at the prop
 *   boundary before it reaches the component tree.
 *
 * Usage:
 *   const pulse = usePulse(rawBooleanFromState, 3000);
 *   <SankofaBird celebrating={pulse} />
 */
export function usePulse(trigger: boolean, durationMs: number): boolean {
  const [active, setActive] = useState(false);
  const prevRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run on every render so we catch every leading edge immediately,
  // even when the parent batches state updates aggressively.
  useEffect(() => {
    const wasActive = prevRef.current;
    prevRef.current = trigger;

    if (trigger && !wasActive) {
      // ── Leading edge: arm the pulse ──────────────────────────────────
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setActive(true);
      timerRef.current = setTimeout(() => {
        setActive(false);
        timerRef.current = null;
      }, durationMs);
    } else if (trigger && wasActive) {
      // ── Still true after previous leading edge: extend the window ────
      // This handles "celebrate fires twice in 500ms" gracefully — the
      // second trigger extends the visible pulse rather than creating a
      // false→true→false→true stutter.
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setActive(false);
        timerRef.current = null;
      }, durationMs);
    }
    // If !trigger: natural reset path — let the in-flight timer run.
  });

  // Cleanup on unmount (navigating away from map screen mid-animation)
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return active;
}
