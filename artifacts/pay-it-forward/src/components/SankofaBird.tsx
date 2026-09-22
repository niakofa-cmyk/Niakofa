/**
 * SankofaBird — auto-selector + auto battery-saver + nav-session LOD
 *
 * Renders the Rive bird when `VITE_USE_RIVE_BIRD=true` is set in Replit Secrets,
 * otherwise falls back to the SVG bird. All existing call sites (map.tsx,
 * request-active.tsx, /bird-test) import from this module unchanged.
 *
 * ── Auto Battery Saver ───────────────────────────────────────────────────
 * When the device battery is < 20% AND not charging, LOD3 (batterySaver) mode
 * activates automatically — no user action needed. Uses the Battery Status API
 * (Chrome / Edge; gracefully ignored on Safari / Firefox). Merges with the
 * external `batterySaver` prop so either source can activate the mode.
 *
 * Also auto-activates after 20+ continuous minutes of navigating=true — protects
 * older phones during long navigation sessions without requiring battery API.
 *
 * ── Auto navLod ───────────────────────────────────────────────────────────
 * Tracks elapsed navigating time and automatically escalates navLodOverride:
 *   0–9 min  → LOD 0 (full quality)
 *  10–29 min → LOD 1 (dimmed feather/particle overlays, ~4% GPU reduction)
 *  30+ min   → LOD 2 (skeletal silhouette only, ~11% GPU reduction)
 * Caller-supplied navLodOverride always takes precedence.
 *
 * ── Activating Rive ──────────────────────────────────────────────────────
 *  1. Create `sankofa-bird.riv` following `public/SANKOFA_BIRD_RIVE_SPEC.md`
 *  2. Place the file at `artifacts/pay-it-forward/public/sankofa-bird.riv`
 *  3. Add `VITE_USE_RIVE_BIRD=true` to Replit Secrets
 *  4. Restart the web workflow — Rive activates automatically on next build
 *
 * When VITE_USE_RIVE_BIRD is false (default), the Rive runtime is not bundled,
 * keeping the default build slim. The SankofaBirdRive component handles its own
 * load-failure fallback internally (missing/corrupt .riv → SVG silently).
 *
 * ── Prop API ─────────────────────────────────────────────────────────────
 * Unchanged — both renderers implement the same SankofaBirdProps interface.
 * See SankofaBirdSvg.tsx for the full prop documentation.
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { SankofaBirdSvg, type SankofaBirdProps } from "./SankofaBirdSvg";

// Re-export the type so existing callers that import SankofaBirdProps from
// "@/components/SankofaBird" continue to compile without changes.
export type { SankofaBirdProps };

// ── Build-time flag ───────────────────────────────────────────────────────
// Vite replaces import.meta.env.VITE_* with the literal value at build time,
// so when VITE_USE_RIVE_BIRD is not "true" this entire branch is dead code
// and the Rive lazy chunk is not emitted at all.
const USE_RIVE = import.meta.env.VITE_USE_RIVE_BIRD === "true";

// Lazy-load the Rive renderer only when the flag is enabled.
// When VITE_USE_RIVE_BIRD=false (the default), Vite tree-shakes this import
// and the @rive-app/react-canvas runtime (~120 KB gzipped) never hits users.
const SankofaBirdRiveLazy = USE_RIVE
  ? lazy(() =>
      import("./SankofaBirdRive").then(m => ({ default: m.SankofaBirdRive }))
    )
  : null;

// ── BatteryManager interface (Chrome Battery Status API) ─────────────────
// Not part of the standard TypeScript lib — defined here to avoid a
// dependency on @types/w3c-battery-status which may not be installed.
interface BatteryManager extends EventTarget {
  readonly level: number;
  readonly charging: boolean;
}

/**
 * useAutoBatterySaver
 *
 * Monitors device battery via the Battery Status API and returns `true` when
 * the battery is low (< 20 %) and not charging. Merges with an external prop
 * so either source can activate battery-saver mode independently.
 *
 * Graceful degradation:
 *  - Safari / Firefox: navigator.getBattery is undefined → returns externalProp
 *  - Battery API unavailable (strict mode, permission denied): returns externalProp
 *  - All event listeners cleaned up on unmount to prevent memory leaks.
 *
 * Threshold: 20 % matches Android's "Battery Saver activates at 20 %" default,
 * making the bird's LOD3 behaviour consistent with the system's own battery intent.
 */
