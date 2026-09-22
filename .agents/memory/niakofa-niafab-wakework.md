---
name: Niakofa NiaFab wake word wiring
description: Wake word detection (Phase 7a) lives in NiaDrawer.tsx exported NiaFab — NOT in the separate NiaFab.tsx file.
---

## Rule
App.tsx imports `NiaFab` and `NiaDrawer` from `@/components/NiaDrawer` (not from `@/components/NiaFab`).
There is a separate `artifacts/pay-it-forward/src/components/NiaFab.tsx` file that is NOT used by the app.

## Implication
Any wake word, indicator, or FAB behavior changes must go into the exported `NiaFab` function
at the BOTTOM of `NiaDrawer.tsx` (around line 1183+), not into the standalone `NiaFab.tsx`.

## How to apply
When modifying NiaFab behavior: edit `artifacts/pay-it-forward/src/components/NiaDrawer.tsx`,
find `export function NiaFab(...)` near the end of the file.

The `NiaFab.tsx` standalone file may be kept as a reference or deleted, but it is not rendered.

## Hook order note
`useVoiceWakeWord` must be called AFTER all other useState/useRef hooks in NiaFab to preserve
hook order across HMR cycles (see niakofa-niafab-hooks.md for the original rule).
