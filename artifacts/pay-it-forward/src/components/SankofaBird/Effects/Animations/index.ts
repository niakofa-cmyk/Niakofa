/**
 * SankofaBird/Effects/Animations/index.ts
 *
 * Re-exports from the canonical CSS source at components/sankofa-bird-css/.
 *
 * WHY THIS FILE EXISTS:
 *   Renderer.tsx imports `{ sankofaBirdCss }` from "../Effects/Animations".
 *   The canonical CSS source lives in components/sankofa-bird-css/ (one level
 *   above SankofaBird/) because it was split out from the monolith in a
 *   previous refactor. This shim keeps the import path stable so Renderer.tsx
 *   does not need to change when new phases are added.
 *
 * HOW TO ADD A NEW PHASE:
 *   1. Create `components/sankofa-bird-css/phase-NN.ts`
 *   2. Export it from `components/sankofa-bird-css/index.ts`
 *   3. Add it to the `sankofaBirdCss` concatenation in that same index.ts
 *   4. This file picks up the new phase automatically — no changes needed here.
 *
 * DO NOT add CSS directly here. Edit the phase files in sankofa-bird-css/.
 */

// Relative path from SankofaBird/Effects/Animations/ up to components/:
//   ../../.. = SankofaBird/Effects/ → SankofaBird/ → components/
export {
  sankofaBirdCss,
  sankofaCssBase,
  sankofaCssPhase3to11,
  sankofaCssPhase12to13,
  sankofaCssPhase14to19,
  sankofaCssPhase20,
  sankofaCssPhase21,
  sankofaCssPhase22,
  sankofaCssPhase23,
  sankofaCssPhase24,
} from "../../../sankofa-bird-css";
