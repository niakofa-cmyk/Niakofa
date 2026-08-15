---
name: Legacy Combat System
description: Real-time + aerial combat system, Kwame atlas, and related combat scaffold — what landed and the design constraints.
---

## What shipped (commit f9a835b1)

**New lib files:**
- `src/lib/legacy-combat-system.ts` — pure TS combat state machine (ground + aerial + limb-based hit resolution). `stepCombat()` + `resolveHit()` + `applyHit()`. 24 unit tests in `legacy-combat-system.test.ts`.
- `src/lib/kwame-sprite-atlas.ts` — manifest of 47 extracted clips + 36 `KWAME_PENDING_ART_CLIPS` (no art yet). `KWAME_ATLAS_FRAMES` is a `Partial<Record<KwameClipName, string[]>>`.
- `src/lib/legacy-combat-fsm.ts` — `LegacyCombatController` extending `LegacyActorController`; SP-gated dash/heavy attack; parry window; combo staging.
- `src/lib/legacy-animation-fsm.ts` — `LegacyActorController` tick loop; `ANIM_SPEC`; `LegacyAnimState`/`LegacyFacing`.
- `src/lib/legacy-map-engine.ts` — `LegacyMapScene`/`LegacyMapLayer` types; `findNonHandDrawnLayers()` CI gate.
- `src/lib/legacy-hand-drawn-assets.ts` — `TieredAssetRecord`, `enforceArtTierPolicy()`, `HandDrawnArtRequiredError`.

**New component:**
- `src/components/KwameHeroSprite.tsx` — rAF frame stepper; renders `<img>` per frame from `KWAME_ATLAS_FRAMES`; shows labeled placeholder box for `KWAME_PENDING_ART_CLIPS`.

**Atlas frames:** `public/legacy-character-assets/kwame-mensah/atlas/` — 330 PNGs across HURT/, Hand-Drawn_Base/, RIGHT_Direction/, UP_Direction/, INSPECT/, INTERACT/, PICK_UP/, RUN_DOWN_LEFT/, RUN_UP_RIGHT/, TALK/, TALK_DOWN_LEFT/, TALK_UP_RIGHT/. Demo-quality extractions; see `ATLAS_SOURCE_NOTES.md`.

**Why:** Combat promoted from P2 to P1 per product direction. LMBS zip is reference-only; zero RPG Maker code imported. Guard blocks torso hits but NOT aerial attacks or leg sweeps — deliberate tactical design.

**Key constraint:** `invulnerable` flag must be derived from the *resulting* action (after transition), not the pre-transition one — a bug that was caught by tests and fixed in this delivery.

**No attack/jump/dash art exists yet.** `KWAME_PENDING_ART_CLIPS` names all 36 combat clip slots. `KwameHeroSprite` renders a visible placeholder box for any of them — never a silent fallback.
