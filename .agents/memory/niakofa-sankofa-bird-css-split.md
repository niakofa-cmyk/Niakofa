---
name: Niakofa SankofaBird CSS split
description: SankofaBirdSvg.tsx CSS split into sankofa-bird-css/ phase files — architecture and constraints.
---

## Rule
`SankofaBirdSvg.tsx` CSS is now split into `src/components/sankofa-bird-css/`:
- `base.ts` — `sankofaCssBase` — @property declarations, keyframes, Phase 1–2 base styles (~3,482 lines)
- `phase-3-11.ts` — `sankofaCssPhase3to11` — Phase 3–11 (beyond-Rive, consciousness, biomechanical, night-mode)
- `phase-12-13.ts` — `sankofaCssPhase12to13` — Phase 12 gaze system + Phase 13 aerodynamics
- `phase-14-19.ts` — `sankofaCssPhase14to19` — Phase 14 Living Companion through Phase 19 upright heading
- `index.ts` — exports all four + combined `sankofaBirdCss` constant

`SankofaBirdSvg.tsx` imports `sankofaBirdCss` and uses `<style>{sankofaBirdCss}</style>`.
Main file reduced from 11,472 to ~2,213 lines.

**Why:** The 11,472-line monolith was uneditable; phase-split enables targeted future edits without context overflow.

**How to apply:**
- New CSS for any phase: add to the correct phase file, do NOT add to SankofaBirdSvg.tsx directly.
- Adding a new phase file: import in `index.ts`, append to the concatenation, keep phase order.
- `prettier-ignore` comment is on each file to prevent formatter from touching CSS template literals.
- There are ZERO backticks or `${...}` interpolations in the CSS content — safe for raw template literal export.
- Phase boundaries (file-line reference at split time): Base ends before Phase 3 (line 5691), Phase 12 starts at 9208, Phase 14 starts at 10030.
