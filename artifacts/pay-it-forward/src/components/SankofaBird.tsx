/**
 * SankofaBird — auto-selector
 *
 * Renders the Rive bird when `VITE_USE_RIVE_BIRD=true` is set in Replit Secrets,
 * otherwise falls back to the SVG bird. All existing call sites (map.tsx,
 * request-active.tsx, /bird-test) import from this module unchanged.
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

import { Suspense, lazy } from "react";
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

export function SankofaBird(props: SankofaBirdProps) {
  // Default path (VITE_USE_RIVE_BIRD not set): pure SVG, zero extra overhead.
  if (!USE_RIVE || !SankofaBirdRiveLazy) {
    return <SankofaBirdSvg {...props} />;
  }

  // Rive path: lazy-load the runtime on first render.
  // Suspense falls back to the SVG bird while the chunk loads (first render
  // only — subsequent renders use the cached module). The SankofaBirdRive
  // component also handles .riv load failures internally, so the SVG is
  // always the last resort if anything goes wrong.
  const RiveLazy = SankofaBirdRiveLazy;
  return (
    <Suspense fallback={<SankofaBirdSvg {...props} />}>
      <RiveLazy {...props} />
    </Suspense>
  );
}
