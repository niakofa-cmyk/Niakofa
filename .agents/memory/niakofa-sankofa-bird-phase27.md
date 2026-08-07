---
name: Niakofa SankofaBird Phase 27
description: Living Feathers & Natural Light contract and verification baseline.
---

# Niakofa SankofaBird Phase 27

Phase 27 is the current verified SankofaBird build baseline. It is an additive CSS/SVG composition layer: new feather and lighting layers must not take over transform channels owned by `useAnimationMixer`.

**Why:** The phase contract is intentionally separated from the mixer so feather articulation, night readability, iridescence, and aerodynamic lighting can evolve without breaking flight physics or heading behavior.

**How to apply:** Keep the `sankofa-bird-css/index.ts` barrel ending with `sankofaCssPhase27`. Preserve all four Safari registrations (`--p27-iri-hue`, `--p27-shoulder-angle`, `--p27-neck-mid-opacity`, `--p27-ambient-opacity`), keep `WingtipFeathers` inside the right/left wing rigs in `Wings.tsx`, and run the Phase 27 contract test after CSS/SVG changes.