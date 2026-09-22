/**
 * useHeadingWithHold
 *
 * FORENSIC FINDING (why the bird looks "stuck facing left")
 * ------------------------------------------------------------------------
 * The rig itself (SankofaBirdSvg.tsx) is not the problem. It already
 * implements a genuinely complete 360° kinematic system, no Rive/Unity
 * required:
 *   - Phase 17 (~line 514 of SankofaBirdSvg.tsx): head-lead, neck S-curve,
 *     body twist, vertical gaze tilt, turn intensity, and a horizontal
 *     scaleX(-1) body flip that mirrors the whole bird + re-signs every
 *     bank-driven rotation so it reads correctly post-mirror.
 *   - Phase 12 (~line 213 of sankofa-bird-math.ts): an idle auto-saccade
 *     that cycles the gaze through all 8 compass points (left, upleft, up,
 *     upright, right, downright, down, downleft) every 3-6 s whenever the
 *     bird isn't navigating/celebrating — this runs independent of heading.
 *
 * All of that is driven by one input: the `heading` prop. And in real
 * usage, `heading` is null far more often than you'd expect:
 *
 *   1. Geolocation's `coords.heading` is only populated by the browser
 *      while the device is actively moving above a small speed threshold.
 *      A user standing still looking at the map gets `heading: null` from
 *      GPS, full stop — that's the spec, not a bug.
 *   2. The compass (DeviceOrientationEvent) is the fallback for #1, but on
 *      iOS 13+ it requires `requestPermission()` to be called from inside
 *      a real tap handler (see `requestOrientationPermission()` in
 *      useDeviceHeading.ts / OrientationToggle). Until a user finds and
 *      taps that control, the compass silently returns nothing — no
 *      prompt, no data, ever.
 *   3. AppContext.tsx already holds the last GPS heading across small
 *      movements (< 3 m) instead of nulling it — that part is solid. But
 *      there's no equivalent hold at the *component* level for the
 *      compass-unavailable + not-yet-moved-3m case, which is exactly the
 *      state most first-time / stationary users are in.
 *
 * Net effect: `hasHeading` in SankofaBirdSvg flips to `false`, so
 * `screenRotationDeg` resets to 0 and `facingRight` resets to false —
 * i.e. the rig correctly falls back to its default identity pose, which
 * happens to be the left-facing artwork. It's not stuck; it genuinely has
 * no directional data for a large fraction of real sessions.
 *
 * THE FIX
 * ------------------------------------------------------------------------
 * Wrap whatever heading value you're already computing (e.g.
 * `fusedHeading ?? myLocation?.heading ?? null` in map.tsx) with this hook
 * instead of passing it to <SankofaBird> directly. It:
 *
 *   - Passes fresh non-null headings straight through immediately (no
 *     added latency while actually receiving data).
 *   - On a null reading, holds the last known-good heading for
 *     `holdMs` (default 12 s) instead of collapsing to null — covers GPS
 *     dropouts, momentary compass gaps, and brief signal loss without the
 *     bird snapping back to its identity pose mid-turn.
 *   - Only reports null once the hold window has genuinely expired with
 *     no new reading (or on first mount, before any heading has ever
 *     arrived) — at that point the existing Phase 12 idle saccade takes
 *     over and keeps the bird visibly alive (looking around) even with
 *     zero directional data, which is the correct fallback already built
 *     into the rig.
 *
 * USAGE (map.tsx)
 * ------------------------------------------------------------------------
 *   // before:
 *   heading={orientMode === "locked-north" ? 0 : (fusedHeading ?? myLocation?.heading ?? null)}
 *
 *   // after:
 *   const rawHeading = orientMode === "locked-north" ? 0 : (fusedHeading ?? myLocation?.heading ?? null);
 *   const heldHeading = useHeadingWithHold(rawHeading);
 *   ...
 *   heading={heldHeading}
 *
 * Nothing else changes — same prop, same type (`number | null`), same
 * consumer. This only smooths *when* null gets reported, never fabricates
 * a heading that wasn't real.
 */
import { useEffect, useRef, useState } from "react";

const DEFAULT_HOLD_MS = 12_000;

export function useHeadingWithHold(
  rawHeading: number | null,
  holdMs: number = DEFAULT_HOLD_MS
): number | null {
  const [held, setHeld] = useState<number | null>(rawHeading);
  const lastGoodRef = useRef<number | null>(rawHeading);
  const lastGoodAtRef = useRef<number>(rawHeading != null ? Date.now() : 0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (rawHeading != null && !Number.isNaN(rawHeading)) {
      // Fresh reading — pass through immediately and reset the hold clock.
      lastGoodRef.current = rawHeading;
      lastGoodAtRef.current = Date.now();
      setHeld(rawHeading);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Null reading. If we have nothing to hold onto (first mount, no
    // heading ever received), there's nothing to smooth — report null
    // immediately so the rig's idle saccade (Phase 12) takes over.
    if (lastGoodRef.current == null) {
      setHeld(null);
      return;
    }

    // We have a last-known-good heading — keep showing it until holdMs
    // has elapsed since it was last confirmed fresh, rather than dropping
    // to null (and the bird's identity pose) on every momentary gap.
    const elapsed = Date.now() - lastGoodAtRef.current;
    const remaining = holdMs - elapsed;

    if (remaining <= 0) {
      lastGoodRef.current = null;
      setHeld(null);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      lastGoodRef.current = null;
      lastGoodAtRef.current = 0;
      setHeld(null);
    }, remaining);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [rawHeading, holdMs]);

  return held;
}