function useAutoBatterySaver(externalBatterySaver = false): boolean {
  const [autoBattery, setAutoBattery] = useState(false);

  useEffect(() => {
    // Battery Status API — Chrome / Edge only; Safari / Firefox ignore gracefully.
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };
    if (typeof nav.getBattery !== "function") return;

    let bm: BatteryManager | null = null;

    // Arrow function closure avoids the unsafe `this: BatteryManager` typed method
    // pattern that required an `as EventListener` cast. The closure captures `bm`
    // and reads level/charging from the stable BatteryManager reference.
    const onBatteryEvent = () => {
      if (bm) setAutoBattery(!bm.charging && bm.level < 0.20);
    };

    nav
      .getBattery()
      .then((battery: BatteryManager) => {
        bm = battery;
        // Evaluate immediately so the initial render already reflects battery state.
        setAutoBattery(!battery.charging && battery.level < 0.20);
        battery.addEventListener("levelchange", onBatteryEvent);
        battery.addEventListener("chargingchange", onBatteryEvent);
      })
      .catch(() => {
        // Permission denied or API not available — no-op, externalBatterySaver still applies.
      });

    return () => {
      if (bm) {
        bm.removeEventListener("levelchange", onBatteryEvent);
        bm.removeEventListener("chargingchange", onBatteryEvent);
      }
    };
  }, []);

  return externalBatterySaver || autoBattery;
}

// ── Navigation session duration tracking ─────────────────────────────────
// Tracks how many continuous minutes the bird has been in navigating=true.
// Used to:
//   a) Auto-escalate navLodOverride (LOD quality step-down for long drives)
//   b) Auto-trigger batterySaver after 20 continuous navigating minutes on any
//      device — protects older phones that the Battery Status API can't detect.
//
// LOD escalation matches the bird-test NavLodSimDemo thresholds:
//   0–9 min  → LOD 0  (full quality)
//  10–29 min → LOD 1  (~4 % GPU reduction — dimmed feather/particle overlays)
//  30+ min   → LOD 2  (~11 % GPU reduction — skeletal silhouette only)
function useNavigationSessionLod(navigating: boolean, externalLod?: 0 | 1 | 2): {
  navLodOverride: 0 | 1 | 2;
  sessionBatterySaver: boolean;
} {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigating) {
      // Reset session when navigation stops.
      startTimeRef.current = null;
      setElapsedMinutes(0);
      return;
    }
    // Navigation started — record start time.
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    // Tick every 60 s to update elapsed minutes.
    const id = window.setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedMinutes(Math.floor((Date.now() - startTimeRef.current) / 60_000));
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [navigating]);

  const autoLod: 0 | 1 | 2 =
    elapsedMinutes >= 30 ? 2 : elapsedMinutes >= 10 ? 1 : 0;

  return {
    // Caller-supplied navLodOverride always wins; auto-LOD is the floor.
    navLodOverride: externalLod !== undefined ? externalLod : autoLod,
    // Auto-trigger battery saver after 20 min regardless of battery level.
    sessionBatterySaver: elapsedMinutes >= 20,
  };
}

export function SankofaBird(props: SankofaBirdProps) {
  // Always call hooks before any conditional returns (Rules of Hooks).
  // useAutoBatterySaver is unconditional regardless of USE_RIVE.
  const effectiveBatterySaver = useAutoBatterySaver(props.batterySaver);
  const { navLodOverride: autoNavLod, sessionBatterySaver } = useNavigationSessionLod(
    !!props.navigating,
    props.navLodOverride as 0 | 1 | 2 | undefined,
  );

  // Merge auto-detected battery state with the incoming prop.
  // When auto-detected OR prop is true OR 20-min session elapsed → LOD3.
  const mergedProps: SankofaBirdProps = {
    ...props,
    batterySaver: effectiveBatterySaver || sessionBatterySaver,
    navLodOverride: autoNavLod,
  };

  // Default path (VITE_USE_RIVE_BIRD not set): pure SVG, zero extra overhead.
  if (!USE_RIVE || !SankofaBirdRiveLazy) {
    return <SankofaBirdSvg {...mergedProps} />;
  }

  // Rive path: lazy-load the runtime on first render.
  // Suspense falls back to the SVG bird while the chunk loads (first render
  // only — subsequent renders use the cached module). The SankofaBirdRive
  // component also handles .riv load failures internally, so the SVG is
  // always the last resort if anything goes wrong.
  const RiveLazy = SankofaBirdRiveLazy;
  return (
    <Suspense fallback={<SankofaBirdSvg {...mergedProps} />}>
      <RiveLazy {...mergedProps} />
    </Suspense>
  );
}
