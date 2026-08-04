---
name: Niakofa SME anatomy wiring
description: How --sme-* CSS custom properties are wired into the SVG anatomy components and which scale factors were chosen.
---

# SME Anatomy Wiring

## Rule
`--sme-eye-x` / `--sme-eye-y` are written by `useAnimationMixer.ts` **with px units** (scale × 0.4).  
CSS `translate` individual property (not `transform`) is applied to iris/pupil/catchlight in `Head.tsx/Eye` AND `FrontView.tsx/Eye`.  
CSS `rotate` individual property is applied via `<g>` wrapper in `Tail.tsx` and `Wings.tsx`.  
`BackView.tsx` has no eye (nape view — bird faces away) so no eye wiring needed.

**Why:** `translate` and `rotate` CSS individual properties compose additively on top of `transform` (used by the phase animations) without conflict. This is the safe way to layer SME kinematic output onto existing animation-driven elements.

## Scale factor
- Eye: `out.eyeX * 0.4` → px. At default `size=40` (viewBox 0 0 40 40) 1 SVG unit = 1 CSS px; at `size=64` ≈ 1.6 CSS px. Factor 0.4 gives max ±0.6px (≈38% iris radius at 64px) — subtle but visible. Tunable.
- Tail pivot: `(20px, 24px)` — fan root.
- Wing pivot: `(20px, 17px)` — wing-body joint.

## Files changed
- `Core/useAnimationMixer.ts` — writes eye vars with px units
- `Anatomy/Head.tsx` — Eye(): iris + pupil + catchlight have `translate` CSS prop
- `Anatomy/FrontView.tsx` — Eye circles (cx=29.6,cy=9.6) have `translate` CSS prop
- `Anatomy/Tail.tsx` — `<g className="sankofa-sme-tail-rig">` wraps all tail paths
- `Flight/Wings.tsx` — `<g className="sankofa-sme-wing-right-rig">` and `sankofa-sme-wing-left-rig`

## Test file
`src/lib/__tests__/sme-core.test.ts` — 45 tests: SankofaRig, MotionSolver, buildFlightState.  
Test runner: `node --import tsx/esm --test` (not jest).  
Total: 405 frontend tests, 0 failures.  
API server: 187 tests (182 pass, 5 skipped for Redis/Stripe — expected).

## DB state
All 77 migrations applied to the Replit dev DB (helium).  
Run: `node lib/db/scripts/run-migrations.mjs`  
The migration runner auto-detects a fresh DB (no users table) and applies all from 0000.
